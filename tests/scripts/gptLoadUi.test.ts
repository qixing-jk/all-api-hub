import { afterEach, describe, expect, it, vi } from "vitest"

import settings from "~/locales/en/settings.json"
// @ts-expect-error This Node-only CLI module has no TypeScript declarations.
import { runGptLoadUiTest } from "~~/scripts/suites/gpt-load/ui.mjs"

vi.mock("~~/scripts/cdp/sandbox.mjs", () => ({
  withStoredValue: async (
    _worker: unknown,
    _key: string,
    _patch: unknown,
    run: () => Promise<void>,
  ) => run(),
}))
vi.mock("~~/scripts/cdp/ui-driver.mjs", () => ({ dismissModals: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("gpt-load UI cleanup", () => {
  it.each(["leftover", "network", "both", "clean"])(
    "handles seed cleanup (%s) without hiding the UI outcome",
    async (mode) => {
      const groups = new Map<number, string>()
      const uiError = new Error("original UI failure")
      let createdName = ""
      const locator = (selector: string) => ({
        locator: (next: string) => locator(next),
        getByRole: () => locator(selector),
        first: () => locator(selector),
        filter: () => locator(selector),
        inputValue: async () => "https://ui.example.invalid",
        allTextContents: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValue([settings.gptLoad.validation.success]),
        scrollIntoViewIfNeeded: async () => {},
        getAttribute: async () => "managed-site-channel-row-2",
        waitFor: async (options: { state: string }) => {
          if (mode === "network" && selector.includes("add-channel-button"))
            throw uiError
          if (mode === "both" && options.state === "detached") throw uiError
        },
        fill: async (value: string) => {
          if (selector.includes("name-input")) createdName = value
        },
        click: async () => {
          if (selector.includes("channel-dialog-submit-button"))
            groups.set(2, createdName)
          if (selector.includes("delete-confirm-button") && mode !== "both")
            groups.delete(2)
        },
      })
      const page = {
        addInitScript: async () => {},
        goto: async () => {},
        waitForLoadState: async () => {},
        close: async () => {},
        locator,
      }
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          groups.set(1, JSON.parse(String(init.body)).name)
          return Response.json({ data: { group_id: 1 } })
        }
        if (init?.method === "DELETE") {
          if (mode === "network" || mode === "both")
            throw new Error("cleanup offline")
          if (mode === "leftover") return new Response(null, { status: 500 })
          groups.delete(Number(url.split("/").at(-1)))
          return Response.json({})
        }
        return Response.json({
          data: { items: [...groups].map(([id, name]) => ({ id, name })) },
        })
      })
      vi.stubGlobal("fetch", fetchMock)
      const log = vi.spyOn(console, "log").mockImplementation(() => {})
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const run = runGptLoadUiTest({
        context: { newPage: async () => page },
        extensionId: "fake-extension",
        serviceWorker: {},
        baseUrl: "https://ui.example.invalid",
        managementKey: "fake-key",
      })
      if (mode === "network" || mode === "both")
        await expect(run).rejects.toBe(uiError)
      else if (mode === "leftover")
        await expect(run).rejects.toThrow(/cleanup|清理/i)
      else await expect(run).resolves.toBeUndefined()
      expect(fetchMock).toHaveBeenCalledWith(
        "https://ui.example.invalid/api/groups/1",
        expect.objectContaining({ method: "DELETE" }),
      )
      if (mode === "both")
        expect(fetchMock).toHaveBeenCalledWith(
          "https://ui.example.invalid/api/groups/2",
          expect.objectContaining({ method: "DELETE" }),
        )
      if (mode !== "clean")
        expect(
          log.mock.calls
            .flat()
            .some((value) => String(value).includes("实测全部完成")),
        ).toBe(false)
      else expect(groups.size).toBe(0)
    },
  )
})
