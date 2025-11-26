/**
 * Settings Validation
 * Validates user settings to prevent invalid configurations
 */
import { DEFAULT_SETTINGS } from './defaultSettings';

/**
 * Validation rule type
 */
interface ValidationRule {
  type: 'string' | 'number' | 'boolean';
  enum?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  integer?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}

/**
 * Validation result
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Settings object type
 */
interface Settings {
  theme?: string;
  notifications?: boolean;
  defaultSmartFolderLocation?: string;
  maxConcurrentAnalysis?: number;
  autoOrganize?: boolean;
  backgroundMode?: boolean;
  launchOnStartup?: boolean;
  autoApproveThreshold?: number;
  downloadConfidenceThreshold?: number;
  reviewThreshold?: number;
  ollamaHost?: string;
  textModel?: string;
  visionModel?: string;
  embeddingModel?: string;
  maxFileSize?: number;
  maxImageFileSize?: number;
  maxDocumentFileSize?: number;
  maxTextFileSize?: number;
  analysisTimeout?: number;
  fileOperationTimeout?: number;
  maxBatchSize?: number;
  retryAttempts?: number;
  workflowRestoreMaxAge?: number;
  saveDebounceMs?: number;
  [key: string]: unknown;
}

/**
 * Configurable limits result
 */
interface ConfigurableLimits {
  fileSizeLimits: {
    maxFileSize: number;
    maxImageFileSize: number;
    maxDocumentFileSize: number;
    maxTextFileSize: number;
  };
  processingLimits: {
    maxConcurrentAnalysis: number;
    analysisTimeout: number;
    fileOperationTimeout: number;
    maxBatchSize: number;
    retryAttempts: number;
  };
  uiLimits: {
    workflowRestoreMaxAge: number;
    saveDebounceMs: number;
  };
}

/**
 * Validation rules for settings
 */
const VALIDATION_RULES: Record<string, ValidationRule> = {
  theme: {
    type: 'string',
    enum: ['light', 'dark', 'system'],
    required: false,
  },
  notifications: {
    type: 'boolean',
    required: false,
  },
  defaultSmartFolderLocation: {
    type: 'string',
    minLength: 1,
    maxLength: 500,
    required: false,
  },
  maxConcurrentAnalysis: {
    type: 'number',
    min: 1,
    max: 10,
    integer: true,
    required: false,
  },
  autoOrganize: {
    type: 'boolean',
    required: false,
  },
  backgroundMode: {
    type: 'boolean',
    required: false,
  },
  launchOnStartup: {
    type: 'boolean',
    required: false,
  },
  autoApproveThreshold: {
    type: 'number',
    min: 0,
    max: 1,
    required: false,
  },
  downloadConfidenceThreshold: {
    type: 'number',
    min: 0,
    max: 1,
    required: false,
  },
  reviewThreshold: {
    type: 'number',
    min: 0,
    max: 1,
    required: false,
  },
  ollamaHost: {
    type: 'string',
    // CRITICAL FIX: Allow URLs with or without protocol
    // setOllamaHost will normalize it by adding http:// if missing
    // Pattern: optional http(s)://, then hostname with optional port
    pattern:
      /^(?:https?:\/\/)?(?:[\w.-]+|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/.*)?$/,
    maxLength: 500,
    required: false,
  },
  textModel: {
    type: 'string',
    minLength: 1,
    maxLength: 200,
    required: false,
  },
  visionModel: {
    type: 'string',
    minLength: 1,
    maxLength: 200,
    required: false,
  },
  embeddingModel: {
    type: 'string',
    minLength: 1,
    maxLength: 200,
    required: false,
  },
  maxFileSize: {
    type: 'number',
    min: 1024 * 1024, // 1MB minimum
    max: 1024 * 1024 * 1024, // 1GB maximum
    integer: true,
    required: false,
  },
  maxImageFileSize: {
    type: 'number',
    min: 1024 * 1024, // 1MB minimum
    max: 500 * 1024 * 1024, // 500MB maximum
    integer: true,
    required: false,
  },
  maxDocumentFileSize: {
    type: 'number',
    min: 1024 * 1024, // 1MB minimum
    max: 500 * 1024 * 1024, // 500MB maximum
    integer: true,
    required: false,
  },
  maxTextFileSize: {
    type: 'number',
    min: 1024 * 1024, // 1MB minimum
    max: 200 * 1024 * 1024, // 200MB maximum
    integer: true,
    required: false,
  },
  analysisTimeout: {
    type: 'number',
    min: 10000, // 10 seconds minimum
    max: 600000, // 10 minutes maximum
    integer: true,
    required: false,
  },
  fileOperationTimeout: {
    type: 'number',
    min: 1000, // 1 second minimum
    max: 60000, // 60 seconds maximum
    integer: true,
    required: false,
  },
  maxBatchSize: {
    type: 'number',
    min: 1,
    max: 1000,
    integer: true,
    required: false,
  },
  retryAttempts: {
    type: 'number',
    min: 0,
    max: 10,
    integer: true,
    required: false,
  },
  workflowRestoreMaxAge: {
    type: 'number',
    min: 60000, // 1 minute minimum
    max: 24 * 60 * 60 * 1000, // 24 hours maximum
    integer: true,
    required: false,
  },
  saveDebounceMs: {
    type: 'number',
    min: 100,
    max: 5000,
    integer: true,
    required: false,
  },
};

/**
 * Validate a single setting value
 */
