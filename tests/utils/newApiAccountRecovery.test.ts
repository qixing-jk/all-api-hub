import type { ConsoleMessage, Page, Request, Response } from "@playwright/test"
import { describe, expect, it, vi } from "vitest"

import { installExtensionPageGuards } from "~~/e2e/utils/commonUserFlows"
import type { AccountAddDialog } from "~~/e2e/utils/realSite/accountAdd"
import {
  createNewApiAccountRecovery,
  describeNewApiRefreshObservations,
  observeNewApiRefreshes,
} from "~~/e2e/utils/realSite/newApiAccountRecovery"

/** Emits browser-context responses without requiring a live authenticated site. */
function createObserverPage() {
  const handlers = new Map<string, (value: Request | Response) => void>()
  const page = {
    context: () => ({
      on: vi.fn((event, handler) => handlers.set(event, handler)),
    }),
  }
  return Object.assign(page as unknown as Page, {
    emitResponse: (response: Response) => handlers.get("response")!(response),
    emitRequest: (request: Request) => handlers.get("request")!(request),
    emitFailure: (request: Request) => handlers.get("requestfailed")!(request),
  })
}

function createRefreshResponse(
  params: {
    url?: string
    status?: number
    json?: () => Promise<unknown>
    request?: Request
  } = {},
) {
  const request = params.request ?? createRefreshRequest()
  return {
    request: () => request,
    url: () =>
      params.url ?? "https://new-api.example.invalid/api/user/auth/refresh",
    status: () => params.status ?? 429,
    json:
      params.json ??
      vi.fn().mockResolvedValue({
        code: "AUTH_SESSION_ISSUANCE_LIMIT",
        message: "Too many sessions",
      }),
  } as unknown as Response
}

function createRefreshRequest(errorText = "net::ERR_CONNECTION_RESET") {
  return {
    url: () => "https://new-api.example.invalid/api/user/auth/refresh",
    failure: () => ({ errorText }),
  } as unknown as Request
}

describe("New API account recovery console guard", () => {
  const baseUrl = "https://new-api.example.invalid"

  it.each([
    ["token verification response", `${baseUrl}/api/user/token`, 403, false],
    ["other account endpoint", `${baseUrl}/api/user/self`, 403, true],
    ["other site", "https://other.example.invalid/api/user/token", 403, true],
    ["token server failure", `${baseUrl}/api/user/token`, 500, true],
    ["unrelated token request", `${baseUrl}/api/user/token/status`, 403, true],
  ])(
    "handles %s without hiding unrelated failures",
    (_label, url, status, throws) => {
      const handlers = new Map<string, (message: ConsoleMessage) => void>()
      const page = {
        on: vi.fn((event, handler) => handlers.set(event, handler)),
      } as unknown as Page
      const recovery = createNewApiAccountRecovery({
        page,
        config: {
          baseUrl,
          loginUrl: `${baseUrl}/login`,
          loginApiUrl: `${baseUrl}/api/user/login`,
          login2faApiUrl: `${baseUrl}/api/user/login/2fa`,
          username: "test-user",
          password: "test-password",
        },
      })
      installExtensionPageGuards(page, recovery.extensionPageGuardOptions)
      const message = {
        type: () => "error",
        text: () =>
          `Failed to load resource: the server responded with a status of ${status} ()`,
        location: () => ({ url, lineNumber: 0, columnNumber: 0 }),
      } as ConsoleMessage
      const emit = () => handlers.get("console")!(message)

      if (throws) expect(emit).toThrow(`status of ${status}`)
      else expect(emit).not.toThrow()
    },
  )
})

