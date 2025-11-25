import React, { useState, useEffect, ReactNode, KeyboardEvent } from 'react';
import { logger } from '../../shared/logger';

logger.setContext('Toast');

type ToastSeverity = 'info' | 'success' | 'error' | 'warning';

interface ToastProps {
  message: string | ReactNode | object;
  severity?: ToastSeverity;
  duration?: number;
  onClose?: () => void;
  show?: boolean;
}

interface ToastData {
  id: number;
  message: string | ReactNode | object;
  severity?: ToastSeverity;
  type?: ToastSeverity;
  duration?: number;
  show?: boolean;
  groupKey?: string | null;
  createdAt?: number;
}

const Toast = ({
  message,
  severity = 'info',
  duration = 3000,
  onClose,
  show = true,
}: ToastProps) => {
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    if (show && duration > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onClose?.(), 300);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose?.(), 300);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  const getSeverityClasses = () => {
    switch (severity) {
      case 'success':
        return 'toast-success border-system-green bg-system-green/10 text-system-green';
      case 'error':
        return 'toast-error border-system-red bg-system-red/10 text-system-red';
      case 'warning':
        return 'toast-warning border-yellow-500 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/90 dark:text-yellow-200';
      case 'info':
      default:
        return 'toast-info border-stratosort-blue bg-stratosort-blue/10 text-stratosort-blue';
    }
  };

  const getSeverityIcon = () => {
    switch (severity) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  const fallbackStyle = {
    transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
    transition: 'all 300ms ease-in-out',
  };

  if (!show && !isVisible) return null;

  const renderMessageContent = () => {
    if (React.isValidElement(message)) {
      return message;
    }

    if (message && typeof message === 'object') {
      try {
        const msgObj = message as { message?: string; text?: string; title?: string };
        const readableType = msgObj.message || msgObj.text || msgObj.title;
        if (typeof readableType === 'string') return readableType;
        return JSON.stringify(message);
      } catch {
        return String(message);
      }
    }

    return message as ReactNode;
  };

  return (
    <div
      className={`toast-enhanced ${getSeverityClasses()} ${isVisible ? 'show' : ''}`}
      style={fallbackStyle}
      role="alert"
      aria-live="polite"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          <span
            className="text-lg md:text-xl flex-shrink-0 opacity-90"
            aria-hidden="true"
          >
            {getSeverityIcon()}
          </span>
          <div className="flex-1">
            <div className="text-xs md:text-sm font-normal leading-tight opacity-90">
              {renderMessageContent()}
            </div>
          </div>
        </div>
        <button
          onClick={handleClose}
          className="ml-5 inline-flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-md text-current opacity-80 hover:opacity-100 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stratosort-blue/40 transition-colors"
          aria-label="Close notification"
          title="Close"
        >
          <svg
            className="w-5 h-5 md:w-6 md:h-6"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

interface ToastContainerProps {
  toasts?: ToastData[];
  onRemoveToast?: (id: number) => void;
}

export const ToastContainer = ({ toasts = [], onRemoveToast }: ToastContainerProps) => {
  const [position] = useState(() => {
    try {
      return localStorage.getItem('toastPosition') || 'bottom-right';
    } catch {
      return 'bottom-right';
    }
  });
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('toastCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  const containerStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = { position: 'fixed', zIndex: 1000 };
    const bottomOffset = '80px';
    switch (position) {
      case 'top-right':
        return { ...base, top: '21px', right: '21px' };
      case 'top-left':
        return { ...base, top: '21px', left: '21px' };
      case 'bottom-left':
        return { ...base, bottom: bottomOffset, left: '21px' };
      default:
        return { ...base, bottom: bottomOffset, right: '21px' };
    }
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem('toastCollapsed', String(!prev));
      } catch (error) {
        logger.warn('Failed to save toast collapsed state to localStorage', {
          error: (error as Error).message,
        });
      }
      return !prev;
    });
  };

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="z-40 pointer-events-none"
      style={containerStyle()}
    >
      <div className="pointer-events-auto mb-4 flex items-center justify-end">
        <button
          onClick={toggleCollapsed}
          className="relative inline-flex h-10 w-10 md:h-11 md:w-11 items-center justify-center rounded-full bg-white/90 border border-system-gray-200 text-system-gray-700 hover:bg-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stratosort-blue/40"
          aria-label={collapsed ? 'Open notifications' : 'Close notifications'}
          aria-expanded={!collapsed}
          aria-controls="toast-panel"
          title={collapsed ? 'Open notifications' : 'Close notifications'}
        >
          {collapsed ? (
            <svg
              className="w-5 h-5 md:w-6 md:h-6"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 22a2 2 0 002-2H10a2 2 0 002 2z" />
              <path
                fillRule="evenodd"
                d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9a1 1 0 001 1h16a1 1 0 001-1c0-2-3-2-3-9z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 md:w-6 md:h-6"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {toasts.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-5 px-1 rounded-full bg-stratosort-blue text-white text-[10px] leading-5 text-center">
              {toasts.length}
            </span>
          )}
        </button>
      </div>

      <div id="toast-panel" aria-hidden={collapsed}>
        {!collapsed &&
          toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto mb-5">
              <Toast
                message={toast.message}
                severity={toast.severity || toast.type}
                duration={toast.duration}
                show={toast.show !== false}
                onClose={() => onRemoveToast?.(toast.id)}
              />
            </div>
          ))}
      </div>
    </div>
  );
};

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const MAX_VISIBLE_TOASTS = 5;
  const GROUP_WINDOW_MS = 2000;

  const getHighestSeverity = (a: ToastSeverity, b: ToastSeverity): ToastSeverity => {
    const order: Record<ToastSeverity, number> = { error: 3, warning: 2, success: 1, info: 0 };
    const aScore = order[a] ?? 0;
    const bScore = order[b] ?? 0;
    return aScore >= bScore ? a : b;
  };

  const addToast = (
    message: string | ReactNode | object,
    severity: ToastSeverity = 'info',
    duration = 3000,
    groupKey: string | null = null,
  ) => {
    const id = Date.now() + Math.random();
    const now = Date.now();

    setToasts((prev) => {
      if (groupKey) {
        const idx = prev.findIndex(
          (t) =>
            t.groupKey === groupKey &&
            now - (t.createdAt || now) <= GROUP_WINDOW_MS,
        );
        if (idx !== -1) {
          const existing = prev[idx];
          const updated: ToastData = {
            ...existing,
            id: existing.id,
            message,
            severity: getHighestSeverity(
              existing.severity || 'info',
              severity || 'info',
            ),
            duration: duration ?? existing.duration,
            createdAt: existing.createdAt || now,
          };
          const copy = prev.slice();
          copy[idx] = updated;
          return copy;
        }
      }

      const next: ToastData[] = [
        ...prev,
        {
          id,
          message,
          severity,
          duration,
          show: true,
          groupKey: groupKey || null,
          createdAt: now,
        },
      ];
      if (next.length > MAX_VISIBLE_TOASTS) {
        next.shift();
      }
      return next;
    });

    return id;
  };

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const clearAllToasts = () => {
    setToasts([]);
  };

  return {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
    addNotification: addToast,
    showSuccess: (message: string | ReactNode | object, duration = 2500) =>
      addToast(message, 'success', duration),
    showError: (message: string | ReactNode | object, duration = 4000) =>
      addToast(message, 'error', duration),
    showWarning: (message: string | ReactNode | object, duration = 3500) =>
      addToast(message, 'warning', duration),
    showInfo: (message: string | ReactNode | object, duration = 2000) =>
      addToast(message, 'info', duration),
  };
};

export default Toast;
