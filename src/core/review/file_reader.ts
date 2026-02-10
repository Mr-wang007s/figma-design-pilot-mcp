import { getFile, getLocalVariables } from '../../figma/api.js';
import { db } from '../../db/client.js';
import type {
  FigmaFileResponse,
  FigmaNode,
  FigmaVariablesResponse,
  FigmaComponentMeta,
  FigmaComponentSetMeta,
  FigmaStyleMeta,
  FigmaVariable,
  FigmaVariableCollection,
  FileStructureNode,
} from '../../figma/design_types.js';

// ── File Context (shared across lint rules) ──────────────────────────────────

export interface FileContext {
  fileKey: string;
  fileName: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponentMeta>;
  componentSets: Record<string, FigmaComponentSetMeta>;
  styles: Record<string, FigmaStyleMeta>;
  variables: Record<string, FigmaVariable>;
  variableCollections: Record<string, FigmaVariableCollection>;
  variablesAvailable: boolean;
}

// ── File Fetching & Caching ──────────────────────────────────────────────────

/**
 * Fetch file JSON from Figma, with snapshot caching.
 */
export async function fetchFileContext(fileKey: string): Promise<FileContext> {
  // Fetch file JSON (always fresh — we cache metadata separately)
  const fileData: FigmaFileResponse = await getFile(fileKey, { geometry: 'paths' });

  // Cache snapshot metadata
  await cacheFileSnapshot(fileKey, fileData);

  // Try to fetch variables (may fail for non-Enterprise)
  let variables: Record<string, FigmaVariable> = {};
  let variableCollections: Record<string, FigmaVariableCollection> = {};
  let variablesAvailable = false;

  try {
    const varsResponse: FigmaVariablesResponse = await getLocalVariables(fileKey);
    if (varsResponse.meta) {
      variables = varsResponse.meta.variables ?? {};
      variableCollections = varsResponse.meta.variableCollections ?? {};
      variablesAvailable = true;
    }
  } catch {
    // Variables API not available (non-Enterprise) — graceful degradation
    console.warn('⚠️  Variables API not available (requires Enterprise plan). Token checks will be limited.');
  }

  return {
    fileKey,
    fileName: fileData.name,
    version: fileData.version,
    document: fileData.document,
    components: fileData.components ?? {},
    componentSets: fileData.componentSets ?? {},
    styles: fileData.styles ?? {},
    variables,
    variableCollections,
    variablesAvailable,
  };
}

async function cacheFileSnapshot(fileKey: string, fileData: FigmaFileResponse): Promise<void> {
  try {
    await db
      .insertInto('file_snapshots')
      .values({
        file_key: fileKey,
        version_id: fileData.version,
        file_name: fileData.name,
        node_count: countNodes(fileData.document),
        components_json: JSON.stringify(fileData.components ?? {}),
        component_sets_json: JSON.stringify(fileData.componentSets ?? {}),
        styles_json: JSON.stringify(fileData.styles ?? {}),
      })
      .onConflict((oc) => oc.columns(['file_key', 'version_id']).doNothing())
      .execute();
  } catch {
    // Non-critical: cache write failure is okay
  }
}

// ── Node Tree Traversal ──────────────────────────────────────────────────────

/** Count all nodes in a tree */
export function countNodes(node: FigmaNode): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/** Get all pages (CANVAS nodes) from a document */
export function getPages(document: FigmaNode): FigmaNode[] {
  return document.children?.filter((c) => c.type === 'CANVAS') ?? [];
}

/** Flatten the node tree into an array, with page context */
export function flattenNodes(
  node: FigmaNode,
  pageName: string,
  depth = 0,
): Array<{ node: FigmaNode; pageName: string; depth: number }> {
  const result: Array<{ node: FigmaNode; pageName: string; depth: number }> = [];

  // Skip invisible nodes (they don't affect the final design)
  if (node.visible === false) {
    result.push({ node, pageName, depth });
    return result;
  }

  result.push({ node, pageName, depth });

  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenNodes(child, pageName, depth + 1));
    }
  }

  return result;
}

// ── File Structure Builder ───────────────────────────────────────────────────

/** Build a simplified file structure tree (limited depth) */
export function buildFileStructure(node: FigmaNode, maxDepth: number, currentDepth = 0): FileStructureNode {
  const structNode: FileStructureNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  if (node.visible === false) {
    structNode.visible = false;
  }

  if (node.absoluteBoundingBox) {
    structNode.width = Math.round(node.absoluteBoundingBox.width);
    structNode.height = Math.round(node.absoluteBoundingBox.height);
  }

  if (node.children) {
    structNode.children_count = node.children.length;
    if (currentDepth < maxDepth) {
      structNode.children = node.children.map((child) =>
        buildFileStructure(child, maxDepth, currentDepth + 1),
      );
    }
  }

  return structNode;
}
