import path from "node:path"
import { beforeEach, expect, it, vi } from "vitest"

import { runAimlapiKeyParity } from "~~/scripts/suites/aimlapi/key-parity.mjs"
import { runAimlapiUiTest } from "~~/scripts/suites/aimlapi/ui.mjs"

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  page: {
    evaluate: vi.fn(),
    emulateMedia: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
    getByRole: vi.fn(),
  },
}))
vi.mock("node:fs/promises", () => ({
  default: { mkdir: mocks.mkdir, mkdtemp: mocks.mkdtemp },
}))
vi.mock("~~/scripts/cdp/sandbox.mjs", () => ({
  withTemporaryAccount: async (
    _worker: unknown,
    fixture: unknown,
    run: (fixture: unknown) => Promise<void>,
  ) => run(fixture),
}))
vi.mock("~~/scripts/cdp/ui-driver.mjs", () => ({
  openExtensionPage: async () => mocks.page,
  configureExtensionPage: vi.fn(),
  dismissModals: vi.fn(),
}))
vi.mock("~~/scripts/flows/account-card.mjs", () => ({
  testAccountCardFlow: async () => ({ ok: true }),
}))
vi.mock("~~/scripts/flows/model-catalog.mjs", () => ({
  testModelCatalogFlow: async () => ({ ok: true }),
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.page.evaluate.mockResolvedValue("en")
  mocks.page.close.mockResolvedValue(undefined)
})

it("creates the pricing evidence parent on a clean checkout before making a unique directory", async () => {
  let parentCreated = false
  mocks.mkdir.mockImplementation(async () => {
    parentCreated = true
  })
  mocks.mkdtemp.mockImplementation(async () => {
    if (!parentCreated) throw new Error("ENOENT: missing parent")
    return "evidence"
  })
  mocks.page.getByRole.mockImplementation(() => {
    throw new Error("evidence directory ready")
  })
  await expect(
    runAimlapiUiTest({
      context: {} as never,
      extensionId: "test",
      serviceWorker: {} as never,
    }),
  ).rejects.toThrow("evidence directory ready")
  expect(mocks.mkdir).toHaveBeenCalledWith(
    ".scratch/aimlapi-integration/artifacts",
    { recursive: true },
  )
})

it("keeps key parity screenshots under the ignored feature artifacts directory", async () => {
  mocks.mkdtemp.mockRejectedValue(new Error("stop before live requests"))
  await expect(
    runAimlapiKeyParity({
      context: {} as never,
      extensionId: "test",
      serviceWorker: {} as never,
      managementKey: "test",
    }),
  ).rejects.toThrow("stop before live requests")
  expect(mocks.mkdtemp).toHaveBeenCalledWith(
    path.join(".scratch/aimlapi-integration/artifacts", "keys-"),
  )
})
