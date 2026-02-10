import { getImages } from '../../figma/api.js';

interface ExportImagesArgs {
  file_key: string;
  node_ids: string[];
  format?: 'png' | 'svg' | 'pdf' | 'jpg';
  scale?: number;
}

interface ExportImagesResult {
  images: Array<{
    node_id: string;
    url: string | null;
  }>;
  format: string;
  scale: number;
  total: number;
  errors: number;
}

/**
 * figma_export_images tool handler.
 *
 * Exports specified nodes as images (PNG/SVG/PDF/JPG).
 */
export async function handleExportImages(args: ExportImagesArgs): Promise<ExportImagesResult> {
  if (!args.node_ids || args.node_ids.length === 0) {
    throw new Error('node_ids must contain at least one node ID');
  }

  const format = args.format ?? 'png';
  const scale = args.scale ?? 2;

  const response = await getImages(args.file_key, args.node_ids, { format, scale });

  if (response.err) {
    throw new Error(`Figma image export error: ${response.err}`);
  }

  const images = args.node_ids.map((nodeId) => ({
    node_id: nodeId,
    url: response.images[nodeId] ?? null,
  }));

  return {
    images,
    format,
    scale,
    total: images.length,
    errors: images.filter((i) => !i.url).length,
  };
}
