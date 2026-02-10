import { getFile } from '../../figma/api.js';

interface GetComponentsArgs {
  file_key: string;
}

interface ComponentInfo {
  id: string;
  key: string;
  name: string;
  description: string;
  component_set?: string;
  documentation_links?: string[];
}

interface GetComponentsResult {
  components: ComponentInfo[];
  component_sets: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
  }>;
  total_components: number;
  total_component_sets: number;
}

/**
 * figma_get_components tool handler.
 *
 * Returns all components and component sets from a file.
 */
export async function handleGetComponents(args: GetComponentsArgs): Promise<GetComponentsResult> {
  // Fetch file with minimal depth (components metadata is in file root)
  const fileData = await getFile(args.file_key, { depth: 1 });

  const components: ComponentInfo[] = Object.entries(fileData.components ?? {}).map(([id, meta]) => ({
    id,
    key: meta.key,
    name: meta.name,
    description: meta.description,
    component_set: meta.componentSetId,
    documentation_links: meta.documentationLinks?.map((l) => l.uri),
  }));

  const componentSets = Object.entries(fileData.componentSets ?? {}).map(([id, meta]) => ({
    id,
    key: meta.key,
    name: meta.name,
    description: meta.description,
  }));

  return {
    components,
    component_sets: componentSets,
    total_components: components.length,
    total_component_sets: componentSets.length,
  };
}
