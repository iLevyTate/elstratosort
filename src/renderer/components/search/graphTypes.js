/**
 * React Flow node and edge type definitions
 *
 * Extracted to a separate module to ensure stable references during
 * Hot Module Replacement (HMR). This prevents React Flow warning #002
 * about recreating nodeTypes/edgeTypes objects on each render.
 *
 * @see https://reactflow.dev/error#002
 */

import ClusterNode from './ClusterNode';
import FileNode from './nodes/FileNode';
import FolderNode from './nodes/FolderNode';
import QueryNode from './nodes/QueryNode';
import SimilarityEdge from './SimilarityEdge';
import QueryMatchEdge from './QueryMatchEdge';
import SmartStepEdge from './SmartStepEdge';
import KnowledgeEdge from './KnowledgeEdge';

const getGlobalCache = () => (typeof globalThis !== 'undefined' ? globalThis : null);

/**
 * Custom node types for the semantic graph visualization
 */
const globalCache = getGlobalCache();
const cachedNodeTypes = globalCache?.__STRATOSORT_NODE_TYPES;
const localNodeTypes = cachedNodeTypes
  ? cachedNodeTypes
  : Object.freeze({
      fileNode: FileNode,
      folderNode: FolderNode,
      queryNode: QueryNode,
      clusterNode: ClusterNode
    });

if (globalCache && !cachedNodeTypes) {
  globalCache.__STRATOSORT_NODE_TYPES = localNodeTypes;
}

export const NODE_TYPES = localNodeTypes;

/**
 * Custom edge types for the semantic graph visualization
 */
const cachedEdgeTypes = globalCache?.__STRATOSORT_EDGE_TYPES;
const localEdgeTypes = cachedEdgeTypes
  ? cachedEdgeTypes
  : Object.freeze({
      similarity: SimilarityEdge,
      queryMatch: QueryMatchEdge,
      smartStep: SmartStepEdge,
      knowledge: KnowledgeEdge
    });

if (globalCache && !cachedEdgeTypes) {
  globalCache.__STRATOSORT_EDGE_TYPES = localEdgeTypes;
}

export const EDGE_TYPES = localEdgeTypes;