describe("New API account recovery dialog readiness", () => {
  const baseUrl = "https://new-api.example.invalid"
  const config = {
    baseUrl,
    loginUrl: `${baseUrl}/login`,
    loginApiUrl: `${baseUrl}/api/user/login`,
    login2faApiUrl: `${baseUrl}/api/user/login/2fa`,
    username: "test-user",
    password: "test-password",
  }

  function createDetectedDialog(
    failureText: string | null,
    overrides: { confirmAddButton?: Record<string, unknown> } = {},
  ) {
    const recoveryHeading = {
      isVisible: vi.fn().mockResolvedValue(false),
    }
    const failureBanner = {
      isVisible: vi.fn().mockResolvedValue(Boolean(failureText)),
      innerText: vi.fn().mockResolvedValue(failureText ?? ""),
      first: vi.fn(),
    }
    failureBanner.first.mockReturnValue(failureBanner)
    const dialogRoot = {
      getByText: vi.fn((matcher: unknown) =>
        matcher instanceof RegExp ? failureBanner : recoveryHeading,
      ),
    }

    return {
      dialog: {
        dialog: dialogRoot,
        confirmAddButton: {
          isVisible: vi.fn().mockResolvedValue(false),
          isEnabled: vi.fn().mockResolvedValue(false),
          ...overrides.confirmAddButton,
        },
      } as unknown as AccountAddDialog,
      dialogRoot,
    }
  }

  it("reports the visible auto-detection failure when the dialog never becomes ready", async () => {
    const { dialog } = createDetectedDialog(
      "Auto-detection failed: Could not get User ID",
    )
    const recovery = createNewApiAccountRecovery({
      page: createObserverPage(),
      config,
      dialogReadyTimeoutMs: 25,
    })

    await expect(recovery.prepareDetectedDialog(dialog)).rejects.toThrow(
      "Could not get User ID",
    )
  })

  it("falls back to the timeout detail when no failure banner is visible", async () => {
    const { dialog } = createDetectedDialog(null)
    const recovery = createNewApiAccountRecovery({
      page: createObserverPage(),
      config,
      dialogReadyTimeoutMs: 25,
    })

    await expect(recovery.prepareDetectedDialog(dialog)).rejects.toThrow(
      /never became confirmable/u,
    )
  })

  it("includes the refresh status in the detection failure while its body is pending", async () => {
    const page = createObserverPage()
    const { dialog } = createDetectedDialog(
      "Auto-detection failed: Could not get User ID",
    )
    const recovery = createNewApiAccountRecovery({
      page,
      config,
      dialogReadyTimeoutMs: 25,
    })
    page.emitResponse(
      createRefreshResponse({ json: () => new Promise(() => {}) }),
    )

    await expect(recovery.prepareDetectedDialog(dialog)).rejects.toThrow(
      "dashboard refresh responses: 429 (body pending)",
    )
  })

  it("includes only the configured site's deployment details in the failure report", async () => {
    const page = createObserverPage()
    const { dialog } = createDetectedDialog(null)
    const recovery = createNewApiAccountRecovery({
      page,
      config,
      dialogReadyTimeoutMs: 25,
    })
    page.emitResponse(
      createRefreshResponse({
        url: "https://other.example.invalid/api/user/auth/refresh",
        status: 401,
      }),
    )
    page.emitResponse(createRefreshResponse())

    const failure = recovery.prepareDetectedDialog(dialog)
    await expect(failure).rejects.toThrow(
      "dashboard refresh responses: 429 AUTH_SESSION_ISSUANCE_LIMIT: Too many sessions",
    )
    await expect(failure).rejects.not.toThrow("401")
  })

  it("rethrows predicate failures instead of reporting a readiness timeout", async () => {
    const predicateError = new Error(
      "strict mode violation: ready button resolved to 2 elements",
    )
    const { dialog } = createDetectedDialog(null, {
      confirmAddButton: {
        isVisible: vi.fn().mockRejectedValue(predicateError),
      },
    })
    const recovery = createNewApiAccountRecovery({
      page: createObserverPage(),
      config,
      dialogReadyTimeoutMs: 25,
    })

    await expect(recovery.prepareDetectedDialog(dialog)).rejects.toBe(
      predicateError,
    )
  })
})

