import type { Page } from "@playwright/test"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runNewApiSettingsSessionVerificationScenario } from "~~/e2e/scenarios/newApiSettingsSessionVerification"

const { annotations, playwrightExpect, worker, storedPreferences } = vi.hoisted(
  () => ({
    annotations: [] as Array<{ type: string; description: string }>,
    playwrightExpect: Object.assign(vi.fn(), { poll: vi.fn() }),
    worker: { evaluate: vi.fn() },
    storedPreferences: vi.fn(),
  }),
)

vi.mock("~~/e2e/fixtures/extensionTest", () => ({
  expect: playwrightExpect,
  test: {
    info: () => ({ annotations }),
    step: async (_name: string, run: () => Promise<void>) => run(),
  },
}))

vi.mock("~~/e2e/utils/extensionState", () => ({
  getServiceWorker: async () => worker,
  getStoredUserPreferences: storedPreferences,
}))

const config = {
  baseUrl: "https://managed.example",
  adminToken: "fixture-management-token",
  userId: "1",
  username: "admin",
  password: "fixture-password",
  totpSecret: "JBSWY3DPEHPK3PXP",
}

describe("New API settings real-site verification prerequisites", () => {
  beforeEach(() => {
    annotations.length = 0
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each([
    { fail: false, originalSecret: "original-saved-secret" },
    { fail: true, originalSecret: "original-saved-secret" },
    { fail: false, originalSecret: undefined },
    {
      fail: false,
      originalSecret: "original-saved-secret",
      operatorSecret: "operator-edited-secret",
    },
  ])(
    "restores only the scenario's TOTP changes: %j",
    async ({ fail, originalSecret, operatorSecret }) => {
      const prefs = {
        newApi: { ...config, totpSecret: originalSecret },
        unrelated: "before",
      }
      let raw: unknown = fail ? JSON.stringify(prefs) : prefs
      storedPreferences.mockImplementation(async () => structuredClone(prefs))
      worker.evaluate.mockImplementation(async (fn, arg) => fn(arg))
      vi.stubGlobal("navigator", {
        locks: {
          request: async (_name: string, run: () => Promise<void>) => run(),
        },
      })
      vi.stubGlobal("chrome", {
        storage: {
          local: {
            get: async (key: string) => ({ [key]: raw }),
            set: async (values: Record<string, unknown>) => {
              raw = Object.values(values)[0]
            },
          },
        },
      })
      const matcher = {
        toBeVisible: async () => {},
        toHaveCount: async () => {},
        toBe: () => {},
      }
      playwrightExpect.mockReturnValue(matcher)
      playwrightExpect.poll.mockReturnValue(matcher)
      let draft = originalSecret
      const locator = {
        fill: vi.fn(async (value: string) => {
          draft = value
        }),
        blur: vi.fn(async () => {
          const current = typeof raw === "string" ? JSON.parse(raw) : raw
          current.newApi.totpSecret = draft
          current.unrelated = "edited during scenario"
          raw = fail ? JSON.stringify(current) : current
        }),
        click: vi.fn(async () => {
          if (draft === "") {
            if (fail) throw new Error("Manual mode failed")
            if (operatorSecret) {
              const current = typeof raw === "string" ? JSON.parse(raw) : raw
              current.newApi.totpSecret = operatorSecret
              raw = current
            }
          }
        }),
        getByRole: () => locator,
        getByLabel: () => locator,
        or: () => locator,
        isVisible: async () => true,
      }
      const context = { on: vi.fn(), off: vi.fn() }
      const page = {
        context: () => context,
        url: () => "about:blank",
        goto: vi.fn(),
        locator: () => locator,
        getByText: () => locator,
        getByRole: () => locator,
      }
      const run = runNewApiSettingsSessionVerificationScenario({
        page: page as unknown as Page,
        extensionId: "fixture-extension",
        config,
      })
      if (fail) await expect(run).rejects.toThrow("Manual mode failed")
      else await expect(run).resolves.toBeUndefined()
      const finalPrefs =
        typeof raw === "string" ? JSON.parse(raw) : (raw as typeof prefs)
      expect(finalPrefs.newApi.totpSecret).toBe(
        operatorSecret ?? originalSecret,
      )
      if (originalSecret === undefined)
        expect(finalPrefs.newApi).not.toHaveProperty("totpSecret")
      expect(finalPrefs.unrelated).toBe("edited during scenario")
      expect(context.off).toHaveBeenCalledOnce()
    },
  )

  it.each([
    { username: "" },
    { password: "" },
    { totpSecret: "" },
    { totpSecret: "   " },
  ])(
    "omits settings verification when administrator credentials are incomplete: %j",
    async (missing) => {
      const page = {
        url: vi.fn(() => "about:blank"),
        goto: vi.fn().mockResolvedValue(undefined),
        context: vi.fn(() => ({ on: vi.fn(), off: vi.fn() })),
      }
      await expect(
        runNewApiSettingsSessionVerificationScenario({
          page: page as unknown as Page,
          extensionId: "fixture-extension",
          config: { ...config, ...missing },
        }),
      ).resolves.toBeUndefined()
      expect(page.goto).not.toHaveBeenCalled()
      expect(page.context).not.toHaveBeenCalled()
      expect(annotations).toMatchObject([
        { type: "session-verification-not-tested" },
      ])
    },
  )
})
