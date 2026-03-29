import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  EXTENSION_HEADER_NAME,
  EXTENSION_HEADER_VALUE,
} from "~/utils/browser/cookieHelper"

const { logger, mockLogCloudflareGuard } = vi.hoisted(() => ({
  logger: {
    warn: vi.fn(),
  },
  mockLogCloudflareGuard: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => logger),
}))

vi.mock("~/entrypoints/content/messageHandlers/utils/cloudflareGuard", () => ({
  logCloudflareGuard: mockLogCloudflareGuard,
}))

describe("handlePerformTempWindowFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it("adds the extension header, defaults credentials to include, and relays json responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-test-header": "value",
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock as typeof fetch)

    const { handlePerformTempWindowFetch } = await import(
      "~/entrypoints/content/messageHandlers/handlers/tempWindowFetch"
    )

    const sendResponse = vi.fn()
    const shouldKeepChannelOpen = handlePerformTempWindowFetch(
      {
        fetchUrl: "https://example.com/api/data",
        fetchOptions: {
          method: "POST",
          headers: {
            authorization: "Bearer token",
          },
        },
        responseType: "json",
        requestId: "req-1",
      },
      sendResponse,
    )

    expect(shouldKeepChannelOpen).toBe(true)

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-test-header": "value",
        },
        data: { ok: true },
        error: undefined,
      })
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/data",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          authorization: "Bearer token",
          [EXTENSION_HEADER_NAME.toLowerCase()]: EXTENSION_HEADER_VALUE,
        }),
      }),
    )
    expect(mockLogCloudflareGuard).toHaveBeenNthCalledWith(
      1,
      "tempFetchStart",
      expect.objectContaining({
        requestId: "req-1",
        responseType: "json",
      }),
    )
    expect(mockLogCloudflareGuard).toHaveBeenLastCalledWith(
      "tempFetchDone",
      expect.objectContaining({
        requestId: "req-1",
        ok: true,
        status: 200,
      }),
    )
  })

  it("preserves caller-provided credentials and surfaces text errors for non-ok responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("forbidden", {
        status: 403,
        headers: { "content-type": "text/plain" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock as typeof fetch)

    const { handlePerformTempWindowFetch } = await import(
      "~/entrypoints/content/messageHandlers/handlers/tempWindowFetch"
    )

    const sendResponse = vi.fn()
    handlePerformTempWindowFetch(
      {
        fetchUrl: "https://example.com/protected",
        fetchOptions: {
          credentials: "omit",
          headers: [["x-request-id", "req-2"]],
        },
        responseType: "text",
      },
      sendResponse,
    )

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        status: 403,
        headers: {
          "content-type": "text/plain",
        },
        data: "forbidden",
        error: "forbidden",
      })
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/protected",
      expect.objectContaining({
        credentials: "omit",
        headers: expect.objectContaining({
          "x-request-id": "req-2",
          [EXTENSION_HEADER_NAME.toLowerCase()]: EXTENSION_HEADER_VALUE,
        }),
      }),
    )
  })

  it("keeps the response structured when parsing the body fails", async () => {
    const response = {
      ok: false,
      status: 502,
      headers: new Headers({ "x-edge": "cache" }),
      blob: vi.fn().mockResolvedValue({
        type: "application/octet-stream",
        arrayBuffer: vi.fn().mockRejectedValue(new Error("blob-read-failed")),
      }),
    }
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal("fetch", fetchMock as typeof fetch)

    const { handlePerformTempWindowFetch } = await import(
      "~/entrypoints/content/messageHandlers/handlers/tempWindowFetch"
    )

    const sendResponse = vi.fn()
    handlePerformTempWindowFetch(
      {
        fetchUrl: "https://example.com/binary",
        responseType: "blob",
      },
      sendResponse,
    )

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        status: 502,
        headers: {
          "x-edge": "cache",
        },
        data: null,
        error: "{}",
      })
    })

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to parse response",
      expect.any(Error),
    )
  })

  it("returns a structured failure when the request is invalid before fetch starts", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock as typeof fetch)

    const { handlePerformTempWindowFetch } = await import(
      "~/entrypoints/content/messageHandlers/handlers/tempWindowFetch"
    )

    const sendResponse = vi.fn()
    handlePerformTempWindowFetch({}, sendResponse)

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: "Invalid fetch request",
      })
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockLogCloudflareGuard).not.toHaveBeenCalled()
  })

  it("logs request-scoped failures when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"))
    vi.stubGlobal("fetch", fetchMock as typeof fetch)

    const { handlePerformTempWindowFetch } = await import(
      "~/entrypoints/content/messageHandlers/handlers/tempWindowFetch"
    )

    const sendResponse = vi.fn()
    handlePerformTempWindowFetch(
      {
        fetchUrl: "https://example.com/api/data",
        requestId: "req-err",
      },
      sendResponse,
    )

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: "network down",
      })
    })

    expect(mockLogCloudflareGuard).toHaveBeenNthCalledWith(
      1,
      "tempFetchStart",
      expect.objectContaining({
        requestId: "req-err",
      }),
    )
    expect(mockLogCloudflareGuard).toHaveBeenLastCalledWith(
      "tempFetchError",
      expect.objectContaining({
        requestId: "req-err",
        error: "network down",
      }),
    )
  })
})
