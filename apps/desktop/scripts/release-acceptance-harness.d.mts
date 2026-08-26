// Type surface for TypeScript scripts importing the acceptance harness.
// Only the subset consumed across the .mjs/.ts script boundary is declared;
// the implementation lives in release-acceptance-harness.mjs.
export function stableJson(value: unknown): string;

export interface HarnessInventoryEntry {
  bytes?: number;
  deleted?: boolean;
  kind: string;
  mode?: number;
  path: string;
  resolvedPath?: string;
  sha256?: string;
  target?: string;
}

export interface SourceFingerprint {
  algorithm: string;
  digest: string;
  fileCount: number;
  files: HarnessInventoryEntry[];
  pathSetDigest: string;
  recipe: string;
}

export interface DependencyRootsFingerprint {
  algorithm: string;
  digest: string;
  fileCount: number;
  files: HarnessInventoryEntry[];
  roots: { digest: string; fileCount: number; path: string }[];
}

export function sourceFingerprint(root?: string): Promise<SourceFingerprint>;

export function dependencyRootsFingerprint(
  sourceRoot: string,
  relativeRoots: string[],
): Promise<DependencyRootsFingerprint>;
