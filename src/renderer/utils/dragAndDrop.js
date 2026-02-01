import { normalizeFileUri } from './pathNormalization';

const FILE_DRAG_TYPES = new Set([
  'files',
  'text/uri-list',
  'text/plain',
  'application/x-moz-file',
  'application/x-moz-file-promise'
]);

const collectDataTransferTypes = (dataTransfer) => {
  const types = dataTransfer?.types;
  if (!types) return [];
  if (Array.isArray(types)) return types;
  if (typeof types === 'string') return [types];
  if (typeof types[Symbol.iterator] === 'function') {
    return Array.from(types);
  }
  if (typeof types.length === 'number' && typeof types.item === 'function') {
    const results = [];
    for (let i = 0; i < types.length; i += 1) {
      const value = types.item(i);
      if (value) results.push(value);
    }
    return results;
  }
  return [];
};

export const isFileDragEvent = (event) => {
  const dataTransfer = event?.dataTransfer;
  if (!dataTransfer) return false;

  if (dataTransfer.files && dataTransfer.files.length > 0) return true;
  if (dataTransfer.items && Array.from(dataTransfer.items).some((item) => item?.kind === 'file')) {
    return true;
  }

  const types = collectDataTransferTypes(dataTransfer);
  return types.some((type) => FILE_DRAG_TYPES.has(String(type).toLowerCase()));
};

export const extractDroppedFiles = (dataTransfer) => {
  if (!dataTransfer) {
    return { paths: [], fileList: [], itemFiles: [] };
  }

  const fileList = Array.from(dataTransfer.files || []);
  const itemFiles = Array.from(dataTransfer.items || [])
    .filter((item) => item?.kind === 'file')
    .map((item) => item.getAsFile?.())
    .filter(Boolean);

  const uriListRaw = dataTransfer.getData?.('text/uri-list') || '';
  const textPlainRaw = dataTransfer.getData?.('text/plain') || '';

  const parsedUris = uriListRaw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => normalizeFileUri(line));

  const parsedPlainText =
    textPlainRaw && !textPlainRaw.includes('\n')
      ? [normalizeFileUri(textPlainRaw)]
      : textPlainRaw
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => normalizeFileUri(line));

  const collectedPaths = [
    ...fileList.map((file) => normalizeFileUri(file.path || file.name)),
    ...itemFiles.map((file) => normalizeFileUri(file.path || file.name)),
    ...parsedUris,
    ...parsedPlainText
  ].filter(Boolean);

  return {
    paths: Array.from(new Set(collectedPaths)),
    fileList,
    itemFiles
  };
};
