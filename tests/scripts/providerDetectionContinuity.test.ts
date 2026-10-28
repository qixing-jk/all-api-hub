import { chromium } from "@playwright/test"
import { expect, it, vi } from "vitest"

import { runKimiUiTest } from "~~/scripts/suites/kimi/ui.mjs"
// @ts-expect-error Node-only suite has no declarations.
import { runRixUiTest } from "~~/scripts/suites/rix/ui.mjs"

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  sandbox: vi.fn(),
  saved: vi.fn(),
}))
vi.mock("~~/scripts/cdp/ui-driver.mjs", () => ({
  openExtensionPage: mocks.open,
  dismissModals: vi.fn(),
}))
vi.mock("~~/scripts/cdp/sandbox.mjs", () => ({
  getAccounts: async () => [],
  withTemporaryAccount: mocks.sandbox,
  withUiCreatedAccount: mocks.saved,
  withStoredValue: async (
    _worker: unknown,
    _key: string,
    _patch: unknown,
    work: () => unknown,
  ) => work(),
}))

it.each(["correct", "wrong-user", "missing-token", "bad-token"])(
  "Rix carries the verified detection into its catalog (%s)",
  async (mode) => {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.setContent(`<button data-testid="account-management-add-account-button">Add</button><div data-testid="account-management-account-dialog">
      <input data-testid="account-management-site-url-input"><button data-testid="account-management-auto-detect-button">Detect</button>
      <button data-testid="account-management-site-type-trigger" data-site-type="Rix-Api">Rix</button>
      <input data-testid="account-management-user-id-input" value="${mode === "wrong-user" ? "other" : "17"}">
      <input data-testid="account-management-username-input" value="Native Rix">
      <input data-testid="account-management-access-token-input" value="${mode === "missing-token" ? "" : "detected-token"}">
      <button data-testid="account-management-confirm-add-button">Save</button><button onclick="this.parentElement.hidden=true">Cancel</button></div>`)
      mocks.open.mockResolvedValue(page)
      mocks.sandbox.mockRejectedValue(new Error("sandbox boundary"))
      const native = { id: 17, username: "Native Rix" }
      const context = {
        newPage: async () => ({
          goto: async () => {},
          evaluate: async () => native,
          close: async () => {},
        }),
        request: {
          get: async (
            _url: string,
            options: { headers: { Cookie?: string } },
          ) => ({
            ok: () => !(mode === "bad-token" && options.headers.Cookie === ""),
            json: async () => ({ success: true, data: native }),
          }),
        },
      }
      const result = runRixUiTest({
        context,
        extensionId: "fixture",
        serviceWorker: {},
        targetUrl: "https://rix.fixture",
        timeoutMs: 200,
      })
      if (mode === "correct") {
        await expect(result).rejects.toThrow("sandbox boundary")
        expect(mocks.sandbox.mock.calls.at(-1)?.[1].account_info).toMatchObject(
          { id: "17", username: "Native Rix", access_token: "detected-token" },
        )
      } else await expect(result).rejects.not.toThrow("sandbox boundary")
    } finally {
      await browser.close()
      vi.clearAllMocks()
    }
  },
)

it.each([
  "correct",
  "wrong-user",
  "missing-token",
  "wrong-rate",
  "wrong-org",
  "bad-token",
  "refreshed-token",
])(
  "Kimi keeps native identity and checks the actual rate (%s)",
  async (mode) => {
    const browser = await chromium.launch({ headless: true })
    try {
      const detectedToken =
        mode === "refreshed-token" ? "renewed-token" : "native-token"
      const page = await browser.newPage()
      await page.setContent(`<button data-testid="account-management-add-account-button">Add</button><div data-testid="account-management-account-dialog">
      <input data-testid="account-management-site-url-input"><button data-testid="account-management-auto-detect-button">Detect</button>
      <button data-testid="account-management-site-type-trigger" data-site-type="kimi-global">Kimi Global</button>
      <input data-testid="account-management-user-id-input" value="${mode === "wrong-user" ? "other" : "native-user"}">
      <input data-testid="account-management-username-input" value="Native Name">
      <input data-testid="account-management-access-token-input" value="${mode === "missing-token" ? "" : detectedToken}">
      <label>Recharge Amount Ratio (CNY/USD)<input type="number" value="${mode === "wrong-rate" ? "1" : "7.2"}"></label><input type="number" value="7.2">
      <button data-testid="account-management-confirm-add-button">Save</button><button>Cancel</button></div>`)
      mocks.open.mockResolvedValue(page)
      mocks.sandbox.mockRejectedValue(new Error("sandbox boundary"))
      mocks.saved.mockImplementation(async (_worker, _create, work) =>
        work({
          site_url: "https://platform.kimi.ai",
          site_type: "kimi-global",
          account_info: {
            id: "native-user",
            username: "Native Name",
            access_token: detectedToken,
          },
          kimiOpenPlatformAuth: {
            organizationId: mode === "wrong-org" ? "other-org" : "native-org",
          },
        }),
      )
      const nativePage = {
        goto: async () => {},
        waitForTimeout: async () => {},
        close: async () => {},
      }
      let reads = 0
      const context = {
        newPage: async () => nativePage,
        request: {
          get: async (
            _url: string,
            options: { headers: { Cookie?: string } },
          ) => ({
            ok: () => true,
            json: async () => ({
              code: 0,
              data: {
                uid:
                  ++reads > 1 &&
                  mode === "bad-token" &&
                  options.headers.Cookie === ""
                    ? "other"
                    : "native-user",
                name: "Native Name",
                organizations: [{ organization: { id: "native-org" } }],
              },
            }),
          }),
        },
      }
      const result = runKimiUiTest({
        context: context as never,
        extensionId: "fixture",
        serviceWorker: undefined as never,
        token: "native-token",
        organizationId: "native-org",
        timeoutMs: 200,
      })
      if (mode === "correct" || mode === "refreshed-token") {
        await expect(result).rejects.toThrow("sandbox boundary")
        expect(mocks.sandbox.mock.calls.at(-1)?.[1].account_info).toMatchObject(
          {
            id: "native-user",
            username: "Native Name",
            access_token: detectedToken,
          },
        )
      } else await expect(result).rejects.not.toThrow("sandbox boundary")
    } finally {
      await browser.close()
      vi.clearAllMocks()
    }
  },
)
