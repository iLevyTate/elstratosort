import React, { memo, useMemo, ButtonHTMLAttributes, ReactNode } from 'react';

const VARIANT_TO_CLASS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  success: 'btn-success',
  danger: 'btn-danger',
  ghost: 'btn-ghost-minimal',
  outline: 'btn-outline',
  subtle: 'btn-subtle',
} as const;

const SIZE_TO_CLASS = {
  sm: 'text-sm px-3 py-1.5',
  md: 'text-base px-6 py-2.5',
  lg: 'text-lg px-8 py-3',
} as const;

interface SpinnerProps {
  className?: string;
}

const Spinner = memo(function Spinner({ className = '' }: SpinnerProps) {
  return (
    <svg
      className={`animate-spin h-4 w-4 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
});

type ButtonVariant = keyof typeof VARIANT_TO_CLASS;
type ButtonSize = keyof typeof SIZE_TO_CLASS;

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
  type?: 'button' | 'submit' | 'reset';
  isLoading?: boolean;
  disabled?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  'aria-label'?: string;
}

const Button = memo(function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  isLoading = false,
  disabled = false,
  leftIcon = null,
  rightIcon = null,
  'aria-label': ariaLabel,
  ...rest
}: ButtonProps) {
  const classes = useMemo(() => {
    const variantClass = VARIANT_TO_CLASS[variant] || VARIANT_TO_CLASS.primary;
    const sizeClass = SIZE_TO_CLASS[size] || SIZE_TO_CLASS.md;
    const disabledClass =
      disabled || isLoading ? 'opacity-50 cursor-not-allowed' : '';
    return `${variantClass} ${sizeClass} ${disabledClass} ${className}`.trim();
  }, [variant, size, disabled, isLoading, className]);

  // Bug #39: Ensure button has accessible label
  const accessibleLabel =
    ariaLabel || (typeof children === 'string' ? children : undefined);

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || isLoading}
      role="button"
      aria-busy={isLoading}
      aria-disabled={disabled || isLoading}
      aria-label={accessibleLabel}
      {...rest}
    >
      {isLoading && <Spinner className="mr-2" />}
      {!isLoading && leftIcon && (
        <span className="mr-2" aria-hidden="true">
          {leftIcon}
        </span>
      )}
      {children}
      {!isLoading && rightIcon && (
        <span className="ml-2" aria-hidden="true">
          {rightIcon}
        </span>
      )}
    </button>
  );
});

export default Button;