function validateSetting(key: string, value: unknown, rule: ValidationRule): string[] {
  const errors: string[] = [];

  // Type validation
  if (rule.type && typeof value !== rule.type) {
    errors.push(`${key} must be of type ${rule.type}, got ${typeof value}`);
    return errors;
  }

  // Enum validation
  if (rule.enum && typeof value === 'string' && !rule.enum.includes(value)) {
    errors.push(
      `${key} must be one of [${rule.enum.join(', ')}], got "${value}"`,
    );
  }

  // Number validations
  if (rule.type === 'number' && typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      errors.push(`${key} must be at least ${rule.min}, got ${value}`);
    }
    if (rule.max !== undefined && value > rule.max) {
      errors.push(`${key} must be at most ${rule.max}, got ${value}`);
    }
    if (rule.integer && !Number.isInteger(value)) {
      errors.push(`${key} must be an integer, got ${value}`);
    }
  }

  // String validations
  if (rule.type === 'string' && typeof value === 'string') {
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      errors.push(
        `${key} must be at least ${rule.minLength} characters, got ${value.length}`,
      );
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      errors.push(
        `${key} must be at most ${rule.maxLength} characters, got ${value.length}`,
      );
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(
        `${key} does not match the required pattern: ${rule.pattern}`,
      );
    }
  }

  return errors;
}

/**
 * Validate settings object
 */
function validateSettings(settings: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!settings || typeof settings !== 'object') {
    errors.push('Settings must be an object');
    return { valid: false, errors, warnings };
  }

  const settingsObj = settings as Settings;

  // Validate each setting against its rule
  for (const [key, value] of Object.entries(settingsObj)) {
    const rule = VALIDATION_RULES[key];

    if (!rule) {
      warnings.push(`Unknown setting: ${key}`);
      continue;
    }

    if (value === undefined || value === null) {
      if (rule.required) {
        errors.push(`${key} is required but not provided`);
      }
      continue;
    }

    const fieldErrors = validateSetting(key, value, rule);
    errors.push(...fieldErrors);
  }

  // Fixed: Cross-field validations with consistent null checks
  if (
    settingsObj.autoApproveThreshold !== undefined &&
    settingsObj.autoApproveThreshold !== null &&
    settingsObj.reviewThreshold !== undefined &&
    settingsObj.reviewThreshold !== null &&
    settingsObj.autoApproveThreshold < settingsObj.reviewThreshold
  ) {
    errors.push(
      'autoApproveThreshold must be greater than or equal to reviewThreshold',
    );
  }

  if (
    settingsObj.downloadConfidenceThreshold !== undefined &&
    settingsObj.downloadConfidenceThreshold !== null &&
    settingsObj.autoApproveThreshold !== undefined &&
    settingsObj.autoApproveThreshold !== null &&
    settingsObj.downloadConfidenceThreshold < settingsObj.autoApproveThreshold
  ) {
    errors.push(
      'downloadConfidenceThreshold must be greater than or equal to autoApproveThreshold',
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Sanitize settings by removing invalid values
 */
function sanitizeSettings(settings: unknown): Settings {
  if (!settings || typeof settings !== 'object') {
    return {};
  }

  const settingsObj = settings as Settings;
  const sanitized: Settings = {};

  for (const [key, value] of Object.entries(settingsObj)) {
    const rule = VALIDATION_RULES[key];

    // Keep unknown settings (might be for future use)
    if (!rule) {
      sanitized[key] = value;
      continue;
    }

    // Skip null/undefined unless required
    if (value === undefined || value === null) {
      if (rule.required) {
        continue; // Will use default
      }
      sanitized[key] = value;
      continue;
    }

    // Validate and sanitize
    const fieldErrors = validateSetting(key, value, rule);
    if (fieldErrors.length === 0) {
      sanitized[key] = value;
    }
    // Invalid values are dropped (will use defaults)
  }

  return sanitized;
}

/**
 * Get default value for a setting
 */
function getDefaultValue(key: string): unknown {
  // Use DEFAULT_SETTINGS directly to avoid duplication
  return (DEFAULT_SETTINGS as Record<string, unknown>)[key];
}

/**
 * Get all configurable limits with current values
 * Fixed: Use shared DEFAULT_SETTINGS to avoid duplication
 */
function getConfigurableLimits(settings: Settings | null | undefined): ConfigurableLimits {
  // Handle null/undefined settings
  const safeSettings = settings || {};
  const defaults = DEFAULT_SETTINGS as unknown as Record<string, number>;

  return {
    fileSizeLimits: {
      maxFileSize: safeSettings.maxFileSize ?? defaults.maxFileSize,
      maxImageFileSize:
        safeSettings.maxImageFileSize ?? defaults.maxImageFileSize,
      maxDocumentFileSize:
        safeSettings.maxDocumentFileSize ??
        defaults.maxDocumentFileSize,
      maxTextFileSize:
        safeSettings.maxTextFileSize ?? defaults.maxTextFileSize,
    },
    processingLimits: {
      maxConcurrentAnalysis:
        safeSettings.maxConcurrentAnalysis ??
        defaults.maxConcurrentAnalysis,
      analysisTimeout:
        safeSettings.analysisTimeout ?? defaults.analysisTimeout,
      fileOperationTimeout:
        safeSettings.fileOperationTimeout ??
        defaults.fileOperationTimeout,
      maxBatchSize: safeSettings.maxBatchSize ?? defaults.maxBatchSize,
      retryAttempts:
        safeSettings.retryAttempts ?? defaults.retryAttempts,
    },
    uiLimits: {
      workflowRestoreMaxAge:
        safeSettings.workflowRestoreMaxAge ??
        defaults.workflowRestoreMaxAge,
      saveDebounceMs:
        safeSettings.saveDebounceMs ?? defaults.saveDebounceMs,
    },
  };
}

export {
  VALIDATION_RULES,
  validateSettings,
  validateSetting,
  sanitizeSettings,
  getDefaultValue,
  getConfigurableLimits,
};
