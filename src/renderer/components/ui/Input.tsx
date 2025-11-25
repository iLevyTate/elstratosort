import React, { forwardRef, useId, useMemo, memo, InputHTMLAttributes } from 'react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  className?: string;
  invalid?: boolean;
  error?: string;
  label?: string;
  required?: boolean;
  id?: string;
}

const Input = memo(
  forwardRef<HTMLInputElement, InputProps>(function Input(
    {
      className = '',
      invalid = false,
      error = '',
      label = '',
      required = false,
      ...rest
    },
    ref,
  ) {
    const generatedId = useId();
    const id = rest.id || `input-${generatedId}`;
    const errorId = `${id}-error`;

    const classes = useMemo(() => {
      const invalidClass =
        invalid || error ? 'border-system-red focus:ring-system-red/20' : '';
      return `form-input-enhanced ${invalidClass} ${className}`.trim();
    }, [invalid, error, className]);

    // If used standalone without label/error, return simple input
    if (!label && !error) {
      return (
        <input
          ref={ref}
          className={classes}
          aria-invalid={invalid || !!error}
          aria-required={required}
          {...rest}
        />
      );
    }

    // Full form field with label and error
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-system-gray-700"
          >
            {label}
            {required && (
              <span
                className="text-stratosort-danger ml-1"
                aria-label="required"
              >
                *
              </span>
            )}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={classes}
          aria-invalid={invalid || !!error}
          aria-describedby={error ? errorId : undefined}
          aria-required={required}
          aria-labelledby={label ? id : undefined}
          {...rest}
        />
        {error && (
          <p
            id={errorId}
            className="text-sm text-stratosort-danger"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }),
);

export default Input;
