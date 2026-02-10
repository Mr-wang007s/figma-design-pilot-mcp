import { getFile } from '../../figma/api.js';

interface GetStylesArgs {
  file_key: string;
}

interface StyleInfo {
  id: string;
  key: string;
  name: string;
  style_type: string;
  description: string;
}

interface GetStylesResult {
  styles: StyleInfo[];
  by_type: Record<string, StyleInfo[]>;
  total_styles: number;
}

/**
 * figma_get_styles tool handler.
 *
 * Returns all published styles from a file (color, text, effect, grid).
 */
export async function handleGetStyles(args: GetStylesArgs): Promise<GetStylesResult> {
  const fileData = await getFile(args.file_key, { depth: 1 });

  const styles: StyleInfo[] = Object.entries(fileData.styles ?? {}).map(([id, meta]) => ({
    id,
    key: meta.key,
    name: meta.name,
    style_type: meta.styleType,
    description: meta.description,
  }));

  // Group by type
  const byType: Record<string, StyleInfo[]> = {};
  for (const style of styles) {
    const type = style.style_type;
    if (!byType[type]) byType[type] = [];
    byType[type].push(style);
  }

  return {
    styles,
    by_type: byType,
    total_styles: styles.length,
  };
}
