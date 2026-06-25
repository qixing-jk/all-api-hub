import { beforeEach, describe, expect, it, vi } from "vitest"

const { logger } = vi.hoisted(() => ({
  logger: {
    warn: vi.fn(),
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => logger),
}))

describe("tempFetchUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("normalizes header objects without mutating the original fetch options", async () => {
    const { normalizeFetchOptions } = await import(
      "~/entrypoints/content/messageHandlers/utils/tempFetchUtils"
    )

    const originalHeaders = {
      authorization: "Bearer token",
      "x-nullish": null as unknown as string,
    }
    const originalOptions: RequestInit = {
      method: "POST",
      headers: originalHeaders,
    }

    const normalized = normalizeFetchOptions(originalOptions)

    expect(normalized).not.toBe(originalOptions)
    expect(normalized.headers).toEqual({
      authorization: "Bearer token",
    })
    expect(originalOptions.headers).toBe(originalHeaders)
    expect(originalHeaders).toEqual({
      authorization: "Bearer token",
      "x-nullish": null,
    })
  })

  it("converts Headers instances and tuple arrays into plain header objects", async () => {
    const { normalizeFetchOptions } = await import(
      "~/entrypoints/content/messageHandlers/utils/tempFetchUtils"
    )

    const fromHeaders = normalizeFetchOptions({
      headers: new Headers({
        authorization: "Bearer token",
        "x-request-id": "req-1",
      }),
    })
    const fromTuples = normalizeFetchOptions({
      headers: [
        ["content-type", "application/json"],
        ["x-request-id", "req-2"],
      ],
    })

    expect(fromHeaders.headers).toEqual({
      authorization: "Bearer token",
      "x-request-id": "req-1",
    })
    expect(fromTuples.headers).toEqual({
      "content-type": "application/json",
      "x-request-id": "req-2",
    })
  })

  it("stringifies non-nullish object header values and keeps headerless options untouched", async () => {
    const { normalizeFetchOptions } = await import(
      "~/entrypoints/content/messageHandlers/utils/tempFetchUtils"
    )

    const headerlessOptions: RequestInit = {
      method: "GET",
      credentials: "include",
    }
    const headerlessNormalized = normalizeFetchOptions(headerlessOptions)
    const withMixedObjectHeaders = normalizeFetchOptions({
      headers: {
        "x-number": 42 as unknown as string,
        "x-bool": false as unknown as string,
        "x-empty": "",
        "x-undefined": undefined as unknown as string,
      },
    })

    expect(headerlessNormalized).toEqual(headerlessOptions)
    expect(headerlessNormalized).not.toBe(headerlessOptions)
    expect(withMixedObjectHeaders.headers).toEqual({
      "x-number": "42",
      "x-bool": "false",
      "x-empty": "",
    })
  })

  it("drops message-cloned fetch signals before content-side fetch", async () => {
    const { normalizeFetchOptions } = await import(
      "~/entrypoints/content/messageHandlers/utils/tempFetchUtils"
    )

    const normalized = normalizeFetchOptions({
      method: "GET",
      signal: { aborted: false } as unknown as AbortSignal,
    })

    expect(normalized).toEqual({ method: "GET" })
    expect(normalized).not.toHaveProperty("signal")
  })

  it("preserves native fetch signals during normalization", async () => {
    const { normalizeFetchOptions } = await import(
      "~/entrypoints/content/messageHandlers/utils/tempFetchUtils"
    )

    const abortController = new AbortController()
    const normalized = normalizeFetchOptions({
      method: "GET",
      signal: abortController.signal,
    })

    expect(normalized.signal).toBe(abortController.signal)
  })

  it("parses arrayBuffer and blob responses into serializable payloads", async () => {
    const { parseResponseData } = await import(
      "~/entrypoints/content/messageHandlers/utils/tempFetchUtils"
    )

    const binaryResponse = new Response(Uint8Array.from([1, 2, 3]).buffer)
    const blobResponse = new Response(
      new Blob(["hello"], { type: "text/plain" }),
    )

    const arrayBufferData = await parseResponseData(
      binaryResponse,
      "arrayBuffer",
    )
    const blobData = await parseResponseData(blobResponse, "blob")

    expect(arrayBufferData).toEqual([1, 2, 3])
    expect(blobData).toEqual({
      data: Array.from(new TextEncoder().encode("hello")),
      type: "text/plain",
    })
  })

  it("falls back to text and logs a warning when json parsing fails", async () => {
    const { parseResponseData } = await import(
      "~/entrypoints/content/messageHandlers/utils/tempFetchUtils"
    )

    const response = new Response("not-json", {
      headers: { "content-type": "application/json" },
    })

    const data = await parseResponseData(response, "json")

    expect(data).toBe("not-json")
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to parse JSON response, fallback to text",
      expect.any(SyntaxError),
    )
  })

  it("returns plain text responses without logging warnings", async () => {
    const { parseResponseData } = await import(
      "~/entrypoints/content/messageHandlers/utils/tempFetchUtils"
    )

    const response = new Response("plain-text-body")

    await expect(parseResponseData(response, "text")).resolves.toBe(
      "plain-text-body",
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("parses valid json through the default branch without warnings", async () => {
    const { parseResponseData } = await import(
      "~/entrypoints/content/messageHandlers/utils/tempFetchUtils"
    )

    const response = new Response(JSON.stringify({ ok: true, count: 2 }), {
      headers: { "content-type": "application/json" },
    })

    await expect(
      parseResponseData(response, undefined as any),
    ).resolves.toEqual({
      ok: true,
      count: 2,
    })
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
