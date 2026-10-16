import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { PNG } from "pngjs"
import { expect, it } from "vitest"

const cli = path.resolve("scripts/visual-capture.mjs")

it("advertises generic workflow capture without requiring scenario discovery", () => {
  const help = execFileSync(process.execPath, [cli, "--help"], {
    encoding: "utf8",
  })
  expect(help).toContain("--spec")
  expect(help).toContain("--view")
  expect(help).toContain("captureVisualViews")
})

it("lists maintained capture scenarios without starting a browser", () => {
  const scenarios = JSON.parse(
    execFileSync(process.execPath, [cli, "--list"], { encoding: "utf8" }),
  )
  expect(scenarios).toContainEqual(
    expect.objectContaining({
      id: "api-key-hint",
      checkpoints: ["hint-light-380", "hint-dark-320"],
    }),
  )
})

it("rejects unknown scenarios before running any browser workflow", () => {
  const result = spawnSync(process.execPath, [cli, "--scenario", "unknown"], {
    encoding: "utf8",
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("Unknown capture scenario")
})

it("validates explicitly selected build variants before launching a browser", () => {
  const result = spawnSync(
    process.execPath,
    [cli, "--scenario", "api-key-hint", "--variant", "unknown"],
    { encoding: "utf8" },
  )
  expect(result.status).toBe(1)
  expect(result.stderr).toContain("Unsupported AAH_E2E_BUILD_VARIANT 'unknown'")
})

it("rejects a baseline from another build variant before acquiring the browser lock", (context) => {
  const parent = path.resolve(".scratch/visual-captures")
  mkdirSync(parent, { recursive: true })
  const lock = path.join(parent, "active.lock")
  if (existsSync(lock)) {
    context.skip()
    return
  }
  const directory = mkdtempSync(path.join(tmpdir(), "capture-variant-"))
  const fd = openSync(lock, "wx")
  try {
    const bytes = PNG.sync.write(new PNG({ width: 1, height: 1 }))
    const checkpoints = ["hint-light-380", "hint-dark-320"].map((id) => {
      writeFileSync(path.join(directory, `${id}.png`), bytes)
      return {
        id,
        image: `${id}.png`,
        environment: {},
        source: {
          inputHash: "baseline",
          gitHead: "baseline",
          buildVariant: "default",
        },
        sha256: createHash("sha256").update(bytes).digest("hex"),
      }
    })
    writeFileSync(
      path.join(directory, "capture.json"),
      JSON.stringify({
        version: 1,
        status: "captured",
        scenario: "api-key-hint",
        fixture: "mounted-sponsor-api-credential-v1",
        checkpoints,
      }),
    )
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "--scenario",
        "api-key-hint",
        "--variant",
        "dnr-required",
        "--baseline",
        directory,
      ],
      { encoding: "utf8" },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Baseline build variant differs")
  } finally {
    closeSync(fd)
    unlinkSync(lock)
    rmSync(directory, { recursive: true, force: true })
  }
})

it("accepts custom workflows without registry entries and validates their baseline identity", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "capture-workflow-"))
  try {
    writeFileSync(
      path.join(directory, "capture.json"),
      JSON.stringify({
        version: 1,
        status: "captured",
        scenario: "different-workflow",
        fixture: "test-v1",
        checkpoints: [],
      }),
    )
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "--spec",
        "e2e/sidepanelUserFlows.spec.ts",
        "--grep",
        "my workflow",
        "--fixture",
        "test-v1",
        "--baseline",
        directory,
      ],
      { encoding: "utf8" },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Incompatible baseline capture")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it("rejects incompatible baseline captures before starting a browser", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "capture-baseline-"))
  try {
    writeFileSync(
      path.join(directory, "capture.json"),
      JSON.stringify({
        version: 1,
        status: "captured",
        scenario: "other",
        fixture: "other",
        checkpoints: [],
      }),
    )
    const result = spawnSync(
      process.execPath,
      [cli, "--scenario", "api-key-hint", "--baseline", directory],
      { encoding: "utf8" },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Incompatible baseline capture")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it("rejects invalid view dimensions before launching a custom workflow", () => {
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "--spec",
      "e2e/sidepanelUserFlows.spec.ts",
      "--grep",
      "apiCredential",
      "--fixture",
      "test-v1",
      "--view",
      "dark:0x700",
    ],
    { encoding: "utf8" },
  )
  expect(result.status).toBe(1)
  expect(result.stderr).toContain(
    "--view must be light:WIDTHxHEIGHT or dark:WIDTHxHEIGHT with positive integer dimensions",
  )
})

