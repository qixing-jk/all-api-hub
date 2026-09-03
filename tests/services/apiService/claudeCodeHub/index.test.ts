import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ClaudeCodeHubApiError,
  createProvider,
  deleteProvider,
  getUnmaskedProviderKey,
  listProviders,
  listProvidersFromAction,
  normalizeClaudeCodeHubBaseUrl,
  searchProviders,
  updateProvider,
  validateClaudeCodeHubConfig,
} from "~/services/apiService/claudeCodeHub"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://cch.example.com/",
  adminToken: "admin-secret",
}

const PROVIDER_ACTION_BASE = "https://cch.example.com/api/actions/providers"
const PROVIDER_V1_BASE = "https://cch.example.com/api/v1/providers"

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

    await expect(listProvidersFromAction(config)).resolves.toEqual([
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

  const mutationActions = [
    {
      name: "create",
      path: "addProvider",
      invoke: (signal?: AbortSignal) =>
        createProvider(
          config,
          {
            name: "Provider",
            url: "https://api.example.invalid",
            key: "sk-example",
            provider_type: "openai-compatible",
            allowed_models: [],
          },
          { signal },
        ),
    },
    {
      name: "update",
      path: "editProvider",
      invoke: (signal?: AbortSignal) =>
        updateProvider(config, { providerId: 12, name: "Updated" }, { signal }),
    },
    {
      name: "delete",
      path: "removeProvider",
      invoke: (signal?: AbortSignal) => deleteProvider(config, 12, { signal }),
    },
  ] as const

  it.each(mutationActions)(
    "$name carries affirmative action rejection evidence",
    async ({ path, invoke }) => {
      server.use(
        http.post(`${PROVIDER_ACTION_BASE}/${path}`, () =>
          HttpResponse.json(
            { ok: false, error: "provider rejected" },
            { status: 403 },
          ),
        ),
      )

      await expect(invoke()).rejects.toMatchObject({
        name: "ClaudeCodeHubApiError",
        status: 403,
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: true,
      })
    },
  )

  it.each(mutationActions)(
    "$name keeps malformed post-dispatch responses ambiguous",
    async ({ path, invoke }) => {
      server.use(
        http.post(
          `${PROVIDER_ACTION_BASE}/${path}`,
          () =>
            new HttpResponse("not json", {
              status: 200,
              headers: { "Content-Type": "text/plain" },
            }),
        ),
      )

      await expect(invoke()).rejects.toMatchObject({
        name: "ClaudeCodeHubApiError",
        status: 200,
        dispatch: "dispatched",
        responseReceived: true,
        confirmedNonApplication: false,
      })
    },
  )

  it.each(mutationActions)(
    "$name keeps response loss after dispatch ambiguous",
    async ({ path, invoke }) => {
      server.use(
        http.post(`${PROVIDER_ACTION_BASE}/${path}`, () =>
          HttpResponse.error(),
        ),
      )

      await expect(invoke()).rejects.toMatchObject({
        name: "ClaudeCodeHubApiError",
        dispatch: "dispatched",
        responseReceived: false,
        confirmedNonApplication: false,
      })
    },
  )

  it.each(mutationActions)(
    "$name marks an already-aborted caller as not dispatched",
    async ({ invoke }) => {
      const controller = new AbortController()
      controller.abort(new DOMException("cancelled", "AbortError"))

      await expect(invoke(controller.signal)).rejects.toMatchObject({
        name: "ClaudeCodeHubApiError",
        dispatch: "not-dispatched",
        responseReceived: false,
        confirmedNonApplication: true,
      })
    },
  )

  it("exposes raw mutation evidence and validated codes on Claude Code Hub errors", () => {
    const raw = new Error("provider rejected")
    const error = new ClaudeCodeHubApiError("provider rejected", 409, {
      dispatch: "dispatched",
      responseReceived: true,
      confirmedNonApplication: true,
      raw,
      code: "PROVIDER_REJECTED",
    })

    expect(error.raw).toBe(raw)
    expect(error.code).toBe("PROVIDER_REJECTED")
  })

  it("drops an invalid code from a pre-dispatch abort reason", async () => {
    const invalidReason = Object.assign(new Error("cancelled"), { code: 1.5 })
    const any = vi
      .spyOn(AbortSignal, "any")
      .mockReturnValue({ aborted: true, reason: invalidReason } as AbortSignal)

    try {
      const failure = await mutationActions[0]
        .invoke(new AbortController().signal)
        .catch((error: unknown) => error)

      expect(failure).toMatchObject({
        name: "ClaudeCodeHubApiError",
        dispatch: "not-dispatched",
        raw: invalidReason,
      })
      expect((failure as ClaudeCodeHubApiError).code).toBeUndefined()
    } finally {
      any.mockRestore()
    }
  })

  it("uses a default AbortError when an action signal has no reason", async () => {
    const any = vi
      .spyOn(AbortSignal, "any")
      .mockReturnValue({ aborted: true, reason: undefined } as AbortSignal)

    try {
      const failure = await mutationActions[0]
        .invoke(new AbortController().signal)
        .catch((error: unknown) => error)

      expect(failure).toMatchObject({
        name: "ClaudeCodeHubApiError",
        message: "The operation was aborted",
        dispatch: "not-dispatched",
        raw: expect.objectContaining({ name: "AbortError" }),
      })
    } finally {
      any.mockRestore()
    }
  })

  it("fetches an unmasked provider key from the provider v1 reveal API", async () => {
    let capturedAuthorization: string | null = null

    server.use(
      http.get(`${PROVIDER_V1_BASE}/42/key:reveal`, ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          key: "sk-real-provider-key",
        })
      }),
    )

    await expect(getUnmaskedProviderKey(config, 42)).resolves.toBe(
      "sk-real-provider-key",
    )
    expect(capturedAuthorization).toBe("Bearer admin-secret")
  })

  it("throws when the provider v1 reveal API omits a usable string key", async () => {
    server.use(
      http.get(`${PROVIDER_V1_BASE}/42/key:reveal`, () =>
        HttpResponse.json({
          key: null,
        }),
      ),
    )

    await expect(getUnmaskedProviderKey(config, 42)).rejects.toThrow(
      "invalid provider key response",
    )
  })

  it("searches providers through the provider v1 list API", async () => {
    let capturedAuthorization: string | null = null
    let capturedQuery: string | null = null

    server.use(
      http.get(PROVIDER_V1_BASE, ({ request }) => {
        const url = new URL(request.url)
        capturedAuthorization = request.headers.get("authorization")
        capturedQuery = url.searchParams.get("q")
        return HttpResponse.json({
          items: [
            {
              id: 9,
              name: "Search Match",
              url: "https://search.example.com",
            },
          ],
        })
      }),
    )

    await expect(searchProviders(config, "search match")).resolves.toEqual([
      {
        id: 9,
        name: "Search Match",
        url: "https://search.example.com",
      },
    ])
    expect(capturedAuthorization).toBe("Bearer admin-secret")
    expect(capturedQuery).toBe("search match")
  })

  it("lists providers through the provider v1 list API without search query", async () => {
    let capturedAuthorization: string | null = null
    let capturedQuery: string | null = null

    server.use(
      http.get(PROVIDER_V1_BASE, ({ request }) => {
        const url = new URL(request.url)
        capturedAuthorization = request.headers.get("authorization")
        capturedQuery = url.searchParams.get("q")
        return HttpResponse.json({
          items: [
            {
              id: 10,
              name: "Listed Provider",
              url: "https://listed.example.com",
            },
          ],
        })
      }),
    )

    await expect(listProviders(config)).resolves.toEqual([
      {
        id: 10,
        name: "Listed Provider",
        url: "https://listed.example.com",
      },
    ])
    expect(capturedAuthorization).toBe("Bearer admin-secret")
    expect(capturedQuery).toBeNull()
  })

  it("throws when the provider v1 list API returns a non-JSON response", async () => {
    server.use(
      http.get(
        PROVIDER_V1_BASE,
        () =>
          new HttpResponse("not json", {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          }),
      ),
    )

    await expect(listProviders(config)).rejects.toThrow("non-JSON response")
  })

  it("keeps canonical v1 problem details and error metadata internally", async () => {
    const problem = {
      type: "urn:claude-code-hub:problem:auth.forbidden",
      title: "Forbidden",
      status: 403,
      detail: "bad token admin-secret",
      instance: "/api/v1/providers",
      errorCode: "auth.forbidden",
      errorParams: { role: "admin" },
    }
    server.use(
      http.get(PROVIDER_V1_BASE, () =>
        HttpResponse.json(problem, { status: 403 }),
      ),
    )

    await expect(listProviders(config)).rejects.toMatchObject({
      message: "bad token admin-secret",
      status: 403,
      code: "auth.forbidden",
      raw: problem,
    })
  })

  it("ignores unverified v1 fields and response status text", async () => {
    const failure = {
      error: "legacy admin-secret",
      message: "legacy message",
      status: 403,
    }
    server.use(
      http.get(PROVIDER_V1_BASE, () =>
        HttpResponse.json(failure, {
          status: 403,
          statusText: "Forbidden",
        }),
      ),
    )

    await expect(listProviders(config)).rejects.toMatchObject({
      message: "Claude Code Hub request failed (403)",
      status: 403,
      code: undefined,
      raw: failure,
    })
  })

  it("falls back from a blank v1 detail to the verified problem title", async () => {
    server.use(
      http.get(PROVIDER_V1_BASE, () =>
        HttpResponse.json(
          { detail: "   ", title: "Provider request rejected" },
          { status: 400 },
        ),
      ),
    )

    await expect(listProviders(config)).rejects.toMatchObject({
      message: "Provider request rejected",
      status: 400,
    })
  })

  it("preserves provider v1 search details until disclosure", async () => {
    server.use(
      http.get(PROVIDER_V1_BASE, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Provider search failed",
            detail: "bad token admin-secret while searching",
          },
          { status: 500 },
        ),
      ),
    )

    await expect(searchProviders(config, "search match")).rejects.toThrow(
      "bad token admin-secret while searching",
    )
  })

  it("preserves provider v1 list details until disclosure", async () => {
    server.use(
      http.get(PROVIDER_V1_BASE, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Provider list failed",
            detail: "bad token admin-secret while listing",
          },
          { status: 403 },
        ),
      ),
    )

    await expect(listProviders(config)).rejects.toThrow(
      "bad token admin-secret while listing",
    )
  })

  it("wraps provider v1 list network failures in a ClaudeCodeHubApiError", async () => {
    server.use(http.get(PROVIDER_V1_BASE, () => HttpResponse.error()))

    await expect(listProviders(config)).rejects.toBeInstanceOf(
      ClaudeCodeHubApiError,
    )
  })

  it("combines caller signals for the provider v1 list API", async () => {
    const controller = new AbortController()
    let capturedSignal: AbortSignal | null = null

    server.use(
      http.get(PROVIDER_V1_BASE, ({ request }) => {
        capturedSignal = request.signal
        return HttpResponse.json({ items: [] })
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

  it("rejects already-aborted caller signals for the provider v1 list API", async () => {
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

  it("preserves provider v1 reveal details until disclosure", async () => {
    server.use(
      http.get(`${PROVIDER_V1_BASE}/42/key:reveal`, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Admin access required",
            detail: "bad token admin-secret",
          },
          { status: 403 },
        ),
      ),
    )

    await expect(getUnmaskedProviderKey(config, 42)).rejects.toThrow(
      "bad token admin-secret",
    )
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

    await expect(listProvidersFromAction(config)).resolves.toEqual([
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

    await expect(listProvidersFromAction(config)).resolves.toEqual([])
  })

  it("keeps a verified action error string and raw response internally", async () => {
    const failure = {
      ok: false,
      error: "bad token admin-secret and key sk-real-key",
      errorCode: "provider.invalid_key",
      errorParams: { provider: "Provider" },
    }
    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/addProvider`, () =>
        HttpResponse.json(failure, { status: 403 }),
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
    ).rejects.toMatchObject({
      message: "bad token admin-secret and key sk-real-key",
      status: 403,
      code: "provider.invalid_key",
      raw: failure,
    })
  })

  it("ignores unverified action error objects and uses the fixed fallback", async () => {
    const failure = {
      ok: false,
      error: { detail: "unverified admin-secret" },
    }
    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/addProvider`, () =>
        HttpResponse.json(failure, {
          status: 403,
          statusText: "Forbidden",
        }),
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
    ).rejects.toMatchObject({
      message: "Claude Code Hub request failed (403)",
      raw: failure,
    })
  })

  it("preserves verified action strings and ignores unverified objects", async () => {
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
    ).rejects.toThrow("bad token admin-secret and key sk-real-key")

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
    ).rejects.toThrow("Claude Code Hub request failed (403)")

    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, () =>
        HttpResponse.json({ success: true }),
      ),
    )

    await expect(listProvidersFromAction(config)).rejects.toThrow(
      "invalid action response",
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

    await listProvidersFromAction(config, { signal: controller.signal })

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
        listProvidersFromAction(config, {
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
        listProvidersFromAction(config, {
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
        listProvidersFromAction(config, {
          signal: controller.signal,
        }),
      ).rejects.toBeInstanceOf(ClaudeCodeHubApiError)
    } finally {
      restoreAbortSignalStatic("any", originalAny)
      restoreAbortSignalStatic("timeout", originalTimeout)
    }
  })

  it("validates config by delegating to the provider v1 list API", async () => {
    let capturedAuthorization: string | null = null

    server.use(
      http.get(PROVIDER_V1_BASE, ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({ items: [] })
      }),
    )

    await expect(validateClaudeCodeHubConfig(config)).resolves.toBe(true)
    expect(capturedAuthorization).toBe("Bearer admin-secret")
  })

  it("wraps network failures in a ClaudeCodeHubApiError", async () => {
    server.use(
      http.post(`${PROVIDER_ACTION_BASE}/getProviders`, () =>
        HttpResponse.error(),
      ),
    )

    await expect(listProvidersFromAction(config)).rejects.toBeInstanceOf(
      ClaudeCodeHubApiError,
    )
  })
})
