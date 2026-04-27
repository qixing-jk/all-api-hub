import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it } from "vitest"

import {
  ClaudeCodeHubApiError,
  createProvider,
  deleteProvider,
  listProviders,
  normalizeClaudeCodeHubBaseUrl,
  redactClaudeCodeHubSecrets,
  updateProvider,
} from "~/services/apiService/claudeCodeHub"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://cch.example.com/",
  adminToken: "admin-secret",
}

const PROVIDER_ACTION_BASE = "https://cch.example.com/api/actions/providers"

describe("Claude Code Hub action API adapter", () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it("normalizes base URLs and lists providers from action responses", async () => {
    let capturedBody: unknown
    let capturedAuthorization: string | null = null
    let capturedSignal: AbortSignal | null = null

    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, async ({ request }) => {
        capturedBody = await request.json()
        capturedAuthorization = request.headers.get("authorization")
        capturedSignal = request.signal

        return HttpResponse.json({
          ok: true,
          data: [{ id: 1, name: "OpenAI", url: "https://api.example.com" }],
        })
      }),
    )

    await expect(listProviders(config)).resolves.toEqual([
      { id: 1, name: "OpenAI", url: "https://api.example.com" },
    ])
    expect(normalizeClaudeCodeHubBaseUrl(config.baseUrl)).toBe(
      "https://cch.example.com",
    )
    expect(capturedBody).toEqual({})
    expect(capturedAuthorization).toBe("Bearer admin-secret")
    expect(capturedSignal).toBeInstanceOf(AbortSignal)
  })

  it("posts create, update, and delete provider payloads using action route field names", async () => {
    const capturedBodies: unknown[] = []

    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/addProvider`, async ({ request }) => {
        capturedBodies.push(await request.json())
        return HttpResponse.json({ ok: true, data: { ok: true } })
      }),
      http.post(`${PROVIDER_ACTION_BASE}/editProvider`, async ({ request }) => {
        capturedBodies.push(await request.json())
        return HttpResponse.json({ ok: true, data: { ok: true } })
      }),
      http.post(
        `${PROVIDER_ACTION_BASE}/removeProvider`,
        async ({ request }) => {
          capturedBodies.push(await request.json())
          return HttpResponse.json({ ok: true, data: { ok: true } })
        },
      ),
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

    expect(capturedBodies).toEqual([
      {
        name: "Provider",
        url: "https://api.example.com",
        key: "sk-real-key",
        provider_type: "openai-compatible",
        allowed_models: [{ matchType: "exact", pattern: "gpt-4o" }],
      },
      {
        providerId: 12,
        key: "sk-new-key",
        group_tag: "default",
      },
      {
        providerId: 12,
      },
    ])
  })

  it("supports provider arrays wrapped in an inner data field", async () => {
    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, () =>
        HttpResponse.json({
          ok: true,
          data: {
            data: [{ id: 2, name: "Codex", url: "https://codex.example.com" }],
          },
        }),
      ),
    )

    await expect(listProviders(config)).resolves.toEqual([
      { id: 2, name: "Codex", url: "https://codex.example.com" },
    ])
  })

  it("throws redacted errors for action failures and malformed responses", async () => {
    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/addProvider`, () =>
        HttpResponse.json(
          {
            ok: false,
            error: "bad token admin-secret and key sk-real-key",
          },
          { status: 403 },
        ),
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

    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/addProvider`, () =>
        HttpResponse.json(
          {
            ok: false,
            error: { detail: "bad token admin-secret and key sk-real-key" },
          },
          { status: 403 },
        ),
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
    ).rejects.toThrow('{"detail":"bad token [REDACTED] and key [REDACTED]"}')

    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, () =>
        HttpResponse.json({ success: true }),
      ),
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
    let capturedSignal: AbortSignal | null = null

    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, ({ request }) => {
        capturedSignal = request.signal
        return HttpResponse.json({ ok: true, data: [] })
      }),
    )

    await listProviders(config, { signal: controller.signal })

    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal).not.toBe(controller.signal)
    if (!capturedSignal) {
      throw new Error("Expected request signal to be captured")
    }
    const requestSignal: AbortSignal = capturedSignal
    controller.abort()
    expect(requestSignal.aborted).toBe(true)
  })

  it("wraps network failures in a ClaudeCodeHubApiError", async () => {
    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, () =>
        HttpResponse.error(),
      ),
    )

    await expect(listProviders(config)).rejects.toBeInstanceOf(
      ClaudeCodeHubApiError,
    )
  })
})
