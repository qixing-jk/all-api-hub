import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"

import { runLiveSuites } from "~~/scripts/cdp/live-suites.mjs"

const dirs: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  )
})
async function directory() {
  vi.spyOn(console, "log").mockImplementation(() => {})
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aah-live-test-"))
  dirs.push(dir)
  return dir
}

it("all includes every registered suite and persists omitted coverage for a partial run", async () => {
  const evidenceDir = await directory()
  const probe = vi.fn(async () => ({ ok: true }))
  const ui = vi.fn(async () => {})
  const suites = [
    { id: "probe", covers: ["probe"], run: probe },
    { id: "ui", covers: ["ui"], run: ui },
  ]
  const environment = {
    extensionId: "worktree-extension",
    targetUrl: "https://test.invalid",
  }
  const first = await runLiveSuites({
    suite: "all",
    suites,
    evidenceDir,
    environment,
  })
  expect(probe).toHaveBeenCalledOnce()
  expect(ui).toHaveBeenCalledOnce()
  const report = await runLiveSuites({ suite: "probe", suites, evidenceDir })
  expect(report).toMatchObject({
    ok: true,
    allSelected: false,
    scenarios: [{ status: "passed" }, { status: "not_selected" }],
  })
  expect(
    JSON.parse(await fs.readFile(report.reportFile, "utf8")),
  ).toMatchObject({ allSelected: false })
  expect(JSON.parse(await fs.readFile(first.reportFile, "utf8"))).toMatchObject(
    { allSelected: true, environment },
  )
})

it("retains a skip and failure, continues independent suites, then rejects incomplete acceptance", async () => {
  const evidenceDir = await directory()
  const later = vi.fn(async () => {})
  await expect(
    runLiveSuites({
      suite: "all",
      evidenceDir,
      suites: [
        {
          id: "probe",
          covers: ["probe"],
          run: async () => ({ ok: true, skipped: true, reason: "No session" }),
        },
        {
          id: "ui",
          covers: ["ui"],
          run: async () => {
            throw new Error("Wrong identity")
          },
        },
        { id: "models", covers: ["models"], run: later },
      ],
    }),
  ).rejects.toThrow(/probe \(blocked\).*ui \(failed\)/)
  expect(later).toHaveBeenCalledOnce()
  const [run] = await fs.readdir(evidenceDir)
  const report = JSON.parse(
    await fs.readFile(path.join(evidenceDir, run!, "report.json"), "utf8"),
  )
  expect(report.scenarios).toMatchObject([
    { status: "blocked", reason: "No session" },
    { status: "failed", reason: "Wrong identity" },
    { status: "passed" },
  ])
})

it("rejects invalid selection before running any suite", async () => {
  const evidenceDir = await directory()
  const run = vi.fn()
  await expect(
    runLiveSuites({
      suite: "typo",
      suites: [{ id: "probe", covers: ["probe"], run }],
      evidenceDir,
    }),
  ).rejects.toThrow("Unknown UI scenario")
  expect(run).not.toHaveBeenCalled()
})
