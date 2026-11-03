import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  assignSpecShards,
  fallbackSpecWeight,
  listShardableSpecs,
  planSpecShard,
  readSpecDurations,
} from "~~/e2e/utils/e2eShardPlan.shared.js"

const directories: string[] = []
const smokeWorkflow = readFileSync(
  ".github/workflows/e2e-smoke.yml",
  "utf8",
).replace(/\r/g, "")
it("propagates planner failures and preserves successful empty-plan fallback", () => {
  const step = smokeWorkflow
    .split("      - name: Run E2E smoke")[1]
    ?.split("      - name:")[0]
  if (!step) throw new Error("Missing smoke step")
  const script = step
    .split("        run: |\n")[1]
    ?.split("\n")
    .map((line) => line.slice(10))
    .join("\n")
  expect(script).toBeDefined()
  function run(mode: string) {
    return execFileSync(
      process.platform === "win32"
        ? "C:/Program Files/Git/bin/bash.exe"
        : "bash",
      [
        "-c",
        `node() { if [ "$PLAN_MODE" = fail ]; then return 9; fi; if [ "$PLAN_MODE" = specs ]; then printf 'e2e/a.spec.ts\\ne2e/b.spec.ts\\n'; fi; }; pnpm() { printf '%s\\n' "$@"; };\n${script}`,
      ],
      {
        env: {
          ...process.env,
          PLAN_MODE: mode,
          AAH_E2E_SHARD_INDEX: "2",
          AAH_E2E_SHARD_TOTAL: "6",
          AAH_E2E_TYPE: "default",
        },
        encoding: "utf8",
      },
    )
  }
  expect(() => run("fail")).toThrow()
  expect(run("empty")).toContain("--shard=2/6")
  expect(run("specs")).toContain("e2e/b.spec.ts")
})
it("restores timings before planning and skips publishing absent reports", () => {
  expect(
    smokeWorkflow.indexOf("- name: Restore E2E spec durations"),
  ).toBeLessThan(smokeWorkflow.indexOf("- name: Run E2E smoke"))
  const write = smokeWorkflow
    .split("- name: Write spec durations manifest")[1]
    ?.split("- name:")[0]
  const save = smokeWorkflow.split("- name: Save spec durations")[1]
  expect(write).toContain("hashFiles('.e2e-durations/reports/**/*.json') != ''")
  expect(save).toContain(
    "hashFiles('.e2e-durations/spec-durations.json') != ''",
  )
})
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "aah-e2e-shard-plan-"))
  directories.push(directory)
  return directory
}

function specEntry(key: string, weight: number) {
  return { key, weight }
}

