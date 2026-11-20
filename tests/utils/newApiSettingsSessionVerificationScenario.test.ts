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

function createObservedScenario(baseUrl: string, readChannelKey = false) {
  const pollArguments: unknown[] = []
  const pollResults: unknown[] = []
  const listeners = new Map<string, (event: unknown) => Promise<void>>()
  const context = {
    on: vi.fn((event: string, listener: (value: unknown) => Promise<void>) =>
      listeners.set(event, listener),
    ),
    off: vi.fn((event: string) => listeners.delete(event)),
  }
  let secret: string | undefined = config.totpSecret
  storedPreferences.mockImplementation(async () => ({
    newApi: { ...config, totpSecret: secret },
  }))
  worker.evaluate.mockResolvedValue(undefined)
  playwrightExpect.mockImplementation((value) => ({
    toBe: (expected: unknown) => expect(value).toBe(expected),
    toBeVisible: async () => {},
    toBeHidden: async () => {},
    toHaveCount: async () => {},
  }))
  playwrightExpect.poll.mockImplementation((read) => ({
    toBe: async (expected: unknown) => {
      const result = await read()
      pollArguments.push(expected)
      pollResults.push(result)
      expect(result).toBe(expected)
    },
  }))
  const verify = async () => {
    if (readChannelKey)
      await listeners.get("request")?.({
        url: () => `${baseUrl}/api/channel/47/key`,
      })
    await listeners.get("response")?.({
      url: () => `${baseUrl}/api/channel/`,
      ok: () => true,
      json: async () => ({ data: { items: [{ id: 47 }] } }),
    })
    await listeners.get("response")?.({
      url: () => `${baseUrl}/api/verify`,
      ok: () => true,
      request: () => ({
        postDataJSON: () => ({
          scope: "channel.key.read",
          context: { channel_id: 47 },
        }),
      }),
      json: async () => ({
        success: true,
        data: { proof_token: "fixture-proof" },
      }),
    })
  }
  const totp = {
    fill: async (value: string) => {
      secret = value
    },
    blur: vi.fn(),
  }
  const code = { fill: vi.fn() }
  const submit = { click: verify }
  const dialog = {
    getByLabel: () => code,
    getByRole: (_role: string, options?: { name?: string }) =>
      options?.name === "Submit login code"
        ? { isVisible: async () => false }
        : submit,
  }
  const page = {
    context: () => context,
    url: () => "about:blank",
    goto: vi.fn(),
    locator: (selector: string) =>
      selector === "#new-api-totp-secret input"
        ? totp
        : {
            getByRole: () => ({
              click: async () => {
                if (secret) await verify()
              },
            }),
          },
    getByText: () => ({ isVisible: async () => true }),
    getByRole: () => dialog,
  }
  return {
    page: page as unknown as Page,
    context,
    config: { ...config, baseUrl },
    pollArguments,
    pollResults,
  }
}

