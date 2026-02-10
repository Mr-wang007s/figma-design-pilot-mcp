// ── Figma File / Node Types (Design Review) ────────────────────────────────

/** Paint type for fills and strokes */
export interface FigmaPaint {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND' | 'IMAGE' | 'EMOJI';
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  blendMode?: string;
  gradientStops?: Array<{ color: FigmaColor; position: number }>;
  boundVariables?: Record<string, FigmaVariableAlias | FigmaVariableAlias[]>;
}

/** RGBA color (0-1 range) */
export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Variable alias reference */
export interface FigmaVariableAlias {
  type: 'VARIABLE_ALIAS';
  id: string;
}

/** Effect (shadow, blur, etc.) */
export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  boundVariables?: Record<string, FigmaVariableAlias>;
}

/** Layout constraint */
export interface FigmaConstraint {
  vertical: 'TOP' | 'BOTTOM' | 'CENTER' | 'TOP_BOTTOM' | 'SCALE';
  horizontal: 'LEFT' | 'RIGHT' | 'CENTER' | 'LEFT_RIGHT' | 'SCALE';
}

/** Type style properties for TEXT nodes */
export interface FigmaTypeStyle {
  fontFamily?: string;
  fontPostScriptName?: string;
  fontWeight?: number;
  fontSize?: number;
  textAlignHorizontal?: 'LEFT' | 'RIGHT' | 'CENTER' | 'JUSTIFIED';
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
  letterSpacing?: number;
  lineHeightPx?: number;
  lineHeightPercent?: number;
  lineHeightUnit?: 'PIXELS' | 'FONT_SIZE_%' | 'INTRINSIC';
}

/** Core Figma Node (simplified for review) */
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  rotation?: number;
  children?: FigmaNode[];

  // Layout
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  constraints?: FigmaConstraint;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  primaryAxisSizingMode?: 'FIXED' | 'AUTO';
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  counterAxisSpacing?: number;

  // Geometry
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];

  // Visual
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  effects?: FigmaEffect[];
  opacity?: number;

  // Text
  style?: FigmaTypeStyle;
  characters?: string;

  // Styles (references to shared styles)
  styles?: Record<string, string>; // { fill: "style_id", text: "style_id", ... }

  // Components
  componentId?: string;           // If INSTANCE, the main component ID
  componentProperties?: Record<string, unknown>;
  componentPropertyReferences?: Record<string, string>;
  overrides?: unknown[];

  // Variables
  boundVariables?: Record<string, FigmaVariableAlias | FigmaVariableAlias[] | Record<string, FigmaVariableAlias>>;
  explicitVariableModes?: Record<string, string>;
}

/** Response from GET /v1/files/:key */
export interface FigmaFileResponse {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaNode;
  components: Record<string, FigmaComponentMeta>;
  componentSets: Record<string, FigmaComponentSetMeta>;
  styles: Record<string, FigmaStyleMeta>;
  schemaVersion: number;
}

/** Component metadata from file response */
export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  componentSetId?: string;
  documentationLinks?: Array<{ uri: string }>;
}

/** Component set metadata */
export interface FigmaComponentSetMeta {
  key: string;
  name: string;
  description: string;
  documentationLinks?: Array<{ uri: string }>;
}

/** Style metadata from file response */
export interface FigmaStyleMeta {
  key: string;
  name: string;
  styleType: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
  description: string;
}

/** Response from GET /v1/files/:key/nodes */
export interface FigmaFileNodesResponse {
  name: string;
  lastModified: string;
  version: string;
  nodes: Record<string, { document: FigmaNode; components: Record<string, FigmaComponentMeta>; styles: Record<string, FigmaStyleMeta> }>;
}

/** Response from GET /v1/images/:key */
export interface FigmaImagesResponse {
  err: string | null;
  images: Record<string, string | null>; // node_id -> image URL
}

/** File version from GET /v1/files/:key/versions */
export interface FigmaVersion {
  id: string;
  created_at: string;
  label: string;
  description: string;
  user: { id: string; handle: string; img_url: string };
}

/** Response from GET /v1/files/:key/versions */
export interface FigmaVersionsResponse {
  versions: FigmaVersion[];
  pagination: { prev_page?: string; next_page?: string };
}

// ── Variables API Types ──────────────────────────────────────────────────────

/** Variable value can be many types */
export type FigmaVariableValue = number | string | boolean | FigmaColor | FigmaVariableAlias;

/** Single variable definition */
export interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  variableCollectionId: string;
  resolvedType: 'BOOLEAN' | 'FLOAT' | 'STRING' | 'COLOR';
  valuesByMode: Record<string, FigmaVariableValue>;
  remote: boolean;
  description: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
  codeSyntax: Record<string, string>;
}

/** Variable collection */
export interface FigmaVariableCollection {
  id: string;
  name: string;
  key: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  remote: boolean;
  hiddenFromPublishing: boolean;
  variableIds: string[];
}

/** Response from GET /v1/files/:key/variables/local */
export interface FigmaVariablesResponse {
  status: number;
  error: boolean;
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

// ── Review DTOs ──────────────────────────────────────────────────────────────

/** Severity of a review issue */
export type ReviewSeverity = 'error' | 'warning' | 'info';

/** Review dimensions */
export type ReviewDimension = 'colors' | 'spacing' | 'typography' | 'components' | 'token_coverage' | 'structure' | 'a11y';

/** Single review issue */
export interface ReviewIssue {
  issue_id: string;
  dimension: ReviewDimension;
  severity: ReviewSeverity;
  rule_id: string;
  node_id?: string;
  node_name?: string;
  node_type?: string;
  page_name?: string;
  message: string;
  suggestion?: string;
  detail: Record<string, unknown>;
}

/** Result of a single dimension check */
export interface DimensionResult {
  passed: boolean;
  errors: number;
  warnings: number;
  info: number;
  issues: ReviewIssue[];
}

/** Token coverage statistics */
export interface TokenCoverageStats {
  percentage: number;
  bound: number;
  total: number;
  by_category: Record<string, { bound: number; total: number; percentage: number }>;
}

/** Full review report */
export interface ReviewReport {
  report_id: string;
  file_key: string;
  file_name: string;
  version: string;
  page_name?: string;
  created_at: string;

  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';

  summary: {
    total_nodes: number;
    total_issues: number;
    errors: number;
    warnings: number;
    info: number;
  };

  token_coverage: TokenCoverageStats;

  dimensions: Record<ReviewDimension, DimensionResult>;

  issues: ReviewIssue[];
}

/** Simplified file structure node for figma_get_file_structure */
export interface FileStructureNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  width?: number;
  height?: number;
  children_count?: number;
  children?: FileStructureNode[];
}

/** Version diff result */
export interface VersionDiffResult {
  file_key: string;
  from_version: string;
  to_version: string;
  pages_added: string[];
  pages_removed: string[];
  nodes_modified: Array<{ node_id: string; name: string; changes: string[] }>;
  components_changed: Array<{ name: string; change_type: 'added' | 'removed' | 'modified' }>;
  styles_changed: Array<{ name: string; change_type: 'added' | 'removed' | 'modified' }>;
  summary: string;
}
