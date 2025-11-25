import { useState, useEffect } from 'react';

/**
 * Custom hook to detect and track viewport dimensions
 * Provides responsive breakpoint detection for desktop optimization
 */
export function useViewport() {
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
    isDesktop: window.innerWidth >= 1280,
    isWideDesktop: window.innerWidth >= 1600,
    isUltraWide: window.innerWidth >= 1920,
    is4K: window.innerWidth >= 2560,
  });

  useEffect(() => {
    let timeoutId = null;

    const handleResize = () => {
      // Debounce resize events for better performance
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        setViewport({
          width: window.innerWidth,
          height: window.innerHeight,
          isDesktop: window.innerWidth >= 1280,
          isWideDesktop: window.innerWidth >= 1600,
          isUltraWide: window.innerWidth >= 1920,
          is4K: window.innerWidth >= 2560,
        });
      }, 150);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return viewport;
}