it("rejects altered baseline images rather than silently pairing them", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "capture-tamper-"))
  try {
    writeFileSync(path.join(directory, "hint-light-380.png"), "altered bytes")
    writeFileSync(
      path.join(directory, "capture.json"),
      JSON.stringify({
        version: 1,
        status: "captured",
        scenario: "api-key-hint",
        fixture: "mounted-sponsor-api-credential-v1",
        checkpoints: [
          {
            id: "hint-light-380",
            image: "hint-light-380.png",
            source: { gitHead: "old", inputHash: "old" },
            environment: {},
            sha256: "original",
          },
          { id: "hint-dark-320" },
        ],
      }),
    )
    const result = spawnSync(
      process.execPath,
      [cli, "--scenario", "api-key-hint", "--baseline", directory],
      { encoding: "utf8" },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Baseline image hash mismatch")
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it("respects an active capture in the same worktree without replacing its lock", (context) => {
  const parent = path.resolve(".scratch/visual-captures")
  mkdirSync(parent, { recursive: true })
  const lock = path.join(parent, "active.lock")
  if (existsSync(lock)) {
    context.skip()
    return
  }
  const fd = openSync(lock, "wx")
  try {
    writeFileSync(fd, "existing capture")
    const result = spawnSync(
      process.execPath,
      [cli, "--scenario", "api-key-hint"],
      { encoding: "utf8" },
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Capture already active")
    expect(readFileSync(lock, "utf8")).toBe("existing capture")
  } finally {
    closeSync(fd)
    unlinkSync(lock)
  }
})

it.runIf(process.env.AAH_VISUAL_CAPTURE_INTEGRATION === "1")(
  "captures asserted real extension states with reproducible metadata",
  () => {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          cli,
          "--spec",
          "e2e/sidepanelUserFlows.spec.ts",
          "--grep",
          "sidepanel receives apiCredential sponsor setup while already mounted$",
          "--fixture",
          "generic-api-hint-v1",
          "--view",
          "dark:410x720",
          "--view",
          "light:360x640",
        ],
        {
          encoding: "utf8",
          timeout: 180_000,
        },
      ),
    )
    const capture = JSON.parse(
      readFileSync(path.join(result.directory, "capture.json"), "utf8"),
    )
    expect(capture).toMatchObject({
      status: "captured",
      fixture: "generic-api-hint-v1",
    })
    expect(capture.checkpoints).toHaveLength(2)
    for (const state of capture.checkpoints) {
      expect(state.source.inputHash).toMatch(/^[a-f0-9]{64}$/)
      expect(state.source.gitHead).toMatch(/^[a-f0-9]{40}$/)
      expect(state.environment.deviceScaleFactor).toBe(1)
      expect(state.environment.theme).toBe(
        state.id.includes("dark") ? "dark" : "light",
      )
      const png = PNG.sync.read(
        readFileSync(path.join(result.directory, state.image)),
      )
      expect([png.width, png.height]).toEqual(
        state.id.includes("dark") ? [410, 720] : [360, 640],
      )
    }
    const after = JSON.parse(
      execFileSync(
        process.execPath,
        [
          cli,
          "--spec",
          "e2e/sidepanelUserFlows.spec.ts",
          "--grep",
          "sidepanel receives apiCredential sponsor setup while already mounted$",
          "--fixture",
          "generic-api-hint-v1",
          "--view",
          "dark:410x720",
          "--view",
          "light:360x640",
          "--baseline",
          result.directory,
          "--diff",
        ],
        { encoding: "utf8", timeout: 180_000 },
      ),
    )
    expect(after.comparisons).toHaveLength(2)
    for (const comparison of after.comparisons) {
      const report = JSON.parse(
        readFileSync(
          comparison.report.replace(/report\.md$/, "report.json"),
          "utf8",
        ),
      )
      expect(report).toMatchObject({
        status: "same-dimensions",
        agentReviewTarget: "after",
      })
      expect(report.before.path).toContain(result.directory)
      expect(report.after.path).toContain(after.directory)
    }
  },
  200_000,
)