describe("duration-balanced spec packing", () => {
  it("collects all Playwright default test filename variants", async () => {
    const cwd = temporaryDirectory()
    mkdirSync(path.join(cwd, "e2e"))
    const names = [
      "a.spec.ts",
      "b.test.ts",
      "c.spec.js",
      "d.test.mjs",
      "e.spec.cts",
      "f.test.tsx",
      "g.spec.jsx",
      "h.test.cjs",
      "i.spec.mts",
    ]
    for (const name of [...names, "helper.ts"])
      writeFileSync(path.join(cwd, "e2e", name), "")
    expect(await listShardableSpecs(cwd)).toEqual(
      names.map((name) => `e2e/${name}`).sort(),
    )
  })
  it("assigns every spec to exactly one shard", () => {
    const specs = Array.from({ length: 37 }, (_, index) =>
      specEntry(`e2e/spec-${index}.spec.ts`, (index % 7) * 10 + 1),
    )
    for (const total of [1, 2, 3, 6, 8]) {
      const shards = assignSpecShards(specs, total)
      const assigned = shards.flat().map((entry) => entry.key)
      expect(shards).toHaveLength(total)
      expect(assigned.sort()).toEqual(specs.map((spec) => spec.key).sort())
    }
  })

  it("keeps shard work within a tenth of the lightest shard", () => {
    const weights = [
      217, 163, 161, 150, 94, 76, 75, 73, 72, 71, 69, 68, 65, 59, 57, 56, 47,
      44, 32, 30, 28, 25, 22, 20, 18, 16, 14, 12, 10, 8,
    ]
    const specs = weights.map((weight, index) =>
      specEntry(`e2e/spec-${index}.spec.ts`, weight),
    )
    const loads = assignSpecShards(specs, 6).map((shard) =>
      shard.reduce((total, entry) => total + entry.weight, 0),
    )
    expect(Math.max(...loads) / Math.min(...loads)).toBeLessThan(1.1)
  })

  it("is deterministic and spreads equal weights instead of filling shard zero", () => {
    const specs = Array.from({ length: 12 }, (_, index) =>
      specEntry(`e2e/spec-${String(index).padStart(2, "0")}.spec.ts`, 100),
    )
    const first = assignSpecShards(specs, 6).map((shard) =>
      shard.map((entry) => entry.key),
    )
    const second = assignSpecShards([...specs].reverse(), 6).map((shard) =>
      shard.map((entry) => entry.key),
    )
    expect(second).toEqual(first)
    for (const shard of first) expect(shard).toHaveLength(2)
  })

  it.each([
    [[], 0],
    [[30], 30],
    [[10, 30], 20],
    [[10, 20, 31], 20],
  ])("falls back to the median weight for %j", (weights, expected) => {
    expect(fallbackSpecWeight(weights as number[])).toBe(expected)
  })
})

describe("shard planning", () => {
  it("returns no plan without a durations manifest so the caller can fall back", async () => {
    const cwd = temporaryDirectory()
    mkdirSync(path.join(cwd, "e2e"), { recursive: true })
    writeFileSync(path.join(cwd, "e2e", "a.spec.ts"), "")
    expect(await planSpecShard({ cwd, index: 1, total: 2 })).toBeNull()
  })

  it("rejects a shard index outside the requested total", async () => {
    const cwd = temporaryDirectory()
    await expect(planSpecShard({ cwd, index: 4, total: 3 })).rejects.toThrow(
      /outside 1\.\.3/,
    )
  })

  it("weights unlisted specs at the median instead of treating them as free", async () => {
    const cwd = temporaryDirectory()
    mkdirSync(path.join(cwd, "e2e"), { recursive: true })
    for (const name of ["heavy", "medium", "light", "new"]) {
      writeFileSync(path.join(cwd, "e2e", `${name}.spec.ts`), "")
    }
    writeFileSync(
      path.join(cwd, "durations.json"),
      JSON.stringify({
        version: 1,
        durations: {
          "e2e/heavy.spec.ts": 300_000,
          "e2e/medium.spec.ts": 20_000,
          "e2e/light.spec.ts": 5_000,
        },
      }),
    )
    const shards = await Promise.all(
      [1, 2].map((index) =>
        planSpecShard({
          cwd,
          index,
          total: 2,
          durationsPath: "durations.json",
        }),
      ),
    )
    // The heavy spec lands alone, and the median-weighted unknown does not follow it
    // into the same shard.
    expect(shards.flat().sort()).toEqual([
      "e2e/heavy.spec.ts",
      "e2e/light.spec.ts",
      "e2e/medium.spec.ts",
      "e2e/new.spec.ts",
    ])
    expect(shards[0]).toEqual(["e2e/heavy.spec.ts"])
    expect(shards[1]).toHaveLength(3)
  })

  it("ignores manifests without any duration this repository can use", async () => {
    const cwd = temporaryDirectory()
    mkdirSync(path.join(cwd, "e2e"), { recursive: true })
    writeFileSync(path.join(cwd, "e2e", "a.spec.ts"), "")
    writeFileSync(
      path.join(cwd, "durations.json"),
      JSON.stringify({ version: 1, durations: { "e2e/gone.spec.ts": 1000 } }),
    )
    expect(
      await planSpecShard({
        cwd,
        index: 1,
        total: 1,
        durationsPath: "durations.json",
      }),
    ).toBeNull()
  })

  it.each([
    ["missing", null],
    ["malformed", "{"],
    ["wrong version", JSON.stringify({ version: 2, durations: {} })],
    ["empty", JSON.stringify({ version: 1, durations: {} })],
  ])("treats a %s manifest as unusable", async (_label, contents) => {
    const cwd = temporaryDirectory()
    if (contents !== null) {
      writeFileSync(path.join(cwd, "durations.json"), contents)
    }
    expect(await readSpecDurations(cwd, "durations.json")).toBeNull()
  })
})

