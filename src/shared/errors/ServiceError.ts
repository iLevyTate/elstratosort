/**
 * Error for service-level failures
 */
import StratoSortError from "./StratoSortError";

class ServiceError extends StratoSortError {
  serviceName: string;
  operation: string;
  originalError: Error;

  /**
   * @param serviceName - Name of the service that failed
   * @param operation - Operation that failed
   * @param originalError - The original error
   */
  constructor(serviceName: string, operation: string, originalError: Error) {
    super(
      `Service '${serviceName}' failed during ${operation}: ${originalError.message}`,
      `SERVICE_${serviceName.toUpperCase()}_FAILED`,
      {
        serviceName,
        operation,
        originalError: originalError.message,
        errorCode: (originalError as Error & { code?: string }).code,
      },
      `${serviceName} service is unavailable`,
      [
        {
          label: 'Check service status',
          action: 'checkServiceStatus',
          description: `Verify that ${serviceName} is running and accessible`,
        },
        {
          label: 'Restart service',
          action: 'restartService',
          description: `Try restarting the ${serviceName} service`,
        },
        {
          label: 'Try again',
          action: 'retry',
          description: 'Retry the operation',
        },
      ]
    );
    this.serviceName = serviceName;
    this.operation = operation;
    this.originalError = originalError;
  }
}

export default ServiceError;
