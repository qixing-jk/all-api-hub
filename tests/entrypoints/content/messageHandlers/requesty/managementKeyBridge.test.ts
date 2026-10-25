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

  it("keeps a rejected organization read as not dispatched", async () => {
    vi.stubGlobal("window", {
      Clerk: {
        loaded: true,
        session: { getToken: vi.fn().mockResolvedValue("console-token") },
      },
    })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 403, json: async () => ({}) })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ api_key_id: "key-created", api_key: "rqsty" }),
      })
    vi.stubGlobal("fetch", fetch)

    await expect(
      createRequestyManagementKeyInPage("All API Hub"),
    ).resolves.toEqual({
      ok: false,
      reason: "organization_unavailable",
    })
    // The create POST must not run before the organization read succeeds.
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["a rejected create", { status: 500, json: async () => ({}) }],
    [
      "a create whose one-time plaintext is unreadable",
      { status: 200, json: async () => ({ api_key_id: "key-created" }) },
    ],
  ])("reports %s as possibly dispatched", async (_label, createResponse) => {
    vi.stubGlobal("window", {
      Clerk: {
        loaded: true,
        session: { getToken: vi.fn().mockResolvedValue("console-token") },
      },
    })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, json: async () => ({}) })
      .mockResolvedValueOnce(createResponse)
    vi.stubGlobal("fetch", fetch)

    // The POST already left the extension, so the provider may hold a key that
    // no response can prove; only a pre-dispatch refusal is `create_rejected`.
    await expect(
      createRequestyManagementKeyInPage("All API Hub"),
    ).resolves.toEqual({
      ok: false,
      reason: "plaintext_missing",
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("reports a create that failed in flight as possibly dispatched", async () => {
    vi.stubGlobal("window", {
      Clerk: {
        loaded: true,
        session: { getToken: vi.fn().mockResolvedValue("console-token") },
      },
    })
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ status: 200, json: async () => ({}) })
      .mockRejectedValueOnce(new Error("network reset"))
    vi.stubGlobal("fetch", fetch)

    await expect(
      createRequestyManagementKeyInPage("All API Hub"),
    ).resolves.toEqual({
      ok: false,
      reason: "plaintext_missing",
    })
  })
})
