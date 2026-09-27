/**
 * Per-file unit-test costs derived from Vitest blob reports.
 *
 * Used by `scripts/write-unit-test-durations.mjs` to publish the manifest that
 * `vitest.shardSequencer.ts` packs shards with. Types live in the sibling `.d.mts`.
 */

/**
 * A file's cost is not just its test bodies: for the jsdom project, collection and
 * environment setup are per-file costs that a shard pays before a single assertion runs,
 * so a weighting that ignored them would systematically under-rate the dom files.
 * @param file Blob report entry for one test file.
 * @returns Milliseconds this file occupies a worker.
 */
export function measureFileCost(file) {
  const asNumber = (value) => (typeof value === "number" ? value : 0)
  const result = file.result
  return (
    asNumber(result?.duration) +
    asNumber(file.setupDuration) +
    asNumber(file.prepareDuration) +
    asNumber(file.collectDuration) +
    asNumber(file.environmentLoad)
  )
}

/**
 * Sum the costs of a set of blob reports.
 * @param reports Decoded blob reports from one or more shards of the same run.
 * @returns Per-file costs with their source shard, and per-shard totals.
 */
export function summarizeBlobReports(reports) {
  const entries = new Map()
  const shardTotals = new Map()

  for (const report of reports) {
    if (report.shard !== null) {
      shardTotals.set(report.shard, shardTotals.get(report.shard) ?? 0)
    }
    for (const file of report.files) {
      const key = file.name
      if (typeof key !== "string") continue
      const cost = measureFileCost(file)
      // `name` is relative to the Vitest root, so keys stay portable across machines
      // (CI runners check out under different absolute paths than a laptop does).
      const existing = entries.get(key)
      entries.set(key, {
        cost: (existing?.cost ?? 0) + cost,
        shard: existing?.shard ?? report.shard,
      })
      if (report.shard !== null) {
        shardTotals.set(
          report.shard,
          (shardTotals.get(report.shard) ?? 0) + cost,
        )
      }
    }
  }

  return { entries, shardTotals }
}

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
export function correctForShardLoad(entries, shardTotals) {
  const totals = [...shardTotals.values()]
  if (totals.length === 0 || totals.some((total) => total <= 0)) return null
  for (const { shard } of entries.values()) {
    if (shard === null) return null
    const total = shardTotals.get(shard)
    if (total === undefined || total <= 0) return null
  }

  const meanTotal =
    totals.reduce((sum, total) => sum + total, 0) / totals.length
  const corrected = new Map()
  for (const [file, { cost, shard }] of entries) {
    corrected.set(file, cost * (meanTotal / shardTotals.get(shard)))
  }
  return corrected
}