describe("repository spec inventory", () => {
  it("skips the suites the smoke run never collects", async () => {
    const specs = await listShardableSpecs(process.cwd())
    expect(specs.length).toBeGreaterThan(100)
    expect(specs).toEqual([...specs].sort())
    expect(specs).toContain("e2e/accountActionMenu.spec.ts")
    for (const spec of specs) {
      expect(spec.startsWith("e2e/")).toBe(true)
      expect(spec.endsWith(".spec.ts")).toBe(true)
      expect(spec).not.toMatch(/^e2e\/(realSite|dnrRequired|firefox)\//u)
    }
  })

  it("covers every collected spec across the default shards", async () => {
    const specs = await listShardableSpecs(process.cwd())
    const cwd = temporaryDirectory()
    const manifest = {
      version: 1,
      durations: Object.fromEntries(
        specs.map((spec, index) => [spec, 1000 + index * 37]),
      ),
    }
    const durationsPath = path.join(cwd, "durations.json")
    writeFileSync(durationsPath, JSON.stringify(manifest))
    const planned = []
    for (let index = 1; index <= 6; index += 1) {
      const shard = await planSpecShard({
        cwd: process.cwd(),
        index,
        total: 6,
        durationsPath,
      })
      expect(shard).not.toBeNull()
      planned.push(...(shard ?? []))
    }
    // A spec missing from every shard would silently stop running in CI.
    expect(planned.sort()).toEqual(specs)
  })
})

describe("durations manifest writer", () => {
  it("sums the final attempt of each test per spec file", () => {
    const reports = temporaryDirectory()
    const output = path.join(reports, "spec-durations.json")
    writeFileSync(
      path.join(reports, "shard-1.json"),
      JSON.stringify({
        suites: [
          {
            title: "accountActionMenu.spec.ts",
            file: "e2e/accountActionMenu.spec.ts",
            specs: [
              {
                title: "opens the menu",
                tests: [
                  {
                    results: [
                      { duration: 5000, status: "failed" },
                      { duration: 2000, status: "passed" },
                    ],
                  },
                ],
              },
            ],
            suites: [
              {
                title: "nested",
                specs: [
                  {
                    title: "keeps state",
                    file: "e2e/accountActionMenu.spec.ts",
                    tests: [
                      { results: [{ duration: 3000, status: "passed" }] },
                    ],
                  },
                ],
              },
            ],
          },
          {
            // Playwright reports paths relative to `testDir` (`e2e`).
            title: "other.spec.ts",
            file: "other.spec.ts",
            specs: [
              {
                title: "runs",
                tests: [{ results: [{ duration: 7000, status: "passed" }] }],
              },
            ],
          },
          {
            // Setup suites are reported too and must not become shard weights.
            title: "build.setup.ts",
            file: "setup/build.setup.ts",
            specs: [
              {
                title: "builds",
                tests: [{ results: [{ duration: 90000, status: "passed" }] }],
              },
            ],
          },
        ],
      }),
    )
    execFileSync(
      process.execPath,
      ["scripts/write-e2e-spec-durations.mjs", reports, output],
      { stdio: "ignore" },
    )
    const manifest = JSON.parse(readFileSync(output, "utf8"))
    expect(manifest.version).toBe(1)
    expect(manifest.durations["e2e/accountActionMenu.spec.ts"]).toBe(5000)
    expect(manifest.durations["e2e/other.spec.ts"]).toBe(7000)
  })
})