describe("New API refresh response observer", () => {
  const baseUrl = "https://new-api.example.invalid/dashboard"

  it("distinguishes a dispatched request waiting for headers", () => {
    const page = createObserverPage()
    const observer = observeNewApiRefreshes(page, baseUrl)
    page.emitRequest(createRefreshRequest())
    expect(observer.describe()).toMatch(/request pending \(\d+ms\)/u)
  })

  it("records network failures even when no HTTP response arrives", () => {
    const page = createObserverPage()
    const observer = observeNewApiRefreshes(page, baseUrl)
    const request = createRefreshRequest()
    page.emitRequest(request)
    page.emitFailure(request)
    expect(observer.describe()).toContain(
      "request failed: net::ERR_CONNECTION_RESET",
    )
  })

  it("updates a dispatched request with its response rather than duplicating it", async () => {
    const page = createObserverPage()
    const observer = observeNewApiRefreshes(page, baseUrl)
    const request = createRefreshRequest()
    page.emitRequest(request)
    page.emitResponse(createRefreshResponse({ request }))
    await vi.waitFor(() =>
      expect(observer.describe()).toBe(
        "dashboard refresh responses: 429 AUTH_SESSION_ISSUANCE_LIMIT: Too many sessions",
      ),
    )
  })

  it("records the HTTP status before the response body arrives", () => {
    const page = createObserverPage()
    const observer = observeNewApiRefreshes(page, baseUrl)
    page.emitResponse(
      createRefreshResponse({ json: () => new Promise(() => {}) }),
    )

    expect(observer.describe()).toBe(
      "dashboard refresh responses: 429 (body pending)",
    )
  })

  it.each([
    "https://other.example.invalid/api/user/auth/refresh",
    "https://new-api.example.invalid/api/user/self",
    "not a URL",
  ])("ignores unrelated responses without reading their bodies: %s", (url) => {
    const page = createObserverPage()
    const observer = observeNewApiRefreshes(page, baseUrl)
    const json = vi.fn().mockResolvedValue({})
    page.emitResponse(createRefreshResponse({ url, json }))

    expect(json).not.toHaveBeenCalled()
    expect(observer.describe()).toBe("")
  })

  it("retains the status when the response body cannot be parsed", async () => {
    const page = createObserverPage()
    const observer = observeNewApiRefreshes(page, baseUrl)
    page.emitResponse(
      createRefreshResponse({
        status: 502,
        json: vi.fn().mockRejectedValue(new Error("Not JSON")),
      }),
    )

    await vi.waitFor(() =>
      expect(observer.describe()).toBe(
        "dashboard refresh responses: 502 (body unavailable)",
      ),
    )
  })

  it("preserves response arrival order when bodies finish out of order", async () => {
    const page = createObserverPage()
    const observer = observeNewApiRefreshes(page, baseUrl)
    let resolveFirst!: (body: unknown) => void
    page.emitResponse(
      createRefreshResponse({
        status: 409,
        json: () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      }),
    )
    page.emitResponse(
      createRefreshResponse({ status: 200, json: async () => ({}) }),
    )
    await vi.waitFor(() => expect(observer.describe()).toContain(" | 200"))
    resolveFirst({ code: "AUTH_REFRESH_RACE", message: "Conflict" })

    await vi.waitFor(() =>
      expect(observer.describe()).toBe(
        "dashboard refresh responses: 409 AUTH_REFRESH_RACE: Conflict | 200",
      ),
    )
  })

  it("keeps the last four arrivals even when an older body finishes late", async () => {
    const page = createObserverPage()
    const observer = observeNewApiRefreshes(page, baseUrl)
    let resolveFirst!: (body: unknown) => void
    page.emitResponse(
      createRefreshResponse({
        status: 401,
        json: () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      }),
    )
    for (const status of [409, 429, 502, 200]) {
      page.emitResponse(
        createRefreshResponse({ status, json: async () => ({}) }),
      )
    }
    await vi.waitFor(() =>
      expect(observer.describe()).toBe(
        "dashboard refresh responses: 409 | 429 | 502 | 200",
      ),
    )
    resolveFirst({ code: "AUTH_UNAUTHORIZED" })
    await new Promise<void>((resolve) => queueMicrotask(resolve))

    expect(observer.describe()).toBe(
      "dashboard refresh responses: 409 | 429 | 502 | 200",
    )
  })
})

describe("New API refresh observation rendering", () => {
  it("renders each recorded refresh response with its deployment code", () => {
    expect(
      describeNewApiRefreshObservations([
        {
          status: 401,
          code: "AUTH_UNAUTHORIZED",
          message: "Unauthorized",
          bodyState: "parsed",
        },
        {
          status: 409,
          code: "AUTH_REFRESH_RACE",
          message: "Conflict",
          bodyState: "parsed",
        },
        { status: 200, code: null, message: null, bodyState: "parsed" },
      ]),
    ).toBe(
      "dashboard refresh responses: 401 AUTH_UNAUTHORIZED: Unauthorized | 409 AUTH_REFRESH_RACE: Conflict | 200",
    )
  })

  it("renders nothing when no refresh response was observed", () => {
    expect(describeNewApiRefreshObservations([])).toBe("")
  })

  it("bounds a long deployment message so it cannot bloat failure output", () => {
    const rendered = describeNewApiRefreshObservations([
      {
        status: 429,
        code: "AUTH_SESSION_ISSUANCE_LIMIT",
        message: "x".repeat(500),
        bodyState: "parsed",
      },
    ])
    expect(rendered).toContain("AUTH_SESSION_ISSUANCE_LIMIT")
    expect(rendered.length).toBeLessThan(400)
  })
})
