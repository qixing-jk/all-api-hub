import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { BaseSequencer } from "vitest/node"
import type { TestSpecification, Vitest } from "vitest/node"

import {
  assignShards,
  DurationBalancedSequencer,
  fallbackWeight,
} from "~~/vitest.shardSequencer"

const temporaryRoots: string[] = []

/** @returns A throwaway directory standing in for the repository root. */
function createRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "aah-shard-sequencer-"))
  temporaryRoots.push(root)
  return root
}

/**
 * Builds the minimum Vitest context the sequencers read.
 * @param root Vitest root directory.
 * @param shard Shard selection, as `--shard=index/count` resolves it.
 * @param shard.index Shard this process is running.
 * @param shard.count Total shards the run is split into.
 */
function createContext(
  root: string,
  shard?: { index: number; count: number },
): Vitest {
  return { config: { root, shard } } as unknown as Vitest
}

/**
 * Builds a test specification.
 * @param root Vitest root directory.
 * @param relativePath Path relative to the root.
 * @param absolute Whether `moduleId` is absolute, as Vitest reports it.
 */
function createSpec(
  root: string,
  relativePath: string,
  absolute = false,
): TestSpecification {
  return {
    moduleId: absolute ? path.join(root, relativePath) : relativePath,
  } as unknown as TestSpecification
}

/**
 * Publishes a durations manifest and points the sequencer at it.
 * @param root Vitest root directory.
 * @param durations Per-file milliseconds keyed by repository-relative path.
 */
function writeManifest(
  root: string,
  durations: Record<string, number>,
): string {
  const manifestPath = path.join(root, "shard-durations.json")
  writeFileSync(manifestPath, JSON.stringify({ version: 1, durations }))
  process.env.UNIT_TEST_SHARD_DURATIONS = manifestPath
  return manifestPath
}

afterEach(() => {
  delete process.env.UNIT_TEST_SHARD_DURATIONS
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop() as string, { recursive: true, force: true })
  }
})

describe("assignShards", () => {
  it("puts the heaviest file on its own shard and evens out the rest", () => {
    const shards = assignShards(
      [
        { key: "a", weight: 50 },
        { key: "b", weight: 30 },
        { key: "c", weight: 10 },
        { key: "d", weight: 5 },
      ],
      2,
    )

    expect(shards.map((shard) => shard.map((entry) => entry.key))).toEqual([
      ["a"],
      ["b", "c", "d"],
    ])
  })

  it("gives every shard at least one file when there are enough files", () => {
    const shards = assignShards(
      [
        { key: "a", weight: 100 },
        { key: "b", weight: 1 },
        { key: "c", weight: 1 },
      ],
      3,
    )

    expect(shards.every((shard) => shard.length > 0)).toBe(true)
  })

  it("is stable when the input order changes", () => {
    const entries = [
      { key: "a", weight: 50 },
      { key: "b", weight: 30 },
      { key: "c", weight: 30 },
    ]

    expect(assignShards(entries, 2)).toEqual(
      assignShards([...entries].reverse(), 2),
    )
  })

  it("spreads files evenly when every weight is equal", () => {
    const shards = assignShards(
      Array.from({ length: 6 }, (_, index) => ({
        key: `file-${index}`,
        weight: 10,
      })),
      3,
    )

    expect(shards.map((shard) => shard.length)).toEqual([2, 2, 2])
  })
})

describe("fallbackWeight", () => {
  it("returns the median of an odd number of weights", () => {
    expect(fallbackWeight([10, 30, 20])).toBe(20)
  })

  it("averages the two middle weights for an even count", () => {
    expect(fallbackWeight([10, 20, 30, 40])).toBe(25)
  })

  it("returns zero when nothing is known", () => {
    expect(fallbackWeight([])).toBe(0)
  })
})

describe("DurationBalancedSequencer", () => {
  it("splits a heavy file off the shard the rest of the work lands on", async () => {
    const root = createRoot()
    writeManifest(root, {
      "tests/heavy.test.ts": 90,
      "tests/light-a.test.ts": 10,
      "tests/light-b.test.ts": 5,
    })
    const files = [
      createSpec(root, "tests/heavy.test.ts"),
      createSpec(root, "tests/light-a.test.ts"),
      createSpec(root, "tests/light-b.test.ts"),
    ]

    const firstShard = await new DurationBalancedSequencer(
      createContext(root, { index: 1, count: 2 }),
    ).shard(files)
    const secondShard = await new DurationBalancedSequencer(
      createContext(root, { index: 2, count: 2 }),
    ).shard(files)

    expect(firstShard.map((spec) => spec.moduleId)).toEqual([
      "tests/heavy.test.ts",
    ])
    expect(secondShard.map((spec) => spec.moduleId).sort()).toEqual([
      "tests/light-a.test.ts",
      "tests/light-b.test.ts",
    ])
  })

  it("matches durations for absolute module ids", async () => {
    const root = createRoot()
    writeManifest(root, {
      "tests/heavy.test.ts": 90,
      "tests/light-a.test.ts": 10,
      "tests/light-b.test.ts": 5,
    })
    const files = [
      createSpec(root, "tests/heavy.test.ts", true),
      createSpec(root, "tests/light-a.test.ts", true),
      createSpec(root, "tests/light-b.test.ts", true),
    ]

    const shard = await new DurationBalancedSequencer(
      createContext(root, { index: 1, count: 2 }),
    ).shard(files)

    expect(shard).toHaveLength(1)
    expect(shard[0].moduleId).toBe(path.join(root, "tests/heavy.test.ts"))
  })

  it("weights files the manifest predates at the median, not as free", async () => {
    const root = createRoot()
    writeManifest(root, { "tests/heavy.test.ts": 100 })
    const files = [
      createSpec(root, "tests/heavy.test.ts"),
      createSpec(root, "tests/new-a.test.ts"),
      createSpec(root, "tests/new-b.test.ts"),
      createSpec(root, "tests/new-c.test.ts"),
    ]

    const firstShard = await new DurationBalancedSequencer(
      createContext(root, { index: 1, count: 2 }),
    ).shard(files)

    // Median weight (100) puts two files on the first shard; treating the unknowns as
    // free would leave the heavy file alone there.
    expect(firstShard).toHaveLength(2)
  })

  it("falls back to the default file-count slices without a manifest", async () => {
    const root = createRoot()
    delete process.env.UNIT_TEST_SHARD_DURATIONS
    process.env.UNIT_TEST_SHARD_DURATIONS = path.join(root, "absent.json")
    const files = Array.from({ length: 9 }, (_, index) =>
      createSpec(root, `tests/file-${index}.test.ts`),
    )

    const fallback = await new DurationBalancedSequencer(
      createContext(root, { index: 2, count: 3 }),
    ).shard(files)
    const defaultShard = await new BaseSequencer(
      createContext(root, { index: 2, count: 3 }),
    ).shard(files)

    expect(fallback).toEqual(defaultShard)
  })

  it("falls back to the default slices when the manifest describes none of the files", async () => {
    const root = createRoot()
    writeManifest(root, { "tests/renamed-away.test.ts": 100 })
    const files = Array.from({ length: 9 }, (_, index) =>
      createSpec(root, `tests/file-${index}.test.ts`),
    )

    const fallback = await new DurationBalancedSequencer(
      createContext(root, { index: 2, count: 3 }),
    ).shard(files)
    const defaultShard = await new BaseSequencer(
      createContext(root, { index: 2, count: 3 }),
    ).shard(files)

    expect(fallback).toEqual(defaultShard)
  })
})
