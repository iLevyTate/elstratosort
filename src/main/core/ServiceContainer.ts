/**
 * ServiceContainer - Dependency Injection Container
 * Manages service lifecycle, dependencies, and health monitoring
 */
import { logger } from '../../shared/logger';
import { EventEmitter } from 'events';

logger.setContext('ServiceContainer');

/**
 * Service lifecycle states
 */
const ServiceState = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  FAILED: 'failed',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
};

/**
 * Service registration configuration
 */
class ServiceRegistration {
  name: string;
  factory: (dependencies: any, container: any) => any;
  dependencies: string[];
  singleton: boolean;
  lazy: boolean;
  healthCheckInterval?: number;
  instance: any;
  state: string;
  error: Error | null;
  lastHealthCheck: any;
  healthCheckTimer: NodeJS.Timeout | null;

  constructor(name: string, factory: (dependencies: any, container: any) => any, options: any = {}) {
    this.name = name;
    this.factory = factory; // Function that creates the service instance
    this.dependencies = options.dependencies || [];
    this.singleton = options.singleton !== false; // Default to singleton
    this.lazy = options.lazy !== false; // Default to lazy initialization
    this.healthCheckInterval = options.healthCheckInterval || 60000; // 1 minute default
    this.instance = null;
    this.state = ServiceState.UNINITIALIZED;
    this.error = null;
    this.lastHealthCheck = null;
    this.healthCheckTimer = null;
  }
}

class ServiceContainer extends EventEmitter {
  services: Map<string, ServiceRegistration>;
  initializationOrder: string[];
  isShuttingDown: boolean;

  constructor() {
    super();
    this.services = new Map(); // name -> ServiceRegistration
    this.initializationOrder = []; // Track initialization order for proper shutdown
    this.isShuttingDown = false;
  }

  /**
   * Register a service with the container
   * @param name - Unique service name
   * @param factory - Factory function that creates the service
   * @param options - Configuration options
   * @returns - For method chaining
   */
  register(name: string, factory: (dependencies: Record<string, unknown>, container: ServiceContainer) => unknown, options: { dependencies?: string[]; singleton?: boolean; lazy?: boolean; healthCheckInterval?: number } = {}): ServiceContainer {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    if (typeof factory !== 'function') {
      throw new Error(`Factory for service '${name}' must be a function`);
    }

    const registration = new ServiceRegistration(name, factory, options);
    this.services.set(name, registration);

    logger.info(`[ServiceContainer] Registered service: ${name}`, {
      dependencies: registration.dependencies,
      singleton: registration.singleton,
      lazy: registration.lazy,
    });

    return this; // Enable chaining
  }

  /**
   * Get a service instance
   * Automatically initializes the service and its dependencies if needed
   * @param name - Service name
   * @returns - Service instance
   */
  async get<T = unknown>(name: string): Promise<T> {
    const registration = this.services.get(name);

    if (!registration) {
      throw new Error(`Service '${name}' is not registered`);
    }

    // Return existing instance for singletons
    if (registration.singleton && registration.instance) {
      if (registration.state === ServiceState.READY) {
        return registration.instance;
      } else if (registration.state === ServiceState.INITIALIZING) {
        // Wait for initialization to complete
        return this._waitForInitialization(name);
      } else if (registration.state === ServiceState.FAILED) {
        throw new Error(
          `Service '${name}' failed to initialize: ${registration.error?.message}`
        );
      }
    }

    // Initialize the service
    return this._initializeService(name);
  }

