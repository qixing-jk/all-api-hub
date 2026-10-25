import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createRequestyManagementKeyInPage,
  REQUESTY_MANAGEMENT_KEY_CHANNEL,
  setupRequestyManagementKeyBridge,
} from "~/entrypoints/content/messageHandlers/requesty/managementKeyBridge"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("Requesty management key creation", () => {
  it("keeps token and organization transport failures before dispatch", async () => {
    const getToken = vi.fn().mockRejectedValue(new Error("session expired"))
    vi.stubGlobal("window", { Clerk: { loaded: true, session: { getToken } } })
    const fetch = vi.fn().mockRejectedValue(new Error("offline"))
    vi.stubGlobal("fetch", fetch)
    await expect(createRequestyManagementKeyInPage("test")).resolves.toEqual({
      ok: false,
      reason: "session_unavailable",
    })
    expect(fetch).not.toHaveBeenCalled()
    getToken.mockResolvedValue("console-token")
    await expect(createRequestyManagementKeyInPage("test")).resolves.toEqual({
      ok: false,
      reason: "organization_unavailable",
    })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("preserves uncertainty when the create response cannot be parsed", async () => {
    vi.stubGlobal("window", {
      Clerk: { loaded: true, session: { getToken: async () => "token" } },
    })
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ status: 200, json: async () => ({}) })
        .mockResolvedValueOnce({
          status: 200,
          json: async () => {
            throw new Error("invalid JSON")
          },
        }),
    )
    await expect(createRequestyManagementKeyInPage("test")).resolves.toEqual({
      ok: false,
      reason: "plaintext_missing",
    })
  })
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

describe("Requesty main-world bridge", () => {
  const origin = "https://app.requesty.ai"
  const request = {
    channel: REQUESTY_MANAGEMENT_KEY_CHANNEL,
    kind: "request",
    correlationId: "op-1",
    name: "test",
  }

  function page(pathname = "/api-keys", pageOrigin = origin, install = true) {
    const addEventListener = vi.fn()
    const postMessage = vi.fn()
    const window = {
      location: { origin: pageOrigin, pathname },
      addEventListener,
      postMessage,
      Clerk: { loaded: true, session: { getToken: async () => "token" } },
    }
    vi.stubGlobal("window", window)
    if (install) setupRequestyManagementKeyBridge()
    return { window, addEventListener, postMessage }
  }

  it("boots the bridge through the unlisted-script entrypoint", async () => {
    const p = page("/api-keys", origin, false)
    const entrypoint = await import("~/entrypoints/requesty-management-key")
    entrypoint.default.main?.()
    expect(p.addEventListener).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["/", origin],
    ["/api-keys", "https://other.example"],
  ])("does not install on %s at %s", (path, host) => {
    expect(page(path, host).addEventListener).not.toHaveBeenCalled()
  })

  it("installs once and rejects foreign or malformed messages without sending requests", () => {
    const p = page()
    setupRequestyManagementKeyBridge()
    expect(p.addEventListener).toHaveBeenCalledTimes(1)
    const receive = p.addEventListener.mock.calls[0]![1]
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    receive({ source: {}, origin, data: request })
    receive({
      source: p.window,
      origin: "https://other.example",
      data: request,
    })
    for (const data of [
      null,
      "request",
      {},
      { ...request, channel: "other" },
      { ...request, kind: "response" },
      { ...request, correlationId: 1 },
      { ...request, correlationId: "" },
      { ...request, correlationId: "a".repeat(129) },
      { ...request, name: null },
    ]) {
      receive({ source: p.window, origin, data })
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(p.postMessage).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    "replies with a correlated, origin-scoped result (created: %s)",
    async (created) => {
      const p = page()
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({ status: 200, json: async () => ({}) })
          .mockResolvedValueOnce({
            status: 200,
            json: async () =>
              created
                ? { api_key_id: "new-key", api_key: "one-time-secret" }
                : {},
          }),
      )
      p.addEventListener.mock.calls[0]![1]({
        source: p.window,
        origin,
        data: request,
      })
      await vi.waitFor(() =>
        expect(p.postMessage).toHaveBeenCalledExactlyOnceWith(
          {
            channel: REQUESTY_MANAGEMENT_KEY_CHANNEL,
            kind: "response",
            correlationId: "op-1",
            ...(created
              ? { ok: true, keyId: "new-key", accessToken: "one-time-secret" }
              : { ok: false, reason: "plaintext_missing" }),
          },
          origin,
        ),
      )
    },
  )
})
