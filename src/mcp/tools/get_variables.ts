import { getLocalVariables } from '../../figma/api.js';
import type { FigmaVariable, FigmaVariableCollection } from '../../figma/design_types.js';

interface GetVariablesArgs {
  file_key: string;
  collection_name?: string;
}

interface GetVariablesResult {
  collections: Array<{
    id: string;
    name: string;
    modes: Array<{ modeId: string; name: string }>;
    variable_count: number;
  }>;
  variables: Array<{
    id: string;
    name: string;
    collection: string;
    type: string;
    values: Record<string, unknown>;
    description: string;
  }>;
  total_variables: number;
  total_collections: number;
}

/**
 * figma_get_variables tool handler.
 *
 * Fetches all Design Tokens / Variables from a Figma file.
 * Requires Enterprise plan.
 */
export async function handleGetVariables(args: GetVariablesArgs): Promise<GetVariablesResult> {
  const response = await getLocalVariables(args.file_key);

  const collections = Object.values(response.meta?.variableCollections ?? {}) as FigmaVariableCollection[];
  const variables = Object.values(response.meta?.variables ?? {}) as FigmaVariable[];

  // Build collection name map
  const collectionNameMap = new Map<string, string>();
  for (const col of collections) {
    collectionNameMap.set(col.id, col.name);
  }

  // Filter by collection name if specified
  let filteredVars = variables;
  if (args.collection_name) {
    const targetCollection = collections.find((c) => c.name === args.collection_name);
    if (!targetCollection) {
      throw new Error(`Collection "${args.collection_name}" not found. Available: ${collections.map((c) => c.name).join(', ')}`);
    }
    filteredVars = variables.filter((v) => v.variableCollectionId === targetCollection.id);
  }

  return {
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      modes: c.modes,
      variable_count: c.variableIds.length,
    })),
    variables: filteredVars.map((v) => ({
      id: v.id,
      name: v.name,
      collection: collectionNameMap.get(v.variableCollectionId) ?? v.variableCollectionId,
      type: v.resolvedType,
      values: v.valuesByMode,
      description: v.description,
    })),
    total_variables: filteredVars.length,
    total_collections: collections.length,
  };
}
