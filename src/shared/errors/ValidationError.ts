/**
 * Error for validation failures
 */
import StratoSortError from "./StratoSortError";

class ValidationError extends StratoSortError {
  field: string;
  reason: string;
  value: unknown;

  /**
   * @param field - Field that failed validation
   * @param reason - Why validation failed
   * @param value - The invalid value
   */
  constructor(field: string, reason: string, value: unknown = null) {
    super(
      `Validation failed for '${field}': ${reason}`,
      'VALIDATION_FAILED',
      {
        field,
        reason,
        value: value !== null ? String(value) : null,
      },
      `Invalid ${field}: ${reason}`,
      [
        {
          label: 'Fix input',
          action: 'fixInput',
          description: `Correct the ${field} and try again`,
        },
        {
          label: 'Use default',
          action: 'useDefault',
          description: `Use default value for ${field}`,
        },
      ]
    );
    this.field = field;
    this.reason = reason;
    this.value = value;
  }
}

export default ValidationError;
