import { beforeEach, describe, expect, it, vi } from "vitest"

import {
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

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://cch.example.com/api/actions/providers/editProvider",
      expect.objectContaining({
        body: JSON.stringify({
          providerId: 12,
          key: "sk-new-key",
          group_tag: "default",
        }),
      }),
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "https://cch.example.com/api/actions/providers/removeProvider",
      expect.objectContaining({
        body: JSON.stringify({ providerId: 12 }),
      }),
    )
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
  })
})
