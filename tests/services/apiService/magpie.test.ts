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
  withMagpieRequestSession,
} from "~/services/apiService/magpie/request"
import { createApiOperationContext } from "~/services/apiTransport/operationContext"
import { createManagedSiteOperationContext } from "~/services/managedSites/operationContext"

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
afterEach(() => vi.unstubAllGlobals())

describe("Magpie management transport", () => {
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
