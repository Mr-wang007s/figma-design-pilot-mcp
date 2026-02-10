import { getFileVersions } from '../../figma/api.js';

interface GetFileVersionsArgs {
  file_key: string;
  limit?: number;
}

interface VersionInfo {
  id: string;
  created_at: string;
  label: string;
  description: string;
  user: { id: string; handle: string };
}

interface GetFileVersionsResult {
  versions: VersionInfo[];
  total: number;
}

/**
 * figma_get_file_versions tool handler.
 *
 * Returns the version history of a Figma file.
 */
export async function handleGetFileVersions(args: GetFileVersionsArgs): Promise<GetFileVersionsResult> {
  const response = await getFileVersions(args.file_key, { limit: args.limit ?? 20 });

  const versions: VersionInfo[] = response.versions.map((v) => ({
    id: v.id,
    created_at: v.created_at,
    label: v.label,
    description: v.description,
    user: { id: v.user.id, handle: v.user.handle },
  }));

  return {
    versions,
    total: versions.length,
  };
}
