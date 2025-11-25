/**
 * Model Verification Service for AI-First Operations
 * Ensures required Ollama models are available before analysis
 */
import { Ollama } from 'ollama';
import { logger } from '../../shared/logger';
import { DEFAULT_AI_MODELS } from '../../shared/constants';
import { fetchWithRetry } from '../utils/ollamaApiRetry';
import { buildOllamaOptions } from './PerformanceService';

logger.setContext('ModelVerifier');

interface ModelTest {
  model: string;
  type: string;
  success: boolean;
  response?: string;
  error?: string;
}

interface ConnectionResult {
  connected: boolean;
  error?: string;
  suggestion?: string;
}

interface ModelsResult {
  success: boolean;
  models: Array<{ name: string }>;
  total: number;
  error?: string;
}

interface VerificationResult {
  success: boolean;
  availableModels: string[];
  missingModels: string[];
  hasWhisper: boolean;
  installationCommands: string[];
  recommendations: Array<{
    type: string;
    message: string;
    action: string | null;
  }>;
  error?: string;
  details?: any;
}

interface FunctionalityResult {
  success: boolean;
  tests: ModelTest[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
  error?: string;
}

interface SystemStatus {
  timestamp: string;
  connection: ConnectionResult;
  models: VerificationResult;
  functionality: FunctionalityResult;
  overall: {
    healthy: boolean;
    issues: string[];
  };
}

class ModelVerifier {
  ollamaHost: string;
  ollama: Ollama;
  essentialModels: string[];
  recommendedModels: string[];

  constructor() {
    this.ollamaHost = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    this.ollama = new Ollama({ host: this.ollamaHost });
    this.essentialModels = [
      DEFAULT_AI_MODELS.TEXT_ANALYSIS, // llama3.2:latest (2GB)
      DEFAULT_AI_MODELS.IMAGE_ANALYSIS, // llava:latest (4.7GB)
      'mxbai-embed-large', // For semantic search
    ];
    this.recommendedModels = [
      ...DEFAULT_AI_MODELS.FALLBACK_MODELS, // llama3.2, llama3, mistral, phi3
      'whisper:medium', // Better accuracy Whisper model
      'whisper:large', // Highest accuracy Whisper model
    ];
  }

  async checkOllamaConnection(): Promise<ConnectionResult> {
    try {
      let response: Response;
      try {
        response = await fetchWithRetry(
          `${this.ollamaHost}/api/tags`,
          {},
          {
            operation: 'Check Ollama connection',
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 4000,
          },
        );
      } catch (fetchError: any) {
        logger.warn(
          '[ModelVerifier] Network error checking Ollama connection after retries:',
          fetchError,
        );
        return {
          connected: false,
          error: `Network error: ${fetchError.message}`,
          suggestion: 'Make sure Ollama is running. Use: ollama serve',
        };
      }

      if (response.ok) {
        return { connected: true };
      }
      return { connected: false, error: 'HTTP error: ' + response.status };
    } catch (error: any) {
      logger.error(
        '[ModelVerifier] Unexpected error checking connection:',
        error,
      );
      return {
        connected: false,
        error: error.message,
        suggestion: 'Make sure Ollama is running. Use: ollama serve',
      };
    }
  }

  async getInstalledModels(): Promise<ModelsResult> {
    try {
      const models = await this.ollama.list();
      return {
        success: true,
        models: models.models || [],
        total: models.models?.length || 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        models: [],
        total: 0,
      };
    }
  }

  async verifyEssentialModels(): Promise<VerificationResult> {
    logger.info('[ModelVerifier] Checking essential models...');

    const connectionCheck = await this.checkOllamaConnection();
    if (!connectionCheck.connected) {
      return {
        success: false,
        error: 'Ollama connection failed',
        details: connectionCheck,
        missingModels: this.essentialModels,
        availableModels: [],
        hasWhisper: false,
        installationCommands: [],
        recommendations: [],
      };
    }

    const modelsResult = await this.getInstalledModels();
    if (!modelsResult.success) {
      return {
        success: false,
        error: 'Could not fetch model list',
        details: modelsResult,
        missingModels: this.essentialModels,
        availableModels: [],
        hasWhisper: false,
        installationCommands: [],
        recommendations: [],
      };
    }

    const installedModelNames = modelsResult.models.map((m) =>
      m.name.toLowerCase(),
    );
    const missingModels: string[] = [];
    const availableModels: string[] = [];
    for (const modelName of this.essentialModels) {
      const normalizedName = modelName.toLowerCase();
      const isInstalled = installedModelNames.some(
        (installed) =>
          installed === normalizedName ||
          installed.startsWith(normalizedName + ':') ||
          normalizedName.startsWith(installed.split(':')[0]),
      );

      if (isInstalled) {
        availableModels.push(modelName);
      } else {
        missingModels.push(modelName);
      }
    }

    // Special check for Whisper models (optional while audio disabled)
    const hasWhisper = installedModelNames.some((installed) =>
      installed.startsWith('whisper'),
    );

    logger.info(
      `[ModelVerifier] Found ${availableModels.length}/${this.essentialModels.length} essential models`,
    );
    logger.info(`[ModelVerifier] Whisper available: ${hasWhisper}`);

    return {
      success: missingModels.length === 0,
      availableModels,
      missingModels,
      hasWhisper,
      installationCommands: this.generateInstallCommands(missingModels),
      recommendations: this.generateRecommendations(missingModels, hasWhisper),
    };
  }

