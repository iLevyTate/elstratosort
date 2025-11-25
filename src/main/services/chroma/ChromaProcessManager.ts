import { logger } from '../../../shared/logger';
import { ChromaClient } from 'chromadb';
import * as path from 'path';
import * as fs from 'fs/promises';
import axios from 'axios';

interface ChromaProcessOptions {
  userDataPath?: string;
  serverUrl?: string;
  ignoreMissingPath?: boolean;
}

class ChromaProcessManager {
  private userDataPath: string;
  private dbPath: string;
  private serverUrl: string;
  private client: any;
  private isOnline: boolean;
  private healthCheckInterval: NodeJS.Timeout | null;
  private readonly HEALTH_CHECK_INTERVAL_MS: number;

  constructor(options: ChromaProcessOptions = {}) {
    this.userDataPath = this._resolveUserDataPath(options);
    this.dbPath = path.join(this.userDataPath, 'chromadb');
    this.serverUrl = this._resolveServerUrl(options);
    this.client = null;
    this.isOnline = false;
    this.healthCheckInterval = null;
    this.HEALTH_CHECK_INTERVAL_MS = 30000;
  }

  private _resolveUserDataPath(options: ChromaProcessOptions): string {
    let userDataPath = options.userDataPath;
    if (!userDataPath) {
      try {
        // Dynamic import of electron to avoid bundling issues
        const { app } = require('electron');
        userDataPath = app.getPath('userData');
      } catch (e) {
        if (!options.ignoreMissingPath) {
          logger.warn('[ChromaProcessManager] Electron app not available and no userDataPath provided.');
        }
        userDataPath = process.env.USER_DATA_PATH || process.cwd();
      }
    }
    return userDataPath;
  }

  private _resolveServerUrl(_options: ChromaProcessOptions): string {
    const DEFAULT_SERVER_PROTOCOL = 'http';
    const DEFAULT_SERVER_HOST = '127.0.0.1';
    const DEFAULT_SERVER_PORT = 8000;

    // Environment variable parsing logic
    return process.env.CHROMA_SERVER_URL || `${DEFAULT_SERVER_PROTOCOL}://${DEFAULT_SERVER_HOST}:${DEFAULT_SERVER_PORT}`;
  }

  async ensureDbDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.dbPath, { recursive: true });
    } catch (error) {
      logger.error('[ChromaProcessManager] Failed to create database directory:', error);
      throw error;
    }
  }

  async initializeClient(): Promise<any> {
    await this.ensureDbDirectory();
    this.client = new ChromaClient({ path: this.serverUrl });
    return this.client;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const baseUrl = this.serverUrl;
      const endpoints = ['/api/v2/heartbeat', '/api/v1/heartbeat', '/api/v1'];

      const healthCheckPromises = endpoints.map(async (endpoint) => {
        try {
          const response = await axios.get(`${baseUrl}${endpoint}`, {
            timeout: 500,
            validateStatus: () => true
          });
          return response.status === 200 ? endpoint : null;
        } catch (error: any) {
          logger.debug(`[ChromaProcessManager] Health check failed for ${endpoint}`, {
            error: error.message,
          });
          return null;
        }
      });

      const results = await Promise.all(healthCheckPromises);
      const successfulEndpoint = results.find(r => r !== null);

      if (successfulEndpoint) {
        if (!this.isOnline) {
          logger.info('[ChromaProcessManager] Connection restored/established');
          this.isOnline = true;
        }
        return true;
      }

      if (this.client) {
        try {
          const response = await this.client.heartbeat();
          const isHealthy = response && (response.nanosecond_heartbeat > 0 || response['nanosecond heartbeat'] > 0);
          if (isHealthy && !this.isOnline) {
            this.isOnline = true;
            logger.info('[ChromaProcessManager] Connection restored via client');
          }
          return isHealthy;
        } catch (error: any) {
          logger.debug('[ChromaProcessManager] Client heartbeat failed', {
            error: error.message,
          });
        }
      }

      if (this.isOnline) {
        logger.warn('[ChromaProcessManager] Connection lost');
        this.isOnline = false;
      }
      return false;
    } catch (error: any) {
      if (this.isOnline) {
        this.isOnline = false;
        logger.warn('[ChromaProcessManager] Connection lost due to error:', error.message);
      }
      return false;
    }
  }

  startHealthCheck(): void {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    this.checkHealth().catch((error: any) => {
      logger.warn('[ChromaProcessManager] Initial health check failed', {
        error: error.message,
      });
    });
    this.healthCheckInterval = setInterval(() => this.checkHealth().catch((error: any) => {
      logger.debug('[ChromaProcessManager] Periodic health check failed', {
        error: error.message,
      });
    }), this.HEALTH_CHECK_INTERVAL_MS);
    if (this.healthCheckInterval.unref) this.healthCheckInterval.unref();
  }

  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  cleanup(): void {
    this.stopHealthCheck();
    this.client = null;
    this.isOnline = false;
  }
}

export default ChromaProcessManager;
