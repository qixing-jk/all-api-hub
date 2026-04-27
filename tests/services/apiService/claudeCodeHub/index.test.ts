import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ClaudeCodeHubApiError,
  createProvider,
  deleteProvider,
  listProviders,
  normalizeClaudeCodeHubBaseUrl,
  redactClaudeCodeHubSecrets,
  updateProvider,
} from "~/services/apiService/claudeCodeHub"

const config = {
  baseUrl: "https://cch.example.com/",
  adminToken: "admin-secret",
}

const mockFetch = vi.fn()

describe("Claude Code Hub action API adapter", () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal("fetch", mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("normalizes base URLs and lists providers from action responses", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: [{ id: 1, name: "OpenAI", url: "https://api.example.com" }],
        }),
        { status: 200 },
      ),
    )

    await expect(listProviders(config)).resolves.toEqual([
      { id: 1, name: "OpenAI", url: "https://api.example.com" },
    ])
    expect(normalizeClaudeCodeHubBaseUrl(config.baseUrl)).toBe(
      "https://cch.example.com",
    )
    expect(mockFetch).toHaveBeenCalledWith(
      "https://cch.example.com/api/actions/providers/getProviders",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          Authorization: "Bearer admin-secret",
        }),
        body: "{}",
      }),
    )
  })

  it("posts create, update, and delete provider payloads using action route field names", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { ok: true } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { ok: true } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { ok: true } }), {
          status: 200,
        }),
      )

    await createProvider(config, {
      name: "Provider",
      url: "https://api.example.com",
      key: "sk-real-key",
      provider_type: "openai-compatible",
      allowed_models: [{ matchType: "exact", pattern: "gpt-4o" }],
    })
    await updateProvider(config, {
      providerId: 12,
      key: "sk-new-key",
      group_tag: "default",
    })
    await deleteProvider(config, 12)

    const editCall = mockFetch.mock.calls[1]
    expect(editCall[0]).toBe(
      "https://cch.example.com/api/actions/providers/editProvider",
    )
    expect(JSON.parse(editCall[1].body)).toEqual({
      providerId: 12,
      key: "sk-new-key",
      group_tag: "default",
    })

    const deleteCall = mockFetch.mock.calls[2]
    expect(deleteCall[0]).toBe(
      "https://cch.example.com/api/actions/providers/removeProvider",
    )
    expect(JSON.parse(deleteCall[1].body)).toEqual({ providerId: 12 })
  })

  it("supports provider arrays wrapped in an inner data field", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            data: [{ id: 2, name: "Codex", url: "https://codex.example.com" }],
          },
        }),
        { status: 200 },
      ),
    )

    await expect(listProviders(config)).resolves.toEqual([
      { id: 2, name: "Codex", url: "https://codex.example.com" },
    ])
  })

  it("throws redacted errors for action failures and malformed responses", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: false,
          error: "bad token admin-secret and key sk-real-key",
        }),
        { status: 403 },
      ),
    )

    await expect(
      createProvider(config, {
        name: "Provider",
        url: "https://api.example.com",
        key: "sk-real-key",
        provider_type: "openai-compatible",
        allowed_models: [],
      }),
    ).rejects.toThrow("bad token [REDACTED] and key [REDACTED]")

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )

    await expect(listProviders(config)).rejects.toThrow(
      "invalid action response",
    )
  })

  it("redacts bearer tokens in arbitrary messages", () => {
    expect(
      redactClaudeCodeHubSecrets("Authorization Bearer admin-secret", [
        "admin-secret",
      ]),
    ).toBe("Authorization Bearer [REDACTED]")
    expect(redactClaudeCodeHubSecrets("adapter failure", ["ad"])).toBe(
      "adapter failure",
    )
  })

  it("combines a caller-provided signal with the timeout safety floor", async () => {
    const controller = new AbortController()
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: [] }), {
        status: 200,
      }),
    )

    await listProviders(config, { signal: controller.signal })

    const [, requestInit] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(requestInit.signal).toBeInstanceOf(AbortSignal)
    expect(requestInit.signal).not.toBe(controller.signal)
    controller.abort()
    expect(requestInit.signal?.aborted).toBe(true)
  })

  it("wraps fetch failures in a ClaudeCodeHubApiError with sanitized text", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Bearer admin-secret exploded"))

    const requestPromise = listProviders(config)

    await expect(requestPromise).rejects.toEqual(
      expect.objectContaining({
        name: "ClaudeCodeHubApiError",
        message: "Bearer [REDACTED] exploded",
      }),
    )
    await expect(requestPromise).rejects.toBeInstanceOf(ClaudeCodeHubApiError)
  })
})
