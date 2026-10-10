import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  deleteMagpieProvider,
  discoverMagpieModels,
  listMagpieProviders,
  mutateMagpieProviderKey,
  readMagpieProviderKey,
  saveMagpieProvider,
  setMagpieProviderEnabled,
} from "~/services/apiService/magpie/providers"
import { MagpieApiError } from "~/services/apiService/magpie/request"

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

describe("Magpie management transport", () => {
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