  /**
   * Wait for a service to finish initializing
   * @param name - Service name
   * @returns - Service instance
   * @private
   */
  async _waitForInitialization(name: string): Promise<unknown> {
    const registration = this.services.get(name);
    if (!registration) {
      throw new Error(`Service '${name}' is not registered`);
    }
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();

    while (registration.state === ServiceState.INITIALIZING) {
      if (Date.now() - startTime > maxWait) {
        throw new Error(`Timeout waiting for service '${name}' to initialize`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (registration.state === ServiceState.READY) {
      return registration.instance;
    } else {
      throw new Error(
        `Service '${name}' failed to initialize: ${registration.error?.message}`
      );
    }
  }

  /**
   * Initialize a service and its dependencies
   * @param name - Service name
   * @returns - Service instance
   * @private
   */
  async _initializeService(name: string): Promise<unknown> {
    const registration = this.services.get(name);
    if (!registration) {
      throw new Error(`Service '${name}' is not registered`);
    }

    if (registration.state === ServiceState.INITIALIZING) {
      return this._waitForInitialization(name);
    }

    registration.state = ServiceState.INITIALIZING;

    try {
      logger.info(`[ServiceContainer] Initializing service: ${name}`);

      // Initialize dependencies first
      const dependencies: Record<string, unknown> = {};
      for (const depName of registration.dependencies) {
        logger.debug(`[ServiceContainer] Resolving dependency: ${depName} for ${name}`);
        dependencies[depName] = await this.get(depName);
      }

      // Create service instance
      const instance = await registration.factory(dependencies, this);

      // If service has an initialize method, call it
      if (instance && typeof (instance as { initialize?: () => Promise<void> }).initialize === 'function') {
        logger.debug(`[ServiceContainer] Calling initialize() for ${name}`);
        await (instance as { initialize: () => Promise<void> }).initialize();
      }

      registration.instance = instance;
      registration.state = ServiceState.READY;
      registration.error = null;

      // Track initialization order for proper shutdown
      if (!this.initializationOrder.includes(name)) {
        this.initializationOrder.push(name);
      }

      // Start health checks if service supports them
      this._startHealthChecks(name);

      logger.info(`[ServiceContainer] Service initialized: ${name}`);
      this.emit('service:ready', { name, instance });

      return instance;
    } catch (error: unknown) {
      registration.state = ServiceState.FAILED;
      registration.error = error instanceof Error ? error : new Error(String(error));

      logger.error(`[ServiceContainer] Failed to initialize service: ${name}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      this.emit('service:failed', { name, error });

      throw error;
    }
  }

  /**
   * Start periodic health checks for a service
   * @param name - Service name
   * @private
   */
  _startHealthChecks(name: string): void {
    const registration = this.services.get(name);
    if (!registration) return;

    const instance = registration.instance as { healthCheck?: () => Promise<boolean> } | null;
    if (!instance || typeof instance.healthCheck !== 'function') {
      return; // Service doesn't support health checks
    }

    // Clear existing timer if any
    if (registration.healthCheckTimer) {
      clearInterval(registration.healthCheckTimer);
    }

    // Run initial health check
    this._runHealthCheck(name);

    // Schedule periodic checks
    registration.healthCheckTimer = setInterval(() => {
      this._runHealthCheck(name);
    }, registration.healthCheckInterval);

    // Unref timer so it doesn't prevent process exit
    if (registration.healthCheckTimer.unref) {
      registration.healthCheckTimer.unref();
    }
  }

  /**
   * Run a health check for a service
   * @param name - Service name
   * @private
   */
  async _runHealthCheck(name: string): Promise<void> {
    const registration = this.services.get(name);
    if (!registration) return;

    const instance = registration.instance as { healthCheck?: () => Promise<boolean> } | null;
    if (!instance || registration.state !== ServiceState.READY) {
      return;
    }

    try {
      const isHealthy = await instance.healthCheck!();
      registration.lastHealthCheck = {
        timestamp: Date.now(),
        healthy: isHealthy,
      };

      if (!isHealthy) {
        logger.warn(`[ServiceContainer] Health check failed for service: ${name}`);
        this.emit('service:unhealthy', { name, registration });
      }
    } catch (error: unknown) {
      logger.error(`[ServiceContainer] Health check error for service: ${name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      registration.lastHealthCheck = {
        timestamp: Date.now(),
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
      this.emit('service:unhealthy', { name, registration, error });
    }
  }

  /**
   * Get the state of a service
   * @param name - Service name
   * @returns - Service state information
   */
  getServiceState(name: string): { name: string; state: string; dependencies: string[]; singleton: boolean; lazy: boolean; lastHealthCheck: unknown; error: string | undefined; hasInstance: boolean } | null {
    const registration = this.services.get(name);

    if (!registration) {
      return null;
    }

    return {
      name,
      state: registration.state,
      dependencies: registration.dependencies,
      singleton: registration.singleton,
      lazy: registration.lazy,
      lastHealthCheck: registration.lastHealthCheck,
      error: registration.error?.message,
      hasInstance: !!registration.instance,
    };
  }

  /**
   * Get the state of all services
   * @returns - Array of service states
   */
  getAllServiceStates(): Array<{ name: string; state: string; dependencies: string[]; singleton: boolean; lazy: boolean; lastHealthCheck: unknown; error: string | undefined; hasInstance: boolean } | null> {
    const states: Array<{ name: string; state: string; dependencies: string[]; singleton: boolean; lazy: boolean; lastHealthCheck: unknown; error: string | undefined; hasInstance: boolean } | null> = [];
    for (const [name] of this.services) {
      states.push(this.getServiceState(name));
    }
    return states;
  }

  /**
   * Check if a service is registered
   * @param name - Service name
   * @returns
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Check if a service is ready
   * @param name - Service name
   * @returns
   */
  isReady(name: string): boolean {
    const registration = this.services.get(name);
    return registration?.state === ServiceState.READY;
  }

  /**
   * Initialize all registered services that are not lazy
   * @returns
   */
  async initializeAll(): Promise<void> {
    logger.info('[ServiceContainer] Initializing all non-lazy services');

    const promises: Promise<unknown>[] = [];
    for (const [name, registration] of this.services) {
      if (!registration.lazy && registration.state === ServiceState.UNINITIALIZED) {
        promises.push(this.get(name));
      }
    }

    await Promise.all(promises);

    logger.info('[ServiceContainer] All non-lazy services initialized', {
      count: promises.length,
    });
  }

  /**
   * Gracefully shutdown all services
   * @returns
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('[ServiceContainer] Shutdown already in progress');
      return;
    }
    this.isShuttingDown = true;
    logger.info('[ServiceContainer] Starting graceful shutdown');

    // Stop all health checks first
    for (const registration of this.services.values()) {
      if (registration.healthCheckTimer) {
        clearInterval(registration.healthCheckTimer);
        registration.healthCheckTimer = null;
      }
    }

    // Shutdown services in reverse initialization order
    const shutdownOrder = [...this.initializationOrder].reverse();

    for (const name of shutdownOrder) {
      const registration = this.services.get(name);
      if (!registration) continue;

      const instance = registration.instance as { shutdown?: () => Promise<void>; cleanup?: () => Promise<void>; close?: () => Promise<void> } | null;
      if (!instance || registration.state !== ServiceState.READY) {
        continue;
      }

      try {
        registration.state = ServiceState.STOPPING;

        logger.info(`[ServiceContainer] Shutting down service: ${name}`);

        // Call cleanup/shutdown methods if they exist
        if (typeof instance.shutdown === 'function') {
          await instance.shutdown();
        } else if (typeof instance.cleanup === 'function') {
          await instance.cleanup();
        } else if (typeof instance.close === 'function') {
          await instance.close();
        }

        registration.state = ServiceState.STOPPED;
        registration.instance = null;

        logger.info(`[ServiceContainer] Service stopped: ${name}`);
        this.emit('service:stopped', { name });
      } catch (error: unknown) {
        logger.error(`[ServiceContainer] Error shutting down service: ${name}`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        this.emit('service:error', { name, error });
      }
    }
    this.initializationOrder = [];
    this.isShuttingDown = false;

    logger.info('[ServiceContainer] Graceful shutdown complete');
    this.emit('container:shutdown');
  }

  /**
   * Reset the container (for testing)
   */
  reset(): void {
    this.services.clear();
    this.initializationOrder = [];
    this.isShuttingDown = false;
    this.removeAllListeners();
  }
}

// Export singleton instance
const container = new ServiceContainer();

export { ServiceContainer, ServiceState, container };
