import { execFile, execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { PNG } from "pngjs"
import { afterEach, expect, it } from "vitest"

const roots: string[] = []
const cli = path.resolve("scripts/visual-compare.mjs")
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const cwd = mkdtempSync(path.join(tmpdir(), "visual compare "))
  roots.push(cwd)
  const before = new PNG({ width: 2, height: 1 })
  before.data.set([255, 0, 0, 255, 0, 255, 0, 255])
  const after = new PNG({ width: 2, height: 1 })
  after.data.set([255, 0, 0, 255, 0, 0, 255, 255])
  writeFileSync(path.join(cwd, "before.png"), PNG.sync.write(before))
  writeFileSync(path.join(cwd, "after.png"), PNG.sync.write(after))
  return cwd
}

function run(cwd: string, extra: string[] = []) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        cli,
        "--before",
        "before.png",
        "--after",
        "after.png",
        "--before-source",
        "old-build",
        "--after-source",
        "new-build",
        ...extra,
      ],
      { cwd, encoding: "utf8" },
    ),
  )
}

it("compares real PNG files without modifying them and retains portable review evidence", () => {
  const cwd = fixture()
  const original = readFileSync(path.join(cwd, "before.png"))
  const result = run(cwd, ["--diff"])
  const report = JSON.parse(
    readFileSync(path.join(result.directory, "report.json"), "utf8"),
  )
  expect(report).toMatchObject({
    status: "same-dimensions",
    review: "required",
    reviewScope: "task-final-or-new-risk",
    agentReviewTarget: "after",
    before: {
      source: "old-build",
      sha256: createHash("sha256").update(original).digest("hex"),
    },
    after: { source: "new-build" },
    difference: { changedPixels: 1, totalPixels: 2, ratio: 0.5 },
    invocation: { cwd },
  })
  expect(readFileSync(path.join(cwd, "before.png"))).toEqual(original)
  expect(readFileSync(path.join(result.directory, "before.png"))).toEqual(
    original,
  )
  const diff = PNG.sync.read(
    readFileSync(path.join(result.directory, "diff.png")),
  )
  expect([...diff.data]).toEqual([0, 0, 0, 255, 255, 0, 255, 255])
  const preview = PNG.sync.read(
    readFileSync(path.join(result.directory, "comparison.png")),
  )
  expect(preview.height).toBeGreaterThan(1)
  expect([
    ...preview.data.subarray(
      (preview.height - 1) * preview.width * 4,
      (preview.height - 1) * preview.width * 4 + 8,
    ),
  ]).toEqual([255, 0, 0, 255, 0, 255, 0, 255])
  expect(
    readFileSync(path.join(result.directory, "report.md"), "utf8"),
  ).toContain("![Before / After](comparison.png)")
})

it("retains unequal-sized captures at original scale and refuses a misleading pixel diff", () => {
  const cwd = fixture()
  const larger = new PNG({ width: 3, height: 2 })
  larger.data.fill(128)
  writeFileSync(path.join(cwd, "after.png"), PNG.sync.write(larger))
  const result = run(cwd, ["--diff"])
  const report = JSON.parse(
    readFileSync(path.join(result.directory, "report.json"), "utf8"),
  )
  expect(report).toMatchObject({
    status: "dimension-mismatch",
    difference: null,
    review: "required",
  })
  expect(() => readFileSync(path.join(result.directory, "diff.png"))).toThrow()
  const before = PNG.sync.read(
    readFileSync(path.join(result.directory, "before.png")),
  )
  const after = PNG.sync.read(
    readFileSync(path.join(result.directory, "after.png")),
  )
  expect([before.width, before.height, after.width, after.height]).toEqual([
    2, 1, 3, 2,
  ])
  expect(
    readFileSync(path.join(result.directory, "report.md"), "utf8"),
  ).toContain("dimension-mismatch")
})