describe("New API settings real-site verification prerequisites", () => {
  beforeEach(() => {
    annotations.length = 0
  })

  afterEach(() => vi.unstubAllGlobals())

  it("keeps administrator TOTP values out of recorded poll results and matcher arguments", async () => {
    const fixture = createObservedScenario("https://managed.example")
    await runNewApiSettingsSessionVerificationScenario({
      ...fixture,
      extensionId: "fixture-extension",
    })
    expect(fixture.pollArguments).not.toContain(config.totpSecret)
    expect(fixture.pollResults).not.toContain(config.totpSecret)
    expect(
      fixture.pollResults.every(
        (value) => typeof value === "boolean" || typeof value === "number",
      ),
    ).toBe(true)
  })

  it.each(["https://managed.example", "https://managed.example/gateway"])(
    "observes live inventory and proof relative to base URL %s",
    async (baseUrl) => {
      const fixture = createObservedScenario(baseUrl)
      await expect(
        runNewApiSettingsSessionVerificationScenario({
          ...fixture,
          extensionId: "fixture-extension",
        }),
      ).resolves.toBeUndefined()
      for (const registration of fixture.context.on.mock.calls) {
        expect(fixture.context.off).toHaveBeenCalledWith(...registration)
      }
    },
  )

  it.each(["https://managed.example", "https://managed.example/gateway"])(
    "rejects channel-key dispatch before its response at %s",
    async (baseUrl) => {
      const fixture = createObservedScenario(baseUrl, true)
      await expect(
        runNewApiSettingsSessionVerificationScenario({
          ...fixture,
          extensionId: "fixture-extension",
        }),
      ).rejects.toThrow()
      for (const registration of fixture.context.on.mock.calls) {
        expect(fixture.context.off).toHaveBeenCalledWith(...registration)
      }
    },
  )

  it.each([
    { fail: false, originalSecret: "original-saved-secret" },
    { fail: true, originalSecret: "original-saved-secret" },
    { fail: false, originalSecret: undefined },
    { fail: true, originalSecret: "original-saved-secret", delayedSave: true },
    {
      fail: false,
      originalSecret: "original-saved-secret",
      earlyManualSuccess: true,
    },
    { fail: true, originalSecret: "original-saved-secret", cleanupFails: true },
    {
      fail: false,
      originalSecret: "original-saved-secret",
      operatorSecret: "operator-edited-secret",
    },
  ])(
    "restores only the scenario's TOTP changes: %j",
    async ({
      fail,
      originalSecret,
      operatorSecret,
      cleanupFails,
      delayedSave,
      earlyManualSuccess,
    }) => {
      const prefs = {
        newApi: { ...config, totpSecret: originalSecret },
        unrelated: "before",
      }
      let raw: unknown = fail ? JSON.stringify(prefs) : prefs
      let pendingSave: (() => void) | undefined
      storedPreferences.mockImplementation(async () => {
        pendingSave?.()
        pendingSave = undefined
        return structuredClone(typeof raw === "string" ? JSON.parse(raw) : raw)
      })
      worker.evaluate.mockImplementation(async (fn, arg) => fn(arg))
      if (cleanupFails)
        worker.evaluate.mockRejectedValue(
          new Error("Preference restoration failed"),
        )
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
      playwrightExpect.mockImplementation((value) => ({
        ...matcher,
        toBeVisible: async () => {
          if (earlyManualSuccess && value?.manualCode)
            throw new Error("Manual verification form is missing")
        },
      }))
      playwrightExpect.poll.mockImplementation((read) => ({
        toBe: async (expected: unknown) => {
          if (typeof expected !== "number") expect(await read()).toBe(expected)
        },
      }))
      let draft = originalSecret
      const locator = {
        fill: vi.fn(async (value: string) => {
          draft = value
        }),
        blur: vi.fn(async () => {
          const value = draft
          const save = () => {
            const current = typeof raw === "string" ? JSON.parse(raw) : raw
            current.newApi.totpSecret = value
            current.unrelated = "edited during scenario"
            raw = fail ? JSON.stringify(current) : current
          }
          if (delayedSave && value === "") pendingSave = save
          else save()
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
        getByRole: (_role: string, options?: { name?: string }) =>
          options?.name === "Submit login code"
            ? { ...locator, isVisible: async () => false }
            : locator,
        getByLabel: () => ({ ...locator, manualCode: true }),
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
      if (cleanupFails) {
        await expect(run).rejects.toMatchObject({
          errors: [
            new Error("Manual mode failed"),
            new Error("Preference restoration failed"),
          ],
        })
        expect(context.off).toHaveBeenCalledTimes(context.on.mock.calls.length)
        for (const registration of context.on.mock.calls)
          expect(context.off).toHaveBeenCalledWith(...registration)
        return
      }
      if (fail) await expect(run).rejects.toThrow("Manual mode failed")
      else if (earlyManualSuccess)
        await expect(run).rejects.toThrow("Manual verification form is missing")
      else await expect(run).resolves.toBeUndefined()
      pendingSave?.()
      const finalPrefs =
        typeof raw === "string" ? JSON.parse(raw) : (raw as typeof prefs)
      expect(finalPrefs.newApi.totpSecret).toBe(
        operatorSecret ?? originalSecret,
      )
      if (originalSecret === undefined)
        expect(finalPrefs.newApi).not.toHaveProperty("totpSecret")
      expect(finalPrefs.unrelated).toBe("edited during scenario")
      expect(context.off).toHaveBeenCalledTimes(context.on.mock.calls.length)
      for (const registration of context.on.mock.calls)
        expect(context.off).toHaveBeenCalledWith(...registration)
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
