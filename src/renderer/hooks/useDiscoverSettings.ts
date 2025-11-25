import { useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectPhaseData, setPhaseData } from '../store/slices/uiSlice';

export const useDiscoverSettings = () => {
  const dispatch = useDispatch();

  // Get naming convention settings from Redux (discover phase data)
  const phaseData = useSelector((state) => selectPhaseData(state, 'discover'));
  const namingSettings = phaseData.namingConvention || {};

  // Extract settings with defaults
  const namingConvention = namingSettings.convention || 'subject-date';
  const dateFormat = namingSettings.dateFormat || 'YYYY-MM-DD';
  const caseConvention = namingSettings.caseConvention || 'kebab-case';
  const separator = namingSettings.separator || '-';

  // Setter functions that dispatch to Redux
  const setNamingConvention = useCallback((convention) => {
    dispatch(setPhaseData({
      phase: 'discover',
      key: 'namingConvention',
      value: {
        convention,
        dateFormat,
        caseConvention,
        separator,
      },
    }));
  }, [dispatch, dateFormat, caseConvention, separator]);

  const setDateFormat = useCallback((format) => {
    dispatch(setPhaseData({
      phase: 'discover',
      key: 'namingConvention',
      value: {
        convention: namingConvention,
        dateFormat: format,
        caseConvention,
        separator,
      },
    }));
  }, [dispatch, namingConvention, caseConvention, separator]);

  const setCaseConvention = useCallback((convention) => {
    dispatch(setPhaseData({
      phase: 'discover',
      key: 'namingConvention',
      value: {
        convention: namingConvention,
        dateFormat,
        caseConvention: convention,
        separator,
      },
    }));
  }, [dispatch, namingConvention, dateFormat, separator]);

  const setSeparator = useCallback((sep) => {
    dispatch(setPhaseData({
      phase: 'discover',
      key: 'namingConvention',
      value: {
        convention: namingConvention,
        dateFormat,
        caseConvention,
        separator: sep,
      },
    }));
  }, [dispatch, namingConvention, dateFormat, caseConvention]);

  const formatDate = useCallback((date, format) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    switch (format) {
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'MM-DD-YYYY':
        return `${month}-${day}-${year}`;
      case 'DD-MM-YYYY':
        return `${day}-${month}-${year}`;
      case 'YYYYMMDD':
        return `${year}${month}${day}`;
      default:
        return `${year}-${month}-${day}`;
    }
  }, []);

  const applyCaseConvention = useCallback((text, convention) => {
    switch (convention) {
      case 'kebab-case':
        return text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      case 'snake_case':
        return text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
      case 'camelCase':
        return text
          .split(/[^a-z0-9]+/i)
          .map((word, index) =>
            index === 0
              ? word.toLowerCase()
              : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
          )
          .join('');
      case 'PascalCase':
        return text
          .split(/[^a-z0-9]+/i)
          .map(
            (word) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
          )
          .join('');
      case 'lowercase':
        return text.toLowerCase();
      case 'UPPERCASE':
        return text.toUpperCase();
      default:
        return text;
    }
  }, []);

  const generatePreviewName = useCallback(
    (originalName) => {
      if (!originalName) return '';
      
      const baseName = originalName.replace(/\.[^/.]+$/, '');
      const extension = originalName.includes('.')
        ? '.' + originalName.split('.').pop()
        : '';
      const today = new Date();
      let previewName = '';
      switch (namingConvention) {
        case 'subject-date':
          previewName = `${baseName}${separator}${formatDate(today, dateFormat)}`;
          break;
        case 'date-subject':
          previewName = `${formatDate(today, dateFormat)}${separator}${baseName}`;
          break;
        case 'project-subject-date':
          previewName = `Project${separator}${baseName}${separator}${formatDate(today, dateFormat)}`;
          break;
        case 'category-subject':
          previewName = `Category${separator}${baseName}`;
          break;
        case 'keep-original':
          previewName = baseName;
          break;
        default:
          previewName = baseName;
      }
      return applyCaseConvention(previewName, caseConvention) + extension;
    },
    [
      namingConvention,
      separator,
      dateFormat,
      caseConvention,
      formatDate,
      applyCaseConvention,
    ],
  );

  return {
    namingConvention,
    setNamingConvention,
    dateFormat,
    setDateFormat,
    caseConvention,
    setCaseConvention,
    separator,
    setSeparator,
    generatePreviewName,
    formatDate, // Exported if needed elsewhere
    applyCaseConvention, // Exported if needed elsewhere
  };
};