it("records after-only evidence as missing a baseline rather than a passed comparison", () => {
  const cwd = fixture()
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [cli, "--after", "after.png", "--after-source", "new-build", "--diff"],
      { cwd, encoding: "utf8" },
    ),
  )
  const report = JSON.parse(
    readFileSync(path.join(result.directory, "report.json"), "utf8"),
  )
  expect(report).toMatchObject({
    status: "missing-baseline",
    before: null,
    difference: null,
    review: "required",
  })
  expect(
    readFileSync(path.join(result.directory, "report.md"), "utf8"),
  ).toContain("![After](after.png)")
  expect(() =>
    readFileSync(path.join(result.directory, "before.png")),
  ).toThrow()
})

it.each([
  [[], "--after"],
  [["--after", "after.png"], "--after-source"],
  [
    ["--after", "after.png", "--after-source", "new", "--before", "before.png"],
    "--before-source",
  ],
  [
    [
      "--after",
      "before.png",
      "--after-source",
      "old",
      "--before-source",
      "unpaired",
    ],
    "requires --before",
  ],
  [["--after", "invalid.png", "--after-source", "new"], "Invalid PNG"],
  [["--after", "missing.png", "--after-source", "new"], "ENOENT"],
  [["--unknown"], "Unknown option"],
])(
  "rejects invalid inputs %j before creating evidence directories",
  (args, error) => {
    const cwd = fixture()
    writeFileSync(path.join(cwd, "invalid.png"), "not a PNG")
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: "utf8",
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(error)
    expect(result.stdout).toBe("")
    expect(existsSync(path.join(cwd, ".scratch/visual-comparisons"))).toBe(
      false,
    )
  },
)

it("records caller-declared capture context separately from image dimensions", () => {
  const cwd = fixture()
  const result = run(cwd, [
    "--context",
    "Chromium; en; light; DPR 1; fixture A; dialog open",
  ])
  const report = JSON.parse(
    readFileSync(path.join(result.directory, "report.json"), "utf8"),
  )
  expect(report.context).toBe(
    "Chromium; en; light; DPR 1; fixture A; dialog open",
  )
  expect(report.provenance).toContain("caller-declared")
})

it.each([
  ["identical pixels", 255, 0],
  ["alpha-only change", 128, 1],
])(
  "keeps exact difference metrics descriptive for %s",
  (_name, alpha, changedPixels) => {
    const cwd = fixture()
    const after = PNG.sync.read(readFileSync(path.join(cwd, "before.png")))
    after.data[3] = alpha
    writeFileSync(path.join(cwd, "after.png"), PNG.sync.write(after))
    const result = run(cwd, ["--diff"])
    const report = JSON.parse(
      readFileSync(path.join(result.directory, "report.json"), "utf8"),
    )
    expect(report).toMatchObject({
      review: "required",
      difference: { changedPixels, totalPixels: 2 },
    })
  },
)

it("isolates concurrent output across worktrees and repeated runs in a shared parent", async () => {
  const left = fixture()
  const right = fixture()
  const execute = promisify(execFile)
  const invoke = async (cwd: string, extra: string[] = []) =>
    JSON.parse(
      (
        await execute(
          process.execPath,
          [
            cli,
            "--before",
            path.join(left, "before.png"),
            "--after",
            "after.png",
            "--before-source",
            "left build",
            "--after-source",
            "current build",
            ...extra,
          ],
          { cwd },
        )
      ).stdout,
    )
  const [a, b, c, d] = await Promise.all([
    invoke(left),
    invoke(right),
    invoke(right, ["--output", path.join(left, "shared")]),
    invoke(right, ["--output", path.join(left, "shared")]),
  ])
  expect(
    new Set([a.directory, b.directory, c.directory, d.directory]).size,
  ).toBe(4)
  expect(path.relative(left, a.directory)).toMatch(/^\.scratch/)
  expect(path.relative(right, b.directory)).toMatch(/^\.scratch/)
  for (const result of [a, b, c, d]) {
    const report = JSON.parse(
      readFileSync(path.join(result.directory, "report.json"), "utf8"),
    )
    expect(report.before.path).toBe(path.join(left, "before.png"))
    expect(report.after.path).toBe(
      path.join(report.invocation.cwd, "after.png"),
    )
    expect(report.difference).toBeNull()
  }
})
