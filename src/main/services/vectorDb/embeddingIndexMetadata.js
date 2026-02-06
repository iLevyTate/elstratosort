/**
 * Embedding Index Metadata
 *
 * Stores metadata about the current embedding index (model name, dimensions, source).
 * Used for mismatch warnings and rebuild prompts.
 *
 * @module services/vectorDb/embeddingIndexMetadata
 */

const path = require('path');
const { app } = require('electron');
const { atomicWriteFile, loadJsonFile } = require('../../../shared/atomicFile');

const METADATA_FILENAME = 'embedding-index.json';

function getMetadataPath() {
  return path.join(app.getPath('userData'), METADATA_FILENAME);
}

async function readEmbeddingIndexMetadata() {
  return loadJsonFile(getMetadataPath(), {
    description: 'embedding index metadata',
    backupCorrupt: true
  });
}

async function writeEmbeddingIndexMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return;
  const payload = {
    ...metadata,
    updatedAt: new Date().toISOString()
  };
  await atomicWriteFile(getMetadataPath(), payload, { pretty: true });
}

module.exports = {
  readEmbeddingIndexMetadata,
  writeEmbeddingIndexMetadata
};
