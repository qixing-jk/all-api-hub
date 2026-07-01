import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createChannel,
  deleteChannel,
  fetchAccountAvailableModels,
  fetchAvailableModels,
  fetchGroups,
  fetchRemoteModels,
  fetchSiteUserGroups,
  listChannels,
  searchChannels,
  updateChannel,
} from "~/services/apiService/octopus"
import { OctopusAutoGroupType, OctopusOutboundType } from "~/types/octopus"

const { mockGetValidToken, mockGetPreferences } = vi.hoisted(() => ({
  mockGetValidToken: vi.fn(),
  mockGetPreferences: vi.fn(),
}))

vi.mock("~/services/apiService/octopus/auth", () => ({
  octopusAuthManager: {
    getValidToken: mockGetValidToken,
  },
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferences: mockGetPreferences,
  },
}))

describe("Octopus API service", () => {
  const config = {
    baseUrl: "https://octopus.example.com/",
    username: "alice",
    password: "secret",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    mockGetValidToken.mockResolvedValue("jwt-token")
  })

  it("lists channels with JWT auth headers", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: 1,
              name: "Main",
              base_urls: [{ url: "https://api.example.com/v1" }],
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)

    const result = await listChannels(config)

    expect(result).toEqual([
      {
        id: 1,
        name: "Main",
        base_urls: [{ url: "https://api.example.com/v1" }],
      },
    ])
    const [, request] = fetchMock.mock.calls[0]
    const headers = request.headers as Headers
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://octopus.example.com/api/v1/channel/list",
    )
    expect(headers.get("Authorization")).toBe("Bearer jwt-token")
    expect(headers.get("Content-Type")).toBe("application/json")
  })

  it("filters searched channels by name and upstream URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: [
                {
                  id: 1,
                  name: "OpenAI Main",
                  base_urls: [{ url: "https://api.openai.com/v1" }],
                },
                {
                  id: 2,
                  name: "Claude",
                  base_urls: [{ url: "https://claude.example.com/v1" }],
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        ),
      ),
    )

    await expect(searchChannels(config, "openai")).resolves.toHaveLength(1)
    await expect(searchChannels(config, "claude.example.com")).resolves.toEqual(
      [
        {
          id: 2,
          name: "Claude",
          base_urls: [{ url: "https://claude.example.com/v1" }],
        },
      ],
    )
  })

  it("returns all channels when the search keyword is blank", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                id: 1,
                name: "OpenAI Main",
                base_urls: [{ url: "https://api.openai.com/v1" }],
              },
              {
                id: 2,
                name: "Claude",
                base_urls: [{ url: "https://claude.example.com/v1" }],
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    )

    await expect(searchChannels(config, "")).resolves.toEqual([
      {
        id: 1,
        name: "OpenAI Main",
        base_urls: [{ url: "https://api.openai.com/v1" }],
      },
      {
        id: 2,
        name: "Claude",
        base_urls: [{ url: "https://claude.example.com/v1" }],
      },
    ])
  })

  it("creates, updates, and deletes channels with the expected request payloads", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: 1, name: "Created" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: 1, name: "Updated" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    const createPayload = {
      name: "Created",
      type: OctopusOutboundType.OpenAIChat,
      base_urls: [{ url: "https://api.example.com/v1" }],
      keys: [{ enabled: true, channel_key: "sk-created" }],
      auto_group: OctopusAutoGroupType.None,
    }

    await createChannel(config, createPayload)
    await updateChannel(config, { id: 1, name: "Updated" })
    await deleteChannel(config, 1)

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://octopus.example.com/api/v1/channel/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(createPayload),
      }),
    ])
    expect(fetchMock.mock.calls[1]).toMatchObject([
      "https://octopus.example.com/api/v1/channel/update",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: 1, name: "Updated" }),
      }),
    ])
    expect(fetchMock.mock.calls[2]).toMatchObject([
      "https://octopus.example.com/api/v1/channel/delete/1",
      expect.objectContaining({
        method: "DELETE",
      }),
    ])
  })

  it("surfaces JSON API errors from fetchRemoteModels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: 500,
            message: "upstream rejected channel",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    )

    await expect(
      fetchRemoteModels(config, {
        type: OctopusOutboundType.OpenAIChat,
        base_urls: [{ url: "https://api.example.com/v1" }],
        keys: [{ enabled: true, channel_key: "sk-remote" }],
      }),
    ).rejects.toThrow("upstream rejected channel")
  })

  it("aborts hung Octopus API requests with a bounded timeout", async () => {
    vi.useFakeTimers()
    const originalAny = Object.getOwnPropertyDescriptor(AbortSignal, "any")
    const originalTimeout = Object.getOwnPropertyDescriptor(
      AbortSignal,
      "timeout",
    )
    let requestSignal: AbortSignal | undefined

    Object.defineProperty(AbortSignal, "any", {
      value: undefined,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(AbortSignal, "timeout", {
      value: undefined,
      configurable: true,
      writable: true,
    })

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          if (!init?.signal) {
            reject(new Error("missing abort signal"))
            return
          }

          init.signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"))
          })
        })
      }),
    )

    try {
      const request = listChannels(config, { timeoutMs: 25 })
      const expectation = expect(request).rejects.toThrow(
        "Octopus API request timed out",
      )

      await vi.advanceTimersByTimeAsync(25)

      expect(requestSignal?.aborted).toBe(true)
      await expectation
    } finally {
      vi.useRealTimers()
      if (originalAny) {
        Object.defineProperty(AbortSignal, "any", originalAny)
      } else {
        Reflect.deleteProperty(AbortSignal, "any")
      }
      if (originalTimeout) {
        Object.defineProperty(AbortSignal, "timeout", originalTimeout)
      } else {
        Reflect.deleteProperty(AbortSignal, "timeout")
      }
    }
  })

  it("uses one bounded signal for Octopus auth and the API request", async () => {
    const callerSignal = new AbortController().signal
    let fetchSignal: AbortSignal | undefined
    mockGetValidToken.mockResolvedValueOnce("jwt-token")

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        fetchSignal = init?.signal ?? undefined
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, data: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }),
    )

    await expect(
      listChannels(config, { signal: callerSignal, timeoutMs: 25 }),
    ).resolves.toEqual([])

    expect(mockGetValidToken).toHaveBeenCalledWith(config, {
      signal: expect.any(AbortSignal),
    })
    const authSignal = mockGetValidToken.mock.calls[0][1]?.signal
    expect(authSignal).toBe(fetchSignal)
    expect(authSignal).not.toBe(callerSignal)
  })

  it("surfaces raw JSON bodies when an error response cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("{not-json", {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    await expect(listChannels(config)).rejects.toThrow(
      "HTTP 500 Internal Server Error: {not-json",
    )
  })

  it("maps available model and group payloads into flat name arrays", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ name: "gpt-4o" }, { name: "claude-3-5-sonnet" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              { id: 1, name: "default", items: [] },
              { id: 2, name: "vip", items: [] },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchAvailableModels(config)).resolves.toEqual([
      "gpt-4o",
      "claude-3-5-sonnet",
    ])
    await expect(fetchGroups(config)).resolves.toEqual(["default", "vip"])
  })

  it("treats missing model and group data as empty lists", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchAvailableModels(config)).resolves.toEqual([])
    await expect(fetchGroups(config)).resolves.toEqual([])
  })

  it("rejects non-JSON and malformed JSON Octopus responses", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response("<html>maintenance</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("{invalid", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchAvailableModels(config)).rejects.toThrow(
      "Expected JSON response but got text/html: <html>maintenance</html>",
    )
    await expect(fetchGroups(config)).rejects.toThrow(
      "Failed to parse JSON response from /api/v1/group/list",
    )
  })

  it("returns empty arrays when persisted Octopus preferences are incomplete", async () => {
    mockGetPreferences.mockResolvedValueOnce({
      octopus: {
        baseUrl: "",
        username: "alice",
        password: "secret",
      },
    })
    mockGetPreferences.mockResolvedValueOnce({
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "",
        password: "secret",
      },
    })

    await expect(fetchSiteUserGroups({} as any)).resolves.toEqual([])
    await expect(fetchAccountAvailableModels({} as any)).resolves.toEqual([])
    expect(mockGetValidToken).not.toHaveBeenCalled()
  })

  it("returns empty arrays when stored Octopus preferences cannot be loaded", async () => {
    mockGetPreferences
      .mockRejectedValueOnce(new Error("storage failed"))
      .mockRejectedValueOnce(new Error("storage failed"))

    await expect(fetchSiteUserGroups({} as any)).resolves.toEqual([])
    await expect(fetchAccountAvailableModels({} as any)).resolves.toEqual([])
  })

  it("uses stored Octopus preferences for group/model discovery and swallows downstream failures", async () => {
    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 1, name: "default", items: [] }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response("upstream unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      )
    vi.stubGlobal("fetch", fetchMock)
    mockGetPreferences
      .mockResolvedValueOnce({
        octopus: {
          baseUrl: "https://octopus.example.com",
          username: "alice",
          password: "secret",
        },
      })
      .mockResolvedValueOnce({
        octopus: {
          baseUrl: "https://octopus.example.com",
          username: "alice",
          password: "secret",
        },
      })

    await expect(fetchSiteUserGroups({} as any)).resolves.toEqual(["default"])
    await expect(fetchAccountAvailableModels({} as any)).resolves.toEqual([])
  })
})
