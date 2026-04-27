import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ClaudeCodeHubApiError,
  createProvider,
  deleteProvider,
  listProviders,
  normalizeClaudeCodeHubBaseUrl,
  redactClaudeCodeHubSecrets,
  updateProvider,
  validateClaudeCodeHubConfig,
} from "~/services/apiService/claudeCodeHub"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://cch.example.com/",
  adminToken: "admin-secret",
}

const PROVIDER_ACTION_BASE = "https://cch.example.com/api/actions/providers"

function restoreAbortSignalStatic(
  key: "any" | "timeout",
  descriptor?: PropertyDescriptor,
) {
  if (descriptor) {
    Object.defineProperty(AbortSignal, key, descriptor)
    return
  }

  Reflect.deleteProperty(AbortSignal, key)
}

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

  it("returns an empty provider list when the payload shape has no provider array", async () => {
    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, () =>
        HttpResponse.json({
          ok: true,
          data: { value: "unexpected" },
        }),
      ),
    )

    await expect(listProviders(config)).resolves.toEqual([])
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

  it("falls back when AbortSignal timeout composition helpers are unavailable", async () => {
    const originalAny = Object.getOwnPropertyDescriptor(AbortSignal, "any")
    const originalTimeout = Object.getOwnPropertyDescriptor(
      AbortSignal,
      "timeout",
    )
    const controller = new AbortController()
    let capturedSignal: AbortSignal | null = null

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

    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, ({ request }) => {
        capturedSignal = request.signal
        return HttpResponse.json({ ok: true, data: [] })
      }),
    )

    try {
      await expect(
        listProviders(config, {
          signal: controller.signal,
        }),
      ).resolves.toEqual([])
    } finally {
      restoreAbortSignalStatic("any", originalAny)
      restoreAbortSignalStatic("timeout", originalTimeout)
    }

    expect(capturedSignal).toBeInstanceOf(AbortSignal)
    expect(capturedSignal).not.toBe(controller.signal)
    if (!capturedSignal) {
      throw new Error("Expected request signal to be captured")
    }

    const requestSignal: AbortSignal = capturedSignal
    controller.abort()
    expect(requestSignal.aborted).toBe(true)
  })

  it("cleans up fallback abort listeners after a successful request", async () => {
    const originalAny = Object.getOwnPropertyDescriptor(AbortSignal, "any")
    const originalTimeout = Object.getOwnPropertyDescriptor(
      AbortSignal,
      "timeout",
    )
    const controller = new AbortController()
    const removeEventListenerSpy = vi.spyOn(
      controller.signal,
      "removeEventListener",
    )

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

    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    )

    try {
      await expect(
        listProviders(config, {
          signal: controller.signal,
        }),
      ).resolves.toEqual([])
    } finally {
      restoreAbortSignalStatic("any", originalAny)
      restoreAbortSignalStatic("timeout", originalTimeout)
    }

    expect(removeEventListenerSpy).toHaveBeenCalled()
  })

  it("rejects already-aborted caller signals even without AbortSignal.any", async () => {
    const originalAny = Object.getOwnPropertyDescriptor(AbortSignal, "any")
    const originalTimeout = Object.getOwnPropertyDescriptor(
      AbortSignal,
      "timeout",
    )
    const controller = new AbortController()
    controller.abort()

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

    try {
      await expect(
        listProviders(config, {
          signal: controller.signal,
        }),
      ).rejects.toBeInstanceOf(ClaudeCodeHubApiError)
    } finally {
      restoreAbortSignalStatic("any", originalAny)
      restoreAbortSignalStatic("timeout", originalTimeout)
    }
  })

  it("validates config by delegating to provider listing", async () => {
    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
    )

    await expect(validateClaudeCodeHubConfig(config)).resolves.toBe(true)
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
