import fs from "node:fs"
import path from "node:path"
import { BaseSequencer } from "vitest/node"
import type { TestSpecification } from "vitest/node"

/**
 * Vitest's default sharding sorts test files by a hash of their path and slices that list
 * into equal *file counts* (see `BaseSequencer.shard`). Test files differ by two orders of
 * magnitude in cost, so where a heavy file lands decides a shard's wall clock: shard 5 was
 * running 2x the work of shard 3 on unchanged code, and adding shards did not help because
 * the heavy files still concentrated in one slice.
 *
 * This sequencer instead packs files by measured cost, using the timings CI publishes from
 * each run's blob reports (`scripts/write-unit-test-durations.mjs`). Without a manifest it
 * falls back to the default slices, so a cache miss or a plain local run behaves as before.
 */
const DEFAULT_MANIFEST_PATH = ".vitest-durations/shard-durations.json"

type DurationsManifest = {
  version?: number
  durations?: Record<string, number>
}

export type WeightedSpec = {
  /** Repository-relative path, matching the keys in the durations manifest. */
  key: string
  /** Measured milliseconds this file occupies a worker. */
  weight: number
}

/**
 * Longest-processing-time-first packing: heaviest file first, always onto the shard with
 * the least work so far. Deterministic for a given set of weights and keys.
 * @param entries Files to distribute.
 * @param shardCount Number of shards to distribute them across.
 * @returns One list of entries per shard, in shard order.
 */
export function assignShards<T extends WeightedSpec>(
  entries: T[],
  shardCount: number,
): T[][] {
  const shards: T[][] = Array.from({ length: shardCount }, () => [])
  const loads = Array.from({ length: shardCount }, () => 0)
  const heaviestFirst = [...entries].sort(
    (a, b) =>
      b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  )

  for (const entry of heaviestFirst) {
    let target = 0
    for (let index = 1; index < shardCount; index += 1) {
      if (loads[index] < loads[target]) target = index
    }
    shards[target].push(entry)
    loads[target] += entry.weight
  }

  return shards
}

/**
 * Weight for a file the manifest does not cover — a test file added after the timings were
 * published. The median keeps new files from being treated as free, which would pile them
 * onto whichever shard looks empty.
 * @param weights Weights of the files the manifest does cover.
 * @returns Median weight, or 0 when there is nothing to compare against.
 */
export function fallbackWeight(weights: number[]): number {
  if (weights.length === 0) return 0
  const sorted = [...weights].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export class DurationBalancedSequencer extends BaseSequencer {
  private manifest: Record<string, number> | null | undefined

  /**
   * Slices tests into shards by measured cost, falling back to the default file-count
   * slices when no durations manifest is available.
   * @param files Every test file this run would execute.
   * @returns The files belonging to the shard Vitest is running.
   */
  override async shard(
    files: TestSpecification[],
  ): Promise<TestSpecification[]> {
    const shard = this.ctx.config.shard
    const durations = this.readManifest()
    if (!shard || !durations || shard.count > files.length) {
      return super.shard(files)
    }

    const located = files.map((spec) => ({
      spec,
      key: this.relativePath(spec),
    }))
    const fallback = fallbackWeight(
      located
        .map(({ key }) => durations[key])
        .filter((weight): weight is number => typeof weight === "number"),
    )

    const assigned = assignShards(
      located.map(({ spec, key }) => ({
        spec,
        key,
        weight: durations[key] ?? fallback,
      })),
      shard.count,
    )

    return (assigned[shard.index - 1] ?? []).map((entry) => entry.spec)
  }

  /**
   * @param spec Test file to locate.
   * @returns Its path relative to the Vitest root, with forward slashes.
   */
  private relativePath(spec: TestSpecification): string {
    const absolute = path.resolve(this.ctx.config.root, spec.moduleId)
    return path
      .relative(this.ctx.config.root, absolute)
      .split(path.sep)
      .join("/")
  }

  /**
   * Reads the durations manifest once per run.
   * @returns Per-file milliseconds, or null when no usable manifest is present.
   */
  private readManifest(): Record<string, number> | null {
    if (this.manifest !== undefined) return this.manifest

    const configuredPath =
      process.env.UNIT_TEST_SHARD_DURATIONS ?? DEFAULT_MANIFEST_PATH
    const manifestPath = path.resolve(this.ctx.config.root, configuredPath)
    try {
      const manifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      ) as DurationsManifest
      const durations = manifest.durations
      this.manifest =
        durations && Object.keys(durations).length > 0 ? durations : null
    } catch {
      this.manifest = null
    }

    if (!this.manifest) {
      console.info(
        `[shard-sequencer] No usable durations manifest at ${configuredPath}; sharding by file count.`,
      )
    }

    return this.manifest
  }
}
