import { Ollama } from 'ollama';
import { validateIpc, withRequestId, withErrorHandling, compose } from './validation';
import { OllamaModelCheckSchema, OllamaModelPullSchema } from './schemas';

export function registerOllamaIpc({
  ipcMain,
  IPC_CHANNELS,
  logger,
  systemAnalytics,
  getMainWindow,
  getOllama,
  getOllamaModel,
  getOllamaVisionModel,
  getOllamaEmbeddingModel,
  getOllamaHost,
}: any) {
  logger.setContext('IPC:Ollama');

  ipcMain.handle(
    IPC_CHANNELS.OLLAMA.GET_MODELS,
    compose(
      withErrorHandling,
      withRequestId
    )(async () => {
      try {
        const ollama = getOllama();
        const response = await ollama.list();
        const models = response.models || [];
        const categories: any = { text: [], vision: [], embedding: [] };
        for (const m of models) {
          const name = (m as any).name || '';
          if (/llava|vision|clip|sam/gi.test(name))
            categories.vision.push(name);
          else if (/embed|embedding/gi.test(name))
            categories.embedding.push(name);
          else categories.text.push(name);
        }
        // Ensure we update health on every models fetch
        systemAnalytics.ollamaHealth = {
          status: 'healthy',
          host: getOllamaHost ? getOllamaHost() : undefined,
          modelCount: models.length,
          lastCheck: Date.now(),
        };
        return {
          models: models.map((m) => (m as any).name),
          categories,
          selected: {
            textModel: getOllamaModel(),
            visionModel: getOllamaVisionModel(),
            embeddingModel:
              typeof getOllamaEmbeddingModel === 'function'
                ? getOllamaEmbeddingModel()
                : null,
          },
          ollamaHealth: systemAnalytics.ollamaHealth,
          host:
            typeof getOllamaHost === 'function' ? getOllamaHost() : undefined,
        };
      } catch (error) {
        logger.error('[IPC] Error fetching Ollama models:', error);
        if ((error as any).cause && (error as any).cause.code === 'ECONNREFUSED') {
          systemAnalytics.ollamaHealth = {
            status: 'unhealthy',
            error: 'Connection refused. Ensure Ollama is running.',
            lastCheck: Date.now(),
          };
        }
        return {
          models: [],
          categories: { text: [], vision: [], embedding: [] },
          selected: {
            textModel: getOllamaModel(),
            visionModel: getOllamaVisionModel(),
            embeddingModel:
              typeof getOllamaEmbeddingModel === 'function'
                ? getOllamaEmbeddingModel()
                : null,
          },
          error: (error as Error).message,
          host:
            typeof getOllamaHost === 'function' ? getOllamaHost() : undefined,
          ollamaHealth: systemAnalytics.ollamaHealth,
        };
      }
    }),
  );

  // Test Connection Handler - with middleware
  ipcMain.handle(
    IPC_CHANNELS.OLLAMA.TEST_CONNECTION,
    compose(
      withErrorHandling,
      withRequestId
    )(async (event, hostUrl) => {
      try {
        // Fixed: Normalize URL to prevent double http://
        let testUrl = hostUrl || 'http://127.0.0.1:11434';
        if (testUrl && typeof testUrl === 'string') {
          testUrl = testUrl.trim();
          // Remove any existing protocol
          testUrl = testUrl.replace(/^https?:\/\//i, '');
          // Add http:// if no protocol specified
          if (
            !testUrl.startsWith('http://') &&
            !testUrl.startsWith('https://')
          ) {
            testUrl = `http://${testUrl}`;
          }
        }

        const testOllama = new Ollama({ host: testUrl });
        const response = await testOllama.list();
        systemAnalytics.ollamaHealth = {
          status: 'healthy',
          host: testUrl,
          modelCount: response.models.length,
          lastCheck: Date.now(),
        };
        return {
          success: true,
          host: testUrl,
          modelCount: response.models.length,
          models: response.models.map((m) => (m as any).name),
          ollamaHealth: systemAnalytics.ollamaHealth,
        };
      } catch (error) {
        logger.error('[IPC] Ollama connection test failed:', error);
        systemAnalytics.ollamaHealth = {
          status: 'unhealthy',
          host: hostUrl || 'http://localhost:11434',
          error: (error as Error).message,
          lastCheck: Date.now(),
        };
        return {
          success: false,
          host: hostUrl || 'http://127.0.0.1:11434',
          error: (error as Error).message,
          ollamaHealth: systemAnalytics.ollamaHealth,
        };
      }
    }),
  );

  // Pull Models Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.OLLAMA.PULL_MODELS,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(OllamaModelPullSchema)
    )(async (_event, data) => {
      const modelName = (data as any).modelName;
      const models = [modelName]; // Wrap single model in array for existing logic
      try {
        const ollama = getOllama();
        const results: any[] = [];
        for (const model of Array.isArray(models) ? models : []) {
          try {
            // Send progress events if supported by client
            const win =
              typeof getMainWindow === 'function' ? getMainWindow() : null;
            await ollama.pull({
              model,
              stream: (progress) => {
                try {
                  if (win && !win.isDestroyed()) {
                    win.webContents.send('operation-progress', {
                      type: 'ollama-pull',
                      model,
                      progress,
                    });
                  }
                } catch {
                  // Non-fatal if progress send fails
                }
              },
            });
            results.push({ model, success: true });
          } catch (e) {
            results.push({ model, success: false, error: (e as Error).message });
          }
        }
        return { success: true, results };
      } catch (error) {
        logger.error('[IPC] Pull models failed]:', error);
        return { success: false, error: (error as Error).message };
      }
    }),
  );

  // Delete Model Handler - with full validation stack
  ipcMain.handle(
    IPC_CHANNELS.OLLAMA.DELETE_MODEL,
    compose(
      withErrorHandling,
      withRequestId,
      validateIpc(OllamaModelCheckSchema)
    )(async (_event, data) => {
      const model = (data as any).modelName;
      try {
        const ollama = getOllama();
        await ollama.delete({ model });
        return { success: true };
      } catch (error) {
        logger.error('[IPC] Delete model failed]:', error);
        return { success: false, error: (error as Error).message };
      }
    }),
  );
}
