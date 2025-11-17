import React, { forwardRef, useId } from 'react';
import PropTypes from 'prop-types';

const Select = forwardRef(function Select(
  {
    className = '',
    invalid = false,
    error = '',
    label = '',
    required = false,
    children,
    ...rest
  },
  ref,
) {
  const id = rest.id || `select-${useId()}`;
  const errorId = `${id}-error`;

  const invalidClass =
    invalid || error ? 'border-system-red focus:ring-system-red/20' : '';
  const classes = `form-input-enhanced ${invalidClass} ${className}`.trim();

  // If used standalone without label/error, return simple select
  if (!label && !error) {
    return (
      <select
        ref={ref}
        className={classes}
        aria-invalid={invalid || !!error}
        {...rest}
      >
        {children}
      </select>
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
            <span className="text-stratosort-danger ml-1" aria-label="required">
              *
            </span>
          )}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={classes}
        aria-invalid={invalid || !!error}
        aria-describedby={error ? errorId : undefined}
        aria-required={required}
        {...rest}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="text-sm text-stratosort-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

Select.propTypes = {
  className: PropTypes.string,
  invalid: PropTypes.bool,
  error: PropTypes.string,
  label: PropTypes.string,
  required: PropTypes.bool,
  children: PropTypes.node,
};

export default Select;
