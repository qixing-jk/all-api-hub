import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  deleteMagpieProvider,
  listMagpieProviders,
  saveMagpieProvider,
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
