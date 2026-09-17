import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  ClaudeCodeHubApiError,
  createProviderV1,
  deleteProviderV1,
  getProvider,
  getUnmaskedProviderKey,
  listProviders,
  normalizeClaudeCodeHubBaseUrl,
  searchProviders,
  updateProviderV1,
  validateClaudeCodeHubConfig,
} from "~/services/apiService/claudeCodeHub"
import { server } from "~~/tests/msw/server"

const config = {
  baseUrl: "https://cch.example.com/",
  adminToken: "admin-secret",
}

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

describe("Claude Code Hub V1 API adapter", () => {
  beforeEach(() => {
    server.resetHandlers()
  })
  it("normalizes base URLs", () => {
    expect(normalizeClaudeCodeHubBaseUrl(config.baseUrl)).toBe(
      "https://cch.example.com",
    )
  })

  const mutationActions = [
    {
      name: "create",
      path: "",
      invoke: (signal?: AbortSignal) =>
        createProviderV1(
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
      path: "/12",
      invoke: (signal?: AbortSignal) =>
        updateProviderV1(config, 12, { name: "Updated" }, { signal }),
    },
    {
      name: "delete",
      path: "/12",
      invoke: (signal?: AbortSignal) =>
        deleteProviderV1(config, 12, { signal }),
    },
  ] as const

  it.each(mutationActions)(
    "$name carries affirmative V1 rejection evidence",
    async ({ path, invoke }) => {
      server.use(
        http.all(`${PROVIDER_V1_BASE}${path}`, () =>
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
    "$name keeps malformed error responses after dispatch ambiguous",
    async ({ path, invoke }) => {
      server.use(
        http.all(
          `${PROVIDER_V1_BASE}${path}`,
          () =>
            new HttpResponse("not json", {
              status: 502,
              headers: { "Content-Type": "text/plain" },
            }),
        ),
      )

      await expect(invoke()).rejects.toMatchObject({
        name: "ClaudeCodeHubApiError",
        status: 502,
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
        http.all(`${PROVIDER_V1_BASE}${path}`, () => HttpResponse.error()),
      )

      await expect(invoke()).rejects.toMatchObject({
        name: "ClaudeCodeHubApiError",
        dispatch: "dispatched",
        responseReceived: false,
        confirmedNonApplication: false,
      })
    },
  )

  it.each(mutationActions.filter(({ name }) => name !== "delete"))(
    "$name keeps an HTTP-success response with malformed JSON ambiguous",
    async ({ path, invoke }) => {
      server.use(
        http.all(
          `${PROVIDER_V1_BASE}${path}`,
          () => new HttpResponse("not json", { status: 200 }),
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

  it("uses a default AbortError when a request signal has no reason", async () => {
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

  it("uses the native v1 resource methods and strict request bodies", async () => {
    const requests: Array<{ method: string; path: string; body?: unknown }> = []
    const summary = {
      id: 42,
      name: "Native provider",
      url: "https://api.example.invalid",
      providerType: "openai-compatible",
      allowedModels: [{ matchType: "exact", pattern: "model-example" }],
    }

    server.use(
      http.get(`${PROVIDER_V1_BASE}/42`, ({ request }) => {
        requests.push({
          method: request.method,
          path: new URL(request.url).pathname,
        })
        return HttpResponse.json(summary)
      }),
      http.post(PROVIDER_V1_BASE, async ({ request }) => {
        requests.push({
          method: request.method,
          path: new URL(request.url).pathname,
          body: await request.json(),
        })
        return HttpResponse.json(summary, { status: 201 })
      }),
      http.patch(`${PROVIDER_V1_BASE}/42`, async ({ request }) => {
        requests.push({
          method: request.method,
          path: new URL(request.url).pathname,
          body: await request.json(),
        })
        return HttpResponse.json({ ...summary, name: "Updated provider" })
      }),
      http.delete(`${PROVIDER_V1_BASE}/42`, ({ request }) => {
        requests.push({
          method: request.method,
          path: new URL(request.url).pathname,
        })
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(getProvider(config, 42)).resolves.toEqual(summary)
    await expect(
      createProviderV1(config, {
        name: "Native provider",
        url: "https://api.example.invalid",
        key: "credential-placeholder",
        provider_type: "openai-compatible",
        allowed_models: [{ matchType: "exact", pattern: "model-example" }],
      }),
    ).resolves.toEqual(summary)
    await expect(
      updateProviderV1(config, 42, {
        name: "Updated provider",
        is_enabled: false,
      }),
    ).resolves.toEqual({ ...summary, name: "Updated provider" })
    await expect(deleteProviderV1(config, 42)).resolves.toBeUndefined()

    expect(requests).toEqual([
      { method: "GET", path: "/api/v1/providers/42" },
      {
        method: "POST",
        path: "/api/v1/providers",
        body: {
          name: "Native provider",
          url: "https://api.example.invalid",
          key: "credential-placeholder",
          provider_type: "openai-compatible",
          allowed_models: [{ matchType: "exact", pattern: "model-example" }],
        },
      },
      {
        method: "PATCH",
        path: "/api/v1/providers/42",
        body: { name: "Updated provider", is_enabled: false },
      },
      { method: "DELETE", path: "/api/v1/providers/42" },
    ])
  })

  it("marks deterministic v1 rejections as confirmed and uncertain failures as ambiguous", async () => {
    server.use(
      http.post(PROVIDER_V1_BASE, () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Provider rejected",
            detail: "Provider input is invalid",
          },
          { status: 422 },
        ),
      ),
    )
    const invoke = () =>
      createProviderV1(config, {
        name: "Native provider",
        url: "https://api.example.invalid",
        key: "credential-placeholder",
        provider_type: "openai-compatible",
        allowed_models: [],
      })

    await expect(invoke()).rejects.toMatchObject({
      name: "ClaudeCodeHubApiError",
      status: 422,
      dispatch: "dispatched",
      responseReceived: true,
      confirmedNonApplication: true,
    })

    server.use(
      http.post(PROVIDER_V1_BASE, () =>
        HttpResponse.json(
          {
            title: "Temporary upstream failure",
            detail: "The response was lost after dispatch",
          },
          { status: 503 },
        ),
      ),
    )
    await expect(invoke()).rejects.toMatchObject({
      name: "ClaudeCodeHubApiError",
      status: 503,
      dispatch: "dispatched",
      responseReceived: true,
      confirmedNonApplication: false,
    })

    server.use(http.post(PROVIDER_V1_BASE, () => HttpResponse.error()))
    await expect(invoke()).rejects.toMatchObject({
      name: "ClaudeCodeHubApiError",
      dispatch: "dispatched",
      responseReceived: false,
      confirmedNonApplication: false,
    })
  })

  it("uses a default AbortError when a pre-cancelled v1 mutation has no reason", async () => {
    const any = vi
      .spyOn(AbortSignal, "any")
      .mockReturnValue({ aborted: true, reason: undefined } as AbortSignal)

    try {
      const failure = await createProviderV1(
        config,
        {
          name: "Native provider",
          url: "https://api.example.invalid",
          key: "credential-placeholder",
          provider_type: "openai-compatible",
          allowed_models: [],
        },
        { signal: new AbortController().signal },
      ).catch((error: unknown) => error)

      expect(failure).toMatchObject({
        name: "ClaudeCodeHubApiError",
        message: "The operation was aborted",
        dispatch: "not-dispatched",
        responseReceived: false,
        confirmedNonApplication: true,
        raw: expect.objectContaining({ name: "AbortError" }),
        code: DOMException.ABORT_ERR,
      })
    } finally {
      any.mockRestore()
    }
  })

  it("wraps evidence-less v1 parse errors with mutation evidence", async () => {
    server.use(
      http.post(
        PROVIDER_V1_BASE,
        () =>
          new HttpResponse("not json", {
            status: 502,
            headers: { "Content-Type": "text/plain" },
          }),
      ),
    )

    const failure = await createProviderV1(config, {
      name: "Native provider",
      url: "https://api.example.invalid",
      key: "credential-placeholder",
      provider_type: "openai-compatible",
      allowed_models: [],
    }).catch((error: unknown) => error)

    expect(failure).toMatchObject({
      name: "ClaudeCodeHubApiError",
      message: "Claude Code Hub returned a non-JSON response (502)",
      status: 502,
      dispatch: "dispatched",
      responseReceived: true,
      confirmedNonApplication: false,
      code: undefined,
    })
    expect((failure as ClaudeCodeHubApiError).raw).toBeInstanceOf(
      ClaudeCodeHubApiError,
    )
    expect(
      ((failure as ClaudeCodeHubApiError).raw as ClaudeCodeHubApiError)
        .evidence,
    ).toBeUndefined()
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

  it("preserves literal search text and trims whitespace in the provider v1 query", async () => {
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

    await expect(
      searchProviders(config, "  Search & 渠道 + #1  "),
    ).resolves.toEqual([
      {
        id: 9,
        name: "Search Match",
        url: "https://search.example.com",
      },
    ])
    expect(capturedAuthorization).toBe("Bearer admin-secret")
    expect(capturedQuery).toBe("Search & 渠道 + #1")
    await searchProviders(config, "   ")
    expect(capturedQuery).toBeNull()
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

  it.each(["bare", "providers", "data"] as const)(
    "preserves the %s provider-list compatibility envelope through v1",
    async (envelope) => {
      const providers = [
        { id: 11, name: "Compatible Provider", url: "https://api.example.com" },
      ]
      const payload =
        envelope === "bare" ? providers : { [envelope]: providers }
      server.use(http.get(PROVIDER_V1_BASE, () => HttpResponse.json(payload)))

      await expect(listProviders(config)).resolves.toEqual(providers)
    },
  )

  it("preserves the empty-list fallback for an unsupported v1 payload shape", async () => {
    server.use(
      http.get(PROVIDER_V1_BASE, () =>
        HttpResponse.json({ providers: {}, items: null, data: "not an array" }),
      ),
    )

    await expect(listProviders(config)).resolves.toEqual([])
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

  it("combines a caller-provided signal with the timeout safety floor", async () => {
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
      http.get(PROVIDER_V1_BASE, ({ request }) => {
        capturedSignal = request.signal
        return HttpResponse.json({ items: [] })
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
      http.get(PROVIDER_V1_BASE, () => HttpResponse.json({ items: [] })),
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
    server.use(http.get(PROVIDER_V1_BASE, () => HttpResponse.error()))

    await expect(listProviders(config)).rejects.toBeInstanceOf(
      ClaudeCodeHubApiError,
    )
  })
})
