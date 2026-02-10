import { getFile } from '../../figma/api.js';
import { buildFileStructure, getPages, countNodes } from '../../core/review/file_reader.js';
import type { FileStructureNode } from '../../figma/design_types.js';

interface GetFileStructureArgs {
  file_key: string;
  depth?: number;
  page_name?: string;
}

interface GetFileStructureResult {
  file_name: string;
  version: string;
  total_nodes: number;
  pages: FileStructureNode[];
}

/**
 * figma_get_file_structure tool handler.
 *
 * Returns a simplified file structure tree.
 */
export async function handleGetFileStructure(args: GetFileStructureArgs): Promise<GetFileStructureResult> {
  const maxDepth = args.depth ?? 3;

  // Fetch with limited depth for performance
  const fileData = await getFile(args.file_key, { depth: maxDepth + 2 });

  const pages = getPages(fileData.document);
  const targetPages = args.page_name
    ? pages.filter((p) => p.name === args.page_name)
    : pages;

  if (args.page_name && targetPages.length === 0) {
    throw new Error(`Page "${args.page_name}" not found. Available pages: ${pages.map((p) => p.name).join(', ')}`);
  }

  const structPages = targetPages.map((page) => buildFileStructure(page, maxDepth));

  return {
    file_name: fileData.name,
    version: fileData.version,
    total_nodes: countNodes(fileData.document),
    pages: structPages,
  };
}
