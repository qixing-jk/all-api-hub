import { afterEach, describe, expect, it, vi } from "vitest"

import { createRequestyManagementKeyInPage } from "~/entrypoints/content/messageHandlers/requesty/managementKeyBridge"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("Requesty management key creation", () => {
  it("does not send requests when Clerk confirms the console is signed out", async () => {
    vi.stubGlobal("window", { Clerk: { loaded: true, session: null } })
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)

    await expect(
      createRequestyManagementKeyInPage("All API Hub"),
    ).resolves.toEqual({
      ok: false,
      reason: "session_unavailable",
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("stops waiting when Clerk never initializes", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("window", {})
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)

    const result = createRequestyManagementKeyInPage("All API Hub")
    await vi.advanceTimersByTimeAsync(8_000)

    await expect(result).resolves.toEqual({
      ok: false,
      reason: "session_unavailable",
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(["absent", "loading"])(
    "waits for a %s Clerk before creating one key",
    async (initialState) => {
      vi.useFakeTimers()
      const getToken = vi.fn().mockResolvedValue("console-session-token")
      const clerk = {
        loaded: false,
        session: null as null | { getToken: typeof getToken },
      }
      const pageWindow = {
        Clerk: initialState === "absent" ? undefined : clerk,
      }
      vi.stubGlobal("window", pageWindow)
      const fetch = vi
        .fn()
        .mockResolvedValueOnce({ status: 200, json: async () => ({}) })
        .mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            api_key_id: "key-created",
            api_key: "rqsty-created",
          }),
        })
      vi.stubGlobal("fetch", fetch)

      const result = createRequestyManagementKeyInPage("All API Hub")
      await vi.advanceTimersByTimeAsync(500)
      expect(fetch).not.toHaveBeenCalled()
      pageWindow.Clerk = clerk
      clerk.session = { getToken }
      clerk.loaded = true
      await vi.advanceTimersByTimeAsync(100)

      await expect(result).resolves.toEqual({
        ok: true,
        keyId: "key-created",
        accessToken: "rqsty-created",
      })
      expect(getToken).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledTimes(2)
    },
  )
})
