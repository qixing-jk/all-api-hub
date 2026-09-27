import { test } from "~~/e2e/fixtures/extensionTest"

/**
 * Lets a spec file's cases run in parallel instead of as one atomic unit.
 *
 * Playwright shards whole files by default, so a single long spec pins whichever
 * shard it lands in for its entire runtime: the smoke suite's slowest shard is set by
 * its longest file, not by the total work of the suite. Parallel mode makes each case
 * its own group, which lets that shard's workers run the file's cases concurrently —
 * measured at CI's four workers, the heaviest file drops from 2.8m to 1.2m. The cases
 * normally stay on one shard regardless, since shard boundaries are cut by cumulative
 * test count and a file's cases are adjacent, so this buys in-shard packing rather
 * than cross-shard spreading.
 *
 * This is safe for specs whose cases build their own state, because the `context`
 * fixture is test-scoped here: every case already launches its own extension context
 * with its own temporary user-data dir and intercepts its own `.invalid` routes, so
 * cases in a file share no browser, storage, or stub. Cases that must run in order, or
 * that would collide over a shared resource, must not call this.
 */
export function parallelizeShardableSpec(): void {
  test.describe.configure({ mode: "parallel" })
}
