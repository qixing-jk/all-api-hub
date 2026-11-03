import fs from "node:fs/promises"
import path from "node:path"

/**
 * Playwright cuts `--shard` slices by test *count*, so a single long spec decides how
 * long the shard that happens to contain it runs. CI wall clock for the default E2E
 * suite is therefore set by where the heavy specs land: measured runs spread 387s to
 * 948s of work over six equal-count shards (2.45x) while every spec is known.
 *
 * This module packs specs by measured duration instead, using the timings the E2E
 * workflow publishes from each run's JSON reports. The shape mirrors the unit-test
 * sequencer (`vitest.shardSequencer.ts`): longest-processing-time-first packing with
 * a median fallback for specs the manifest does not cover, and an explicit fallback
 * to `--shard` when no manifest is available.
 */

/** Directories the smoke suite never collects; keep in sync with `playwright.config.ts`. */
export const SMOKE_IGNORED_SPEC_DIRECTORIES = [
  "e2e/realSite",
  "e2e/dnrRequired",
  "e2e/firefox",
]

export const DEFAULT_SPEC_DURATIONS_PATH = ".e2e-durations/spec-durations.json"

/**
 * @param cwd Repository root.
 * @returns Repository-relative spec files the smoke suite runs, sorted.
 */
export async function listShardableSpecs(cwd) {
  const specs = []
  await collectSpecs(path.resolve(cwd, "e2e"), cwd, specs)
  return specs.sort()
}

/**
 * @param directory Absolute directory to scan.
 * @param cwd Repository root used for relative paths.
 * @param specs Accumulator for repository-relative posix paths.
 */
async function collectSpecs(directory, cwd, specs) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    const relative = path.relative(cwd, absolute).split(path.sep).join("/")
    if (entry.isDirectory()) {
      if (SMOKE_IGNORED_SPEC_DIRECTORIES.some((dir) => relative === dir))
        continue
      await collectSpecs(absolute, cwd, specs)
    } else if (
      entry.isFile() &&
      /\.(spec|test)\.[cm]?[jt]sx?$/u.test(entry.name)
    ) {
      specs.push(relative)
    }
  }
}

/**
 * Duration used for a spec the manifest does not describe — a spec added or renamed
 * after the timings were published. The median keeps new files from being treated as
 * free, which would pile them onto whichever shard looks empty.
 * @param weights Known weights.
 * @returns Median weight, or 0 when there is nothing to compare against.
 */
export function fallbackSpecWeight(weights) {
  if (weights.length === 0) return 0
  const sorted = [...weights].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const upper = sorted[middle]
  if (upper === undefined) return 0
  if (sorted.length % 2 === 1) return upper
  const lower = sorted[middle - 1]
  return lower === undefined ? upper : (lower + upper) / 2
}

/**
 * Longest-processing-time-first packing: heaviest spec first, always onto the shard
 * with the least work so far. Deterministic for a given set of weights and keys.
 * @param entries Specs to distribute.
 * @param shardCount Number of shards to distribute them across.
 * @returns One list per shard, in shard order.
 */
export function assignSpecShards(entries, shardCount) {
  const shards = Array.from({ length: shardCount }, () => [])
  const loads = Array.from({ length: shardCount }, () => 0)
  const heaviestFirst = [...entries].sort(
    (a, b) =>
      b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  )

  for (const entry of heaviestFirst) {
    let target = 0
    for (let index = 1; index < shardCount; index += 1) {
      const candidateLoad = loads[index]
      const targetLoad = loads[target]
      const candidateShard = shards[index]
      const targetShard = shards[target]
      if (
        candidateLoad === undefined ||
        targetLoad === undefined ||
        !candidateShard ||
        !targetShard
      ) {
        continue
      }
      // Equal loads fall back to the emptier shard, so equal weights still spread
      // instead of filling shard 0 first.
      const lighter = candidateLoad < targetLoad
      const emptier =
        candidateLoad === targetLoad &&
        candidateShard.length < targetShard.length
      if (lighter || emptier) target = index
    }
    const targetShard = shards[target]
    if (!targetShard) continue
    targetShard.push(entry)
    loads[target] = (loads[target] ?? 0) + entry.weight
  }

  return shards
}

/**
 * @param cwd Repository root.
 * @param [file] Manifest path relative to the repository root.
 * @returns Per-spec milliseconds, or null
 *   when no usable manifest is present.
 */
export async function readSpecDurations(
  cwd,
  file = DEFAULT_SPEC_DURATIONS_PATH,
) {
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.resolve(cwd, file), "utf8"),
    )
    const durations = manifest?.durations
    if (manifest?.version !== 1 || !durations) return null
    const entries = Object.entries(durations).filter(
      ([key, value]) => typeof key === "string" && typeof value === "number",
    )
    return entries.length > 0 ? Object.fromEntries(entries) : null
  } catch {
    return null
  }
}

/**
 * Selects the specs one shard should run.
 * @param options Shard selection and the timings manifest to read.
 * @param options.cwd Repository root.
 * @param options.index One-based shard index.
 * @param options.total Number of shards.
 * @param [options.durationsPath] Manifest path relative to the root.
 * @returns Specs for this shard, or null when the caller
 *   should fall back to Playwright's own `--shard` split.
 */
export async function planSpecShard({
  cwd,
  index,
  total,
  durationsPath = DEFAULT_SPEC_DURATIONS_PATH,
}) {
  if (!Number.isInteger(index) || !Number.isInteger(total)) return null
  if (index < 1 || index > total) {
    throw new Error(`Shard index ${index} is outside 1..${total}`)
  }

  const durations = await readSpecDurations(cwd, durationsPath)
  if (!durations) return null

  const specs = await listShardableSpecs(cwd)
  if (total > specs.length) return null

  const known = specs
    .map((spec) => durations[spec])
    .filter((weight) => typeof weight === "number")
  if (known.length === 0) return null

  const fallback = fallbackSpecWeight(known)
  const shards = assignSpecShards(
    specs.map((spec) => ({ key: spec, weight: durations[spec] ?? fallback })),
    total,
  )
  return (shards[index - 1] ?? []).map((entry) => entry.key).sort()
}
