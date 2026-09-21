/** Blob entry for one test file, as decoded from a flatted Vitest blob report. */
export type BlobFile = Record<string, unknown>

/** One decoded blob report: the test files it contains and the shard that ran them. */
export interface BlobReport {
  /** 1-based shard index, or null when the report file name does not carry one. */
  shard: number | null
  files: BlobFile[]
}

/** A file's measured cost and the shard that measured it. */
export interface FileCost {
  /** Milliseconds the file occupied a worker in that run. */
  cost: number
  /** Shard whose report measured this file, or null when unknown. */
  shard: number | null
}

export interface BlobCostSummary {
  /** Per-file measured cost, keyed by repository-relative path. */
  entries: Map<string, FileCost>
  /** Total measured cost per shard index. */
  shardTotals: Map<number, number>
}

/**
 * A file's cost is not just its test bodies: for the jsdom project, collection and
 * environment setup are per-file costs that a shard pays before a single assertion runs,
 * so a weighting that ignored them would systematically under-rate the dom files.
 * @param file Blob report entry for one test file.
 * @returns Milliseconds this file occupies a worker.
 */
export function measureFileCost(file: BlobFile): number

/**
 * Sum the costs of a set of blob reports.
 * @param reports Decoded blob reports from one or more shards of the same run.
 * @returns Per-file costs with their source shard, and per-shard totals.
 */
export function summarizeBlobReports(reports: BlobReport[]): BlobCostSummary

/**
 * Remove each shard's load factor from its files' measured costs. A file measured in an
 * overloaded shard reads expensive because of contention, not because it is; packing the
 * next run with those raw weights chases the previous run's imbalance instead of the
 * files' real cost. Dividing by the shard's share of the mean total is the first-order
 * correction, and with it the predicted per-shard totals landed within ~10% of the next
 * run's measurements on real data.
 * @param entries Per-file measured costs with their source shard.
 * @param shardTotals Total measured cost per shard.
 * @returns Corrected per-file costs, or null when the measurements do not support a
 *   correction (missing shard attribution, or a shard with no measured cost).
 */
export function correctForShardLoad(
  entries: Map<string, FileCost>,
  shardTotals: Map<number, number>,
): Map<string, number> | null
