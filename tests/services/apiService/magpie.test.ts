import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { magpieManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/magpie"
import {
  deleteMagpieProvider,
  discoverMagpieModels,
  listMagpieProviders,
  mutateMagpieProviderKey,
  readMagpieProviderKey,
  saveMagpieProvider,
  setMagpieProviderEnabled,
} from "~/services/apiService/magpie/providers"
import {
  MagpieApiError,
  requestMagpie,
  withMagpieRequestSession,
} from "~/services/apiService/magpie/request"
import { fetchWithHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import { createApiOperationContext } from "~/services/apiTransport/operationContext"
import { createManagedSiteOperationContext } from "~/services/managedSites/operationContext"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { isolateWebLocks } from "~~/tests/test-utils/webLocks"

const config = {
  baseUrl: "http://localhost:3430/magpie",
  webKey: "management-key",
}
const fetchMock = vi.fn()
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  })
const provider = {
  id: "relay",
  name: "Relay",
  chat: "https://relay.test/v1",
  responses: "",
  anthropic: "",
  key: { set: true, masked: "sk-***", optional: false },
  chosen: ["model-a"],
  models: [{ id: "model-a" }],
  off: false,
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function installOriginRules() {
  isolateWebLocks()
  vi.spyOn(browser.runtime, "getURL").mockReturnValue(
    "chrome-extension://extension-id/",
  )
  vi.stubEnv("BROWSER", "chrome")
  let rule: browser.declarativeNetRequest.Rule | undefined
  const updateSessionRules = vi.fn(
    async (input: { addRules?: browser.declarativeNetRequest.Rule[] }) => {
      rule = input.addRules?.[0]
    },
  )
  const containsPermission = vi.fn().mockResolvedValue(true)
  vi.stubGlobal("chrome", {
    runtime: { id: "extension-id" },
    permissions: { contains: containsPermission },
    declarativeNetRequest: { updateSessionRules },
  })
  return { updateSessionRules, containsPermission, current: () => rule }
}

describe("Magpie management transport", () => {
  it.each(["permission", "install", "cleanup"])(
    "settles the caller deadline during stalled native %s while retaining pending rule ownership",
    async (phase) => {
      const rules = installOriginRules()
      const session = withMagpieRequestSession({
        ...config,
        baseUrl: "http://192.168.1.20:3430",
      })
      fetchMock.mockImplementation(async () => json({ providers: [provider] }))
      await listMagpieProviders(session)
      fetchMock.mockClear()
      const native = createDeferred<void>()
      const entered = createDeferred<void>()
      const update = rules.updateSessionRules.getMockImplementation()!
      if (phase === "permission") {
        rules.containsPermission.mockImplementationOnce(async () => {
          entered.resolve()
          await native.promise
          return true
        })
      } else {
        let stalled = false
        rules.updateSessionRules.mockImplementation(async (input) => {
          if (!stalled && Boolean(input.addRules) === (phase === "install")) {
            stalled = true
            entered.resolve()
            await native.promise
          }
          await update(input)
        })
      }
      vi.useFakeTimers()
      let outcome: unknown
      const pending = saveMagpieProvider(session, { id: "relay" }).then(
        (value) => {
          outcome = value
        },
        (error) => {
          outcome = error
        },
      )
      let next: Promise<Response> | undefined
      try {
        await entered.promise
        await vi.advanceTimersByTimeAsync(30_000)
        await vi.waitFor(() =>
          expect(outcome).toMatchObject({
            dispatched: phase === "cleanup",
            confirmedNonApplication: phase !== "cleanup",
          }),
        )
        expect(fetchMock).toHaveBeenCalledTimes(phase === "cleanup" ? 1 : 0)
        if (phase !== "permission") {
          next = fetchWithHeaderOverrides("https://other.test/ordinary")
          await vi.waitFor(async () => {
            const locks = await navigator.locks.query()
            expect(
              locks.pending?.some((lock) =>
                lock.name?.endsWith("request-header-overrides"),
              ),
            ).toBe(true)
          })
          expect(fetchMock).toHaveBeenCalledTimes(phase === "cleanup" ? 1 : 0)
        }
      } finally {
        native.resolve()
        await Promise.all([pending, next])
      }
      await expect(listMagpieProviders(session)).resolves.toEqual([provider])
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(phase === "cleanup" ? 1 : 0)
      expect(rules.current()).toBeUndefined()
    },
  )

  it.each(["standalone", "new-session", "authenticated-session"])(
    "bounds header-lock waiting before dispatch for %s",
    async (mode) => {
      const rules = installOriginRules()
      const httpConfig = { ...config, baseUrl: "http://192.168.1.20:3430" }
      const sessionConfig =
        mode === "standalone"
          ? httpConfig
          : withMagpieRequestSession(httpConfig)
      fetchMock.mockImplementation(async () => json({ providers: [provider] }))
      if (mode === "authenticated-session")
        await listMagpieProviders(sessionConfig)

      const locked = createDeferred<void>()
      const response = createDeferred<Response>()
      fetchMock.mockImplementation(() => {
        locked.resolve()
        return response.promise
      })
      const blocker = fetchWithHeaderOverrides(
        "https://other.test/slow",
        {},
        { "User-Agent": "other-client" },
      )
      await locked.promise
      fetchMock.mockClear()
      vi.useFakeTimers()
      const controller = new AbortController()
      let outcome: unknown
      const pending = saveMagpieProvider(
        sessionConfig,
        { id: "relay" },
        { signal: controller.signal },
      ).then(
        (value) => {
          outcome = value
        },
        (error) => {
          outcome = error
        },
      )
      try {
        await vi.waitFor(async () => {
          const locks = await navigator.locks.query()
          expect(
            locks.pending?.some((lock) =>
              lock.name?.endsWith("request-header-overrides"),
            ),
          ).toBe(true)
        })
        await vi.advanceTimersByTimeAsync(30_000)
        await vi.waitFor(() =>
          expect(outcome).toMatchObject({
            dispatched: false,
            confirmedNonApplication: true,
          }),
        )
        expect(fetchMock).not.toHaveBeenCalled()
      } finally {
        controller.abort()
        response.resolve(json({}))
        await Promise.all([pending, blocker])
      }
      expect(rules.current()).toBeUndefined()
      fetchMock.mockImplementation(async () => json({ providers: [provider] }))
      await expect(listMagpieProviders(sessionConfig)).resolves.toEqual([
        provider,
      ])
    },
  )

  it.each(["chrome", "edge", "custom-chromium"])(
    "creates through the scoped shared Origin transport on a LAN HTTP deployment in %s",
    async (browser) => {
      const rules = installOriginRules()
      vi.stubEnv("BROWSER", browser)
      const requests: { method: string; origin: string | undefined }[] = []
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        const origin = rules
          .current()
          ?.action.requestHeaders?.find(
            (header) => header.header === "origin",
          )?.value
        requests.push({ method: init.method!, origin })
        if (init.method === "POST" && origin !== "http://192.168.1.20:3430") {
          return new Response("magpie's API answers magpie's own page only", {
            status: 403,
          })
        }
        return json({ providers: [provider] })
      })
      await expect(
        saveMagpieProvider(
          { ...config, baseUrl: "http://192.168.1.20:3430/magpie" },
          { new: true, name: "Relay" },
        ),
      ).resolves.toEqual([provider])
      expect(requests).toEqual([
        { method: "GET", origin: undefined },
        { method: "POST", origin: "http://192.168.1.20:3430" },
      ])
      expect(rules.current()).toBeUndefined()
    },
  )

  it.each([
    "/api/provider/save",
    "/api/provider/delete",
    "/api/provider/on",
    "/api/provider/off",
    "/api/provider/key",
    "/api/provider/list",
    "/api/keys/add",
    "/api/keys/rename",
    "/api/keys/protocol",
    "/api/keys/weight",
    "/api/keys/on",
    "/api/keys/off",
    "/api/keys/remove",
  ])(
    "applies the HTTP compatibility policy to POST %s, including reads",
    async (endpoint) => {
      const rules = installOriginRules()
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        if (init.method === "POST") {
          const rule = rules.current()
          expect(rule?.action.requestHeaders).toEqual([
            {
              header: "origin",
              operation: "set",
              value: "http://192.168.1.20:3430",
            },
          ])
          expect(new RegExp(rule!.condition.regexFilter!).test(url)).toBe(true)
          expect(rule?.condition.requestMethods).toEqual(["post"])
        } else expect(rules.current()).toBeUndefined()
        return json({ ok: true })
      })
      await expect(
        requestMagpie(
          { ...config, baseUrl: "http://192.168.1.20:3430/prefix" },
          endpoint,
          { id: "relay" },
        ),
      ).resolves.toEqual({ ok: true })
      expect(rules.current()).toBeUndefined()
    },
  )

  it.each([
    ["chrome", "https://192.168.1.20:3430", "/api/provider/save", {}],
    ["chrome", "https://magpie.test", "/api/provider/save", {}],
    ["chrome", "http://localhost:3430", "/api/provider/save", {}],
    ["chrome", "http://localhost.:3430", "/api/provider/save", {}],
    ["chrome", "http://test.localhost:3430", "/api/provider/save", {}],
    ["chrome", "http://127.0.0.1:3430", "/api/provider/save", {}],
    ["chrome", "http://127.1:3430", "/api/provider/save", {}],
    ["chrome", "http://127.0.0.2:3430", "/api/provider/save", {}],
    ["chrome", "http://[::1]:3430", "/api/provider/save", {}],
    ["chrome", "http://192.168.1.20:3430", "/api/providers", undefined],
    ["chrome", "http://192.168.1.20:3430", "/outside-api", {}],
    ["firefox", "http://192.168.1.20:3430", "/api/provider/save", {}],
    ["safari", "http://192.168.1.20:3430", "/api/provider/save", {}],
  ] as const)(
    "keeps the ordinary transport for %s %s %s",
    async (target, baseUrl, endpoint, body) => {
      const rules = installOriginRules()
      vi.stubEnv("BROWSER", target)
      if (target === "firefox")
        vi.mocked(browser.runtime.getURL).mockReturnValue(
          "moz-extension://extension-id/",
        )
      if (target === "safari")
        vi.mocked(browser.runtime.getURL).mockReturnValue(
          "safari-web-extension://extension-id/",
        )
      fetchMock.mockImplementation(async () => json({ ok: true }))
      await requestMagpie({ ...config, baseUrl }, endpoint, body)
      expect(
        rules.updateSessionRules.mock.calls.some(([input]) => input.addRules),
      ).toBe(false)
      expect(fetchMock.mock.calls[0]![1]).toMatchObject({
        method: "GET",
        credentials: "include",
        redirect: "follow",
      })
      expect(fetchMock.mock.calls[1]![1]).toMatchObject({
        credentials: "include",
        method: body === undefined ? "GET" : "POST",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (body === undefined)
        expect(fetchMock.mock.calls[1]![1].body).toBeUndefined()
    },
  )

  it("reports a failed Origin rule as not dispatched instead of an uncertain write", async () => {
    const rules = installOriginRules()
    rules.updateSessionRules.mockImplementation(async ({ addRules }) => {
      if (addRules) throw new Error("rule unavailable")
    })
    fetchMock.mockResolvedValue(json({ providers: [provider] }))
    await expect(
      saveMagpieProvider(
        { ...config, baseUrl: "http://192.168.1.20:3430" },
        { id: "relay" },
      ),
    ).rejects.toMatchObject({
      dispatched: false,
      confirmedNonApplication: true,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]![1].method).toBe("GET")
  })

  it.each([403, 500, "lost"] as const)(
    "does not replay an HTTP POST after %s",
    async (outcome) => {
      const rules = installOriginRules()
      fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        if (init.method === "GET") return json({})
        if (outcome === "lost") throw new TypeError("lost response")
        return json({}, outcome)
      })
      await expect(
        saveMagpieProvider(
          { ...config, baseUrl: "http://192.168.1.20:3430" },
          { id: "relay" },
        ),
      ).rejects.toMatchObject({
        dispatched: true,
        confirmedNonApplication: outcome === 403,
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(rules.current()).toBeUndefined()
    },
  )

  it("shares explicit authentication for direct provider operations without caching their write readback", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("?k=") ? json({}) : json({ providers: [provider] }),
    )
    const options = { operationContext: createApiOperationContext() }
    await listMagpieProviders(config, options)
    await saveMagpieProvider(config, { id: "relay" }, options)
    await listMagpieProviders(config, options)
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("?k=")),
    ).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("keeps authentication reusable independently of inventory refresh in an explicit operation", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("?k=") ? json({}) : json({ providers: [provider] }),
    )
    const operation = createManagedSiteOperationContext()
    const options = { operationContext: operation.api }
    await magpieManagedSiteCapabilities.matching.search(
      config,
      "https://relay.test",
      options,
    )
    await magpieManagedSiteCapabilities.matching.search(
      config,
      "https://relay.test/v1",
      options,
    )
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("?k=")),
    ).toHaveLength(1)
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/providers"),
      ),
    ).toHaveLength(1)
    operation.api.inventoryReads.clear()
    await magpieManagedSiteCapabilities.matching.search(
      config,
      "https://relay.test",
      options,
    )
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("?k=")),
    ).toHaveLength(1)
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/providers"),
      ),
    ).toHaveLength(2)
  })

  it("shares batch authentication between inventory matching and hidden-key reads", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("?k=")) return json({})
      return url.endsWith("/api/provider/key")
        ? json({ key: "sk-revealed" })
        : json({ providers: [provider] })
    })
    const options = { inventoryCache: new Map() }
    const result = await magpieManagedSiteCapabilities.matching.search(
      config,
      "https://relay.test/v1",
      options,
    )
    expect(
      await magpieManagedSiteCapabilities.matching.fetchSecretKey(
        config,
        result.items[0]!.ref,
        {
          ...options,
          protectionBypassExecution: {
            version: 2,
            kind: "automatic",
            feature: "managed_site_channels",
            trigger: "background_recovery",
            surface: "background",
          },
        },
      ),
    ).toBe("sk-revealed")
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("?k=")),
    ).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it.each([401, 403, 500])(
    "never replays a session write rejected with %s",
    async (status) => {
      const sessionConfig = withMagpieRequestSession(config)
      fetchMock
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(json({ providers: [provider] }))
        .mockResolvedValueOnce(json({}, status))
      await listMagpieProviders(sessionConfig)
      await expect(
        saveMagpieProvider(sessionConfig, { id: "relay" }),
      ).rejects.toMatchObject({
        status,
        dispatched: true,
        confirmedNonApplication: status !== 500,
      })
      expect(fetchMock).toHaveBeenCalledTimes(3)
      if (status === 401) {
        fetchMock
          .mockResolvedValueOnce(json({}))
          .mockResolvedValueOnce(json({ providers: [provider] }))
        await listMagpieProviders(sessionConfig)
        expect(fetchMock.mock.calls[3]![0]).toContain("?k=")
      }
    },
  )

  it("does not replay a session write when its response is lost", async () => {
    const sessionConfig = withMagpieRequestSession(config)
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ providers: [provider] }))
      .mockRejectedValueOnce(new TypeError("lost response"))
    await listMagpieProviders(sessionConfig)
    await expect(
      saveMagpieProvider(sessionConfig, { id: "relay" }),
    ).rejects.toMatchObject({
      dispatched: true,
      confirmedNonApplication: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("isolates authentication by operation, deployment path and web key", async () => {
    const owner = {}
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("?k=") ? json({}) : json({ providers: [provider] }),
    )
    await listMagpieProviders(withMagpieRequestSession(config, owner))
    await listMagpieProviders(withMagpieRequestSession({ ...config }, owner))
    await listMagpieProviders(
      withMagpieRequestSession(
        { ...config, baseUrl: `${config.baseUrl}/other` },
        owner,
      ),
    )
    await listMagpieProviders(
      withMagpieRequestSession({ ...config, webKey: "other-key" }, owner),
    )
    await listMagpieProviders(withMagpieRequestSession(config, {}))
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("?k=")),
    ).toHaveLength(4)
  })

  it("evicts a failed login so another explicit read can authenticate", async () => {
    const sessionConfig = withMagpieRequestSession(config)
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ providers: [provider] }))
    await expect(listMagpieProviders(sessionConfig)).rejects.toMatchObject({
      dispatched: false,
    })
    expect(await listMagpieProviders(sessionConfig)).toEqual([provider])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("stops after one recovery attempt if the session still rejects a GET", async () => {
    const sessionConfig = withMagpieRequestSession(config)
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({}, 401))
    await expect(listMagpieProviders(sessionConfig)).rejects.toMatchObject({
      status: 401,
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("keeps shared authentication alive when one reader cancels", async () => {
    vi.stubGlobal("navigator", {})
    const sessionConfig = withMagpieRequestSession(config)
    let finishLogin!: (response: Response) => void
    let loginSignal: AbortSignal | null | undefined
    fetchMock.mockImplementation((url: string, options: RequestInit) => {
      if (url.includes("?k=")) {
        loginSignal = options.signal
        return new Promise<Response>((resolve) => {
          finishLogin = resolve
        })
      }
      return Promise.resolve(json({ providers: [provider] }))
    })
    const controller = new AbortController()
    const cancelled = listMagpieProviders(sessionConfig, {
      signal: controller.signal,
    })
    const cancellation = expect(cancelled).rejects.toMatchObject({
      name: "AbortError",
    })
    const remaining = listMagpieProviders(sessionConfig)
    controller.abort()
    await cancellation
    expect(loginSignal?.aborted).toBe(false)
    finishLogin(json({}))
    expect(await remaining).toEqual([provider])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("shares pending authentication for concurrent batch reads", async () => {
    vi.stubGlobal("navigator", {})
    const sessionConfig = withMagpieRequestSession(config)
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("?k=") ? json({}) : json({ providers: [provider] }),
    )
    await Promise.all([
      listMagpieProviders(sessionConfig),
      listMagpieProviders(sessionConfig),
    ])
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("?k=")),
    ).toHaveLength(1)
  })

  it("recovers an expired session for a read with one fresh login", async () => {
    const sessionConfig = withMagpieRequestSession(config)
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ providers: [provider] }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ providers: [provider] }))
    await listMagpieProviders(sessionConfig)
    expect(await listMagpieProviders(sessionConfig)).toEqual([provider])
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it("authenticates once for reads and creates in one import session", async () => {
    const sessionConfig = withMagpieRequestSession(config)
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("?k=") ? json({}) : json({ providers: [provider] }),
    )
    expect(await listMagpieProviders(sessionConfig)).toEqual([provider])
    expect(await saveMagpieProvider(sessionConfig, { id: "relay" })).toEqual([
      provider,
    ])
    expect(await listMagpieProviders(sessionConfig)).toEqual([provider])
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("?k=")),
    ).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it.each([true, false])(
    "toggles only the requested provider (enabled=%s)",
    async (enabled) => {
      fetchMock
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(json({ providers: [provider] }))
      expect(await setMagpieProviderEnabled(config, "relay", enabled)).toEqual([
        provider,
      ])
      expect(fetchMock.mock.calls[1]).toEqual([
        `http://localhost:3430/magpie/api/provider/${enabled ? "on" : "off"}`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ id: "relay" }),
        }),
      ])
    },
  )

  it("addresses one pool key by its fingerprint", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ providers: [provider] }))
    const payload = { id: "relay", ref: "fingerprint", name: "Backup" }
    expect(await mutateMagpieProviderKey(config, "rename", payload)).toEqual([
      provider,
    ])
    expect(fetchMock.mock.calls[1]).toEqual([
      "http://localhost:3430/magpie/api/keys/rename",
      expect.objectContaining({ body: JSON.stringify(payload) }),
    ])
  })

  it("reveals the explicitly requested key and discovers unique model IDs without refresh writes", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ key: "sk-revealed" }))
    expect(await readMagpieProviderKey(config, "relay")).toBe("sk-revealed")
    expect(fetchMock.mock.calls[1]![0]).toBe(
      "http://localhost:3430/magpie/api/provider/key",
    )
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(
        json({ models: [{ id: "m1" }, { id: "m1" }, { id: "m2" }] }),
      )
    expect(
      await discoverMagpieModels(config, {
        chat: provider.chat,
        key: "sk-revealed",
      }),
    ).toEqual(["m1", "m2"])
    expect(fetchMock.mock.calls[3]![0]).toBe(
      "http://localhost:3430/magpie/api/provider/list",
    )
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it.each([null, {}, { key: 5 }])(
    "rejects an invalid key response (%j)",
    async (response) => {
      fetchMock
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(json(response))
      await expect(
        readMagpieProviderKey(config, "relay"),
      ).rejects.toMatchObject({
        dispatched: true,
        confirmedNonApplication: false,
      })
    },
  )

  it.each([
    null,
    {},
    { models: {} },
    { models: [null] },
    { models: [{ id: 2 }] },
  ])("rejects malformed discovery data (%j)", async (response) => {
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json(response))
    await expect(discoverMagpieModels(config, {})).rejects.toBeInstanceOf(
      MagpieApiError,
    )
  })

  it("rejects an empty management key before making a request", async () => {
    await expect(
      listMagpieProviders({ ...config, webKey: "  " }),
    ).rejects.toMatchObject({ status: 401, dispatched: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("keeps an invalid JSON write response uncertain without retrying", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(new Response("not-json"))
    await expect(
      saveMagpieProvider(config, { id: "relay" }),
    ).rejects.toMatchObject({
      status: 200,
      dispatched: true,
      confirmedNonApplication: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it.each([
    { chosen: "not-an-array" },
    { models: [{ name: "missing-id" }] },
    { gemini: 42 },
    { keyList: "invalid" },
    { keyList: [{ id: "key", masked: "***", on: true }] },
    { keyList: [{ id: "key", masked: "***", active: true, on: "true" }] },
    {
      keyList: Array(2).fill({
        id: "duplicate",
        masked: "***",
        active: true,
        on: true,
      }),
    },
  ])(
    "rejects malformed native metadata before a consumer can treat it as writable (%j)",
    async (invalid) => {
      fetchMock
        .mockResolvedValueOnce(json({}))
        .mockResolvedValueOnce(
          json({ providers: [{ ...provider, ...invalid }] }),
        )
      await expect(listMagpieProviders(config)).rejects.toBeInstanceOf(
        MagpieApiError,
      )
    },
  )

  it("establishes its configured web-key session before reading the native inventory", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ providers: [provider] }))
    expect(await listMagpieProviders(config)).toEqual([provider])
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "http://localhost:3430/magpie/?k=management-key",
    )
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      credentials: "include",
      method: "GET",
    })
    expect(fetchMock.mock.calls[1]![0]).toBe(
      "http://localhost:3430/magpie/api/providers",
    )
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({
      credentials: "include",
      redirect: "error",
    })
  })

  it("rejects a wrong web key before a write even if the browser has an older session", async () => {
    fetchMock.mockResolvedValueOnce(new Response("wrong key", { status: 401 }))
    await expect(deleteMagpieProvider(config, "relay")).rejects.toMatchObject({
      status: 401,
      dispatched: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("does not silently treat an unrelated JSON response as an empty gateway", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ data: [] }))
    await expect(listMagpieProviders(config)).rejects.toBeInstanceOf(
      MagpieApiError,
    )
  })

  it("marks a lost save response uncertain and never replays the mutation", async () => {
    fetchMock
      .mockResolvedValueOnce(json({}))
      .mockRejectedValueOnce(new TypeError("network"))
    await expect(
      saveMagpieProvider(config, {
        name: "Relay",
        new: true,
        chat: "https://relay.test/v1",
        key: "sk-test",
      }),
    ).rejects.toMatchObject({
      dispatched: true,
      confirmedNonApplication: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("aborts before authentication without sending any request", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      listMagpieProviders(config, { signal: controller.signal }),
    ).rejects.toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
