export declare const SMOKE_IGNORED_SPEC_DIRECTORIES: string[]
export declare const DEFAULT_SPEC_DURATIONS_PATH: string
export declare function listShardableSpecs(cwd: string): Promise<string[]>
export declare function fallbackSpecWeight(weights: number[]): number
export declare function assignSpecShards(
  entries: { key: string; weight: number }[],
  shardCount: number,
): { key: string; weight: number }[][]
export declare function readSpecDurations(
  cwd: string,
  file?: string,
): Promise<Record<string, number> | null>
export declare function planSpecShard(options: {
  cwd: string
  index: number
  total: number
  durationsPath?: string
}): Promise<string[] | null>
