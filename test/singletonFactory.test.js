/**
 * Tests for singleton factory
 */

jest.mock('../src/shared/logger', () => {
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
  return { logger, createLogger: jest.fn(() => logger) };
});

const { createSingletonHelpers } = require('../src/shared/singletonFactory');

describe('singletonFactory', () => {
  // Test service class
  class TestService {
    constructor(options = {}) {
      this.options = options;
      this.shutdownCalled = false;
    }

    async shutdown() {
      this.shutdownCalled = true;
    }
  }

  let helpers;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create fresh helpers for each test (container will fail to load, using local fallback)
    helpers = createSingletonHelpers({
      ServiceClass: TestService,
      serviceId: 'TEST_SERVICE',
      serviceName: 'TestService',
      containerPath: './nonexistent-container', // Intentionally nonexistent to test fallback
      shutdownMethod: 'shutdown'
    });
  });

  describe('getInstance', () => {
    test('creates local instance when container not available', () => {
      const instance = helpers.getInstance();

      expect(instance).toBeInstanceOf(TestService);
      expect(helpers.getLocalInstance()).toBe(instance);
    });

    test('returns same instance on subsequent calls', () => {
      const instance1 = helpers.getInstance();
      const instance2 = helpers.getInstance();

      expect(instance1).toBe(instance2);
    });

    test('passes options to constructor', () => {
      const instance = helpers.getInstance({ customOption: true });

      expect(instance.options).toEqual({ customOption: true });
    });
  });

  describe('createInstance', () => {
    test('creates new instance each time', () => {
      const instance1 = helpers.createInstance();
      const instance2 = helpers.createInstance();

      expect(instance1).toBeInstanceOf(TestService);
      expect(instance2).toBeInstanceOf(TestService);
      expect(instance1).not.toBe(instance2);
    });

    test('passes options to constructor', () => {
      const instance = helpers.createInstance({ custom: 'value' });

      expect(instance.options).toEqual({ custom: 'value' });
    });
  });

  describe('registerWithContainer', () => {
    test('registers singleton with container', () => {
      const mockContainer = {
        registerSingleton: jest.fn()
      };

      helpers.registerWithContainer(mockContainer, 'test-service');

      expect(mockContainer.registerSingleton).toHaveBeenCalledWith(
        'test-service',
        expect.any(Function)
      );
    });

    test('is idempotent - only registers once', () => {
      const mockContainer = {
        registerSingleton: jest.fn()
      };

      helpers.registerWithContainer(mockContainer, 'test-service');
      helpers.registerWithContainer(mockContainer, 'test-service');

      expect(mockContainer.registerSingleton).toHaveBeenCalledTimes(1);
    });

    test('factory migrates local instance to container', () => {
      const mockContainer = {
        registerSingleton: jest.fn()
      };

      // Create local instance first
      const localInstance = helpers.getInstance();

      // Register with container
      helpers.registerWithContainer(mockContainer, 'test-service');

      // Get the factory function
      const factoryFn = mockContainer.registerSingleton.mock.calls[0][1];
      const containerInstance = factoryFn();

      // Should return the same local instance
      expect(containerInstance).toBe(localInstance);

      // Local instance should be cleared
      expect(helpers.getLocalInstance()).toBeNull();
    });

    test('factory creates new instance if no local instance', () => {
      const mockContainer = {
        registerSingleton: jest.fn()
      };

      helpers.registerWithContainer(mockContainer, 'test-service');

      const factoryFn = mockContainer.registerSingleton.mock.calls[0][1];
      const instance = factoryFn();

      expect(instance).toBeInstanceOf(TestService);
    });
  });

  describe('resetInstance', () => {
    test('clears local instance', async () => {
      helpers.getInstance(); // Create local instance
      expect(helpers.getLocalInstance()).not.toBeNull();

      await helpers.resetInstance();

      expect(helpers.getLocalInstance()).toBeNull();
    });

    test('calls shutdown on local instance', async () => {
      const instance = helpers.getInstance();

      await helpers.resetInstance();

      expect(instance.shutdownCalled).toBe(true);
    });

    test('resets container registration flag', async () => {
      const mockContainer = {
        registerSingleton: jest.fn()
      };

      helpers.registerWithContainer(mockContainer, 'test-service');
      expect(helpers.isContainerRegistered()).toBe(true);

      await helpers.resetInstance();

      expect(helpers.isContainerRegistered()).toBe(false);
    });

    test('handles missing shutdown method gracefully', async () => {
      class NoShutdownService {
        constructor() {}
      }

      const noShutdownHelpers = createSingletonHelpers({
        ServiceClass: NoShutdownService,
        serviceId: 'TEST_SERVICE',
        serviceName: 'NoShutdownService',
        containerPath: './nonexistent',
        shutdownMethod: 'shutdown'
      });

      noShutdownHelpers.getInstance();

      // Should not throw
      await expect(noShutdownHelpers.resetInstance()).resolves.not.toThrow();
    });

    test('handles shutdown errors gracefully', async () => {
      class ErrorService {
        async shutdown() {
          throw new Error('Shutdown failed');
        }
      }

      const errorHelpers = createSingletonHelpers({
        ServiceClass: ErrorService,
        serviceId: 'TEST_SERVICE',
        serviceName: 'ErrorService',
        containerPath: './nonexistent',
        shutdownMethod: 'shutdown'
      });

      errorHelpers.getInstance();

      // Should not throw
      await expect(errorHelpers.resetInstance()).resolves.not.toThrow();
    });
  });

  describe('custom factory', () => {
    test('uses custom factory for instance creation', () => {
      const customFactory = jest.fn((options) => new TestService({ ...options, custom: true }));

      const customHelpers = createSingletonHelpers({
        ServiceClass: TestService,
        serviceId: 'TEST_SERVICE',
        serviceName: 'CustomService',
        containerPath: './nonexistent',
        createFactory: customFactory
      });

      const instance = customHelpers.getInstance({ extra: 'option' });

      expect(customFactory).toHaveBeenCalledWith({ extra: 'option' });
      expect(instance.options).toEqual({ extra: 'option', custom: true });
    });
  });

  describe('different shutdown methods', () => {
    test('supports cleanup method', async () => {
      class CleanupService {
        constructor() {
          this.cleanupCalled = false;
        }
        async cleanup() {
          this.cleanupCalled = true;
        }
      }

      const cleanupHelpers = createSingletonHelpers({
        ServiceClass: CleanupService,
        serviceId: 'TEST_SERVICE',
        serviceName: 'CleanupService',
        containerPath: './nonexistent',
        shutdownMethod: 'cleanup'
      });

      const instance = cleanupHelpers.getInstance();
      await cleanupHelpers.resetInstance();

      expect(instance.cleanupCalled).toBe(true);
    });
  });
});
