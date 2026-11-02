import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { main } from "~~/scripts/test-aimlapi-e2e-live.mjs"

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  probe: vi.fn(),
  ui: vi.fn(),
  auth: vi.fn(),
  automatic: vi.fn(),
  keys: vi.fn(),
  close: vi.fn(),
}))
vi.mock("~~/scripts/cdp/client.mjs", () => ({
  connectWorktreeExtension: mocks.connect,
  defaultCdpUrl: () => "http://localhost:9337",
}))
vi.mock("~~/scripts/suites/aimlapi/probe.mjs", () => ({
  runAimlapiProbe: mocks.probe,
}))
vi.mock("~~/scripts/suites/aimlapi/ui.mjs", () => ({
  runAimlapiUiTest: mocks.ui,
}))
vi.mock("~~/scripts/suites/aimlapi/auth.mjs", () => ({
  runAimlapiAuthMatrix: mocks.auth,
}))
vi.mock("~~/scripts/suites/aimlapi/automatic.mjs", () => ({
  runAimlapiAutomaticOnboarding: mocks.automatic,
}))
vi.mock("~~/scripts/suites/aimlapi/key-parity.mjs", () => ({
  runAimlapiKeyParity: mocks.keys,
}))

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => {})
  mocks.connect.mockResolvedValue({ close: mocks.close })
  mocks.probe.mockResolvedValue({ ok: true, checked: 1, failed: [] })
  mocks.auth.mockResolvedValue([{ name: "valid-key", status: "passed" }])
})
afterEach(() => vi.restoreAllMocks())

it("all executes every suite including real automatic onboarding", async () => {
  await main([
    "--suite=all",
    "--management-key=test-management",
    "--api-key=test-api",
  ])
  for (const run of [
    mocks.probe,
    mocks.ui,
    mocks.auth,
    mocks.automatic,
    mocks.keys,
  ])
    expect(run).toHaveBeenCalledOnce()
  expect(mocks.close).toHaveBeenCalledOnce()
})

it("retains a failure and still attempts the other selected suites", async () => {
  mocks.automatic.mockRejectedValue(new Error("identity mismatch"))
  await expect(main(["--suite=all"])).rejects.toThrow("automatic")
  expect(mocks.keys).toHaveBeenCalledOnce()
  expect(mocks.close).toHaveBeenCalledOnce()
})

it("does not report complete success when auth scenarios were skipped", async () => {
  mocks.auth.mockResolvedValue([
    { name: "dual-key", status: "skipped", reason: "missing credential" },
  ])
  await expect(main(["--suite=auth"])).rejects.toThrow("incomplete")
  expect(mocks.close).toHaveBeenCalledOnce()
})

it("reports incomplete protocol coverage when a credential class is missing", async () => {
  await expect(
    main(["--suite=probe", "--management-key=", "--api-key="]),
  ).rejects.toThrow("probe (blocked)")
  expect(mocks.probe).toHaveBeenCalledOnce()
  expect(mocks.connect).not.toHaveBeenCalled()
})

it("runs only automatic onboarding when explicitly selected", async () => {
  await main(["--suite=automatic"])
  expect(mocks.automatic).toHaveBeenCalledOnce()
  for (const run of [mocks.probe, mocks.ui, mocks.auth, mocks.keys])
    expect(run).not.toHaveBeenCalled()
})

it("retains an action failure when shared CDP cleanup also fails", async () => {
  mocks.keys.mockRejectedValue(new Error("key action failed"))
  mocks.close.mockRejectedValue(new Error("detach failed"))
  await expect(main(["--suite=keys"])).rejects.toThrow(
    /key action failed.*detach failed/,
  )
})
