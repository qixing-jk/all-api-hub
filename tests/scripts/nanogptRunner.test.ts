import { readFile } from "node:fs/promises"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { main, parseArgs } from "~~/scripts/test-nanogpt-e2e-live.mjs"

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  probe: vi.fn(),
  catalog: vi.fn(),
  detection: vi.fn(),
  onboarding: vi.fn(),
  currentTab: vi.fn(),
}))
vi.mock("~~/scripts/cdp/client.mjs", () => ({
  connectWorktreeExtension: mocks.connect,
  defaultCdpUrl: () => "http://localhost:9332",
}))
vi.mock("~~/scripts/suites/nanogpt/probe.mjs", () => ({
  runNanoGptProbe: mocks.probe,
}))
vi.mock("~~/scripts/suites/nanogpt/ui.mjs", () => ({
  runNanoGptCatalog: mocks.catalog,
  runNanoGptDetection: mocks.detection,
  runNanoGptOnboarding: mocks.onboarding,
  runNanoGptCurrentTabDetection: mocks.currentTab,
}))
beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => {})
  mocks.connect.mockResolvedValue({ close: mocks.close })
  for (const run of [
    mocks.probe,
    mocks.catalog,
    mocks.detection,
    mocks.onboarding,
    mocks.currentTab,
  ])
    run.mockResolvedValue({ ok: true })
})
afterEach(() => vi.restoreAllMocks())

it("all includes public catalog, protocol, detection and uninterrupted onboarding", async () => {
  await main(["--suite=all"])
  for (const run of [
    mocks.probe,
    mocks.catalog,
    mocks.detection,
    mocks.onboarding,
    mocks.currentTab,
  ])
    expect(run).toHaveBeenCalledOnce()
  expect(mocks.connect).toHaveBeenCalledOnce()
  expect(mocks.close).toHaveBeenCalledOnce()
})
it("keeps missing credentials incomplete and still executes independent suites", async () => {
  mocks.probe.mockResolvedValue({ skipped: true, reason: "missing_api_key" })
  await expect(main(["--suite=all"])).rejects.toThrow("probe (blocked)")
  expect(mocks.catalog).toHaveBeenCalledOnce()
  expect(mocks.onboarding).toHaveBeenCalledOnce()
  expect(mocks.close).toHaveBeenCalledOnce()
})
it("public protocol-only selection does not connect to a browser", async () => {
  await main(["--suite=probe"])
  expect(mocks.probe).toHaveBeenCalledOnce()
  expect(mocks.connect).not.toHaveBeenCalled()
})
it("retains an action failure even when browser detach also fails", async () => {
  mocks.detection.mockRejectedValue(new Error("detection failed"))
  mocks.close.mockRejectedValue(new Error("detach failed"))
  await expect(main(["--suite=detection"])).rejects.toThrow(
    /detection failed.*detach failed/s,
  )
})
it("rejects unknown suites and never accepts a management token as an inference key", () => {
  expect(() => parseArgs(["--suite=unknown"])).toThrow("Invalid suite")
  expect(() =>
    parseArgs([], { NANOGPT_API_KEY: "sk-nano-mgmt-private" }),
  ).toThrow("inference API key")
})

it("redacts credential-bearing CDP endpoints even in detach failures", async () => {
  const endpoint = "http://user:secret@localhost:9332?token=private"
  mocks.close.mockRejectedValue(new Error(`failed to detach from ${endpoint}`))
  await expect(main(["--suite=catalog", `--cdp=${endpoint}`])).rejects.toThrow(
    "failed to detach from [REDACTED]",
  )
})

it("redacts normalized CDP credential components in connection failures", async () => {
  const endpoint = "http://user:p@ss@LOCALHOST:9332"
  mocks.connect.mockRejectedValue(
    new Error(
      "connect http://user:p%40ss@localhost:9332/json/version failed p%40ss",
    ),
  )
  const error = await main(["--suite=catalog", `--cdp=${endpoint}`]).catch(
    (error) => error,
  )
  expect(error.message).not.toContain("p%40ss")
  expect(error.message).not.toContain("user:")
})

it("redacts the derived CDP query from errors, console output and reports", async () => {
  const endpoint = "http://localhost:9332?token=cdp-query-secret"
  mocks.connect.mockRejectedValue(
    new Error(
      "Unexpected status 401 retrieving websocket url from http://localhost:9332/json/version/?token=cdp-query-secret",
    ),
  )
  const error = await main(["--suite=catalog", `--cdp=${endpoint}`]).catch(
    (error) => error,
  )
  const output = String(vi.mocked(console.log).mock.calls[0]![0])
  const report = await readFile(JSON.parse(output).reportFile, "utf8")
  for (const text of [error.message, output, report])
    expect(text).not.toContain("cdp-query-secret")
})