  generateInstallCommands(missingModels: string[]): string[] {
    if (missingModels.length === 0) return [];

    return [
      '# Install missing models with these commands:',
      '',
      ...missingModels.map((model) => {
        // Special handling for Whisper
        if (model === 'whisper') {
          return [
            `ollama pull whisper`,
            `# Alternative Whisper models:`,
            `# ollama pull whisper:medium  # Better accuracy`,
            `# ollama pull whisper:large   # Highest accuracy`,
          ].join('\n');
        }
        return `ollama pull ${model}`;
      }),
      '',
      '# Verify installation:',
      'ollama list',
    ];
  }

  generateRecommendations(
    missingModels: string[],
    hasWhisper: boolean,
  ): Array<{ type: string; message: string; action: string | null }> {
    const recommendations: Array<{
      type: string;
      message: string;
      action: string | null;
    }> = [];

    if (missingModels.includes('gemma3:4b')) {
      recommendations.push({
        type: 'critical',
        message: 'Gemma3:4b is required for document and image analysis',
        action: 'Run: ollama pull gemma3:4b',
      });
    }

    if (!hasWhisper) {
      recommendations.push({
        type: 'important',
        message: 'Whisper is required for audio transcription and analysis',
        action:
          'Run: ollama pull whisper (or whisper:medium for better accuracy)',
      });
    }

    if (missingModels.includes('mxbai-embed-large')) {
      recommendations.push({
        type: 'feature',
        message: 'mxbai-embed-large enables semantic search capabilities',
        action: 'Run: ollama pull mxbai-embed-large',
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: 'success',
        message: 'All essential models are installed and ready!',
        action: null,
      });
    }

    return recommendations;
  }

  async testModelFunctionality(): Promise<FunctionalityResult> {
    logger.info('[ModelVerifier] Testing model functionality...');

    const tests: ModelTest[] = [];

    // Test text analysis
    try {
      const textTest = await this.ollama.generate({
        model: DEFAULT_AI_MODELS.TEXT_ANALYSIS,
        prompt: 'Respond with just "OK" if you can process this message.',
        options: { temperature: 0 },
      });

      tests.push({
        model: DEFAULT_AI_MODELS.TEXT_ANALYSIS,
        type: 'text',
        success: textTest.response?.toLowerCase().includes('ok') || false,
        response: textTest.response?.substring(0, 100),
      });
    } catch (error: any) {
      tests.push({
        model: DEFAULT_AI_MODELS.TEXT_ANALYSIS,
        type: 'text',
        success: false,
        error: error.message,
      });
    }

    // Test Whisper (if available)
    try {
      // We can't easily test audio without a file, so just check if model responds
      const whisperTest = await this.ollama.list();
      const hasWhisper = whisperTest.models?.some((m) =>
        m.name.toLowerCase().includes('whisper'),
      );

      tests.push({
        model: 'whisper',
        type: 'audio',
        success: hasWhisper || false,
        response: hasWhisper ? 'Model available' : 'Model not found',
      });
    } catch (error: any) {
      tests.push({
        model: 'whisper',
        type: 'audio',
        success: false,
        error: error.message,
      });
    }

    // Test embeddings model
    try {
      const perfOptions = await buildOllamaOptions('embeddings');
      const embeddingTest = await this.ollama.embeddings({
        model: 'mxbai-embed-large',
        prompt: 'test',
        options: { ...perfOptions },
      });

      tests.push({
        model: 'mxbai-embed-large',
        type: 'embeddings',
        success:
          Array.isArray(embeddingTest.embedding) &&
          embeddingTest.embedding.length > 0,
        response: `Generated ${embeddingTest.embedding?.length || 0} dimensions`,
      });
    } catch (error: any) {
      tests.push({
        model: 'mxbai-embed-large',
        type: 'embeddings',
        success: false,
        error: error.message,
      });
    }

    const successfulTests = tests.filter((t) => t.success).length;
    logger.info(
      `[ModelVerifier] ${successfulTests}/${tests.length} functionality tests passed`,
    );

    return {
      success: successfulTests >= Math.ceil(tests.length * 0.5), // At least half should work
      tests,
      summary: {
        total: tests.length,
        successful: successfulTests,
        failed: tests.length - successfulTests,
      },
    };
  }

  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const connection = await this.checkOllamaConnection();
      const models = await this.verifyEssentialModels();
      const functionality = await this.testModelFunctionality();

      return {
        timestamp: new Date().toISOString(),
        connection,
        models,
        functionality,
        overall: {
          healthy:
            connection.connected && models.success && functionality.success,
          issues: [
            ...(!connection.connected ? ['Ollama not connected'] : []),
            ...(models.missingModels.length > 0
              ? [`Missing models: ${models.missingModels.join(', ')}`]
              : []),
            ...(!functionality.success ? ['Model functionality issues'] : []),
          ],
        },
      };
    } catch (error: any) {
      logger.error('[ModelVerifier] Failed to get system status:', error);
      return {
        timestamp: new Date().toISOString(),
        connection: { connected: false, error: error.message },
        models: {
          success: false,
          error: error.message,
          missingModels: [],
          availableModels: [],
          hasWhisper: false,
          installationCommands: [],
          recommendations: [],
        },
        functionality: {
          success: false,
          error: error.message,
          tests: [],
          summary: { total: 0, successful: 0, failed: 0 },
        },
        overall: {
          healthy: false,
          issues: [`System status check failed: ${error.message}`],
        },
      };
    }
  }
}

export default ModelVerifier;
