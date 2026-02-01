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

/**
 * Custom node types for the semantic graph visualization
 */
export const NODE_TYPES = Object.freeze({
  fileNode: FileNode,
  folderNode: FolderNode,
  queryNode: QueryNode,
  clusterNode: ClusterNode
});

/**
 * Custom edge types for the semantic graph visualization
 */
export const EDGE_TYPES = Object.freeze({
  similarity: SimilarityEdge,
  queryMatch: QueryMatchEdge,
  smartStep: SmartStepEdge,
  knowledge: KnowledgeEdge
});
