import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { validateNewApiAccessToken } from "~/services/apiService/newApiFamily/accessTokens/validation"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const target = {
  baseUrl: "https://new-api-verification.example.invalid",
  siteType: SITE_TYPES.NEW_API,
  userId: " 17 ",
  accessToken: " fixture-token ",
}
const endpoint = "/api/user/self"
const url = target.baseUrl + endpoint

describe("validateNewApiAccessToken", () => {
  it("verifies the exact credential with an isolated GET and bounded timeout", async () => {
    const request = vi.spyOn(newApiFamilyRequests, "data")
    const runtime = vi.spyOn(browser.runtime, "sendMessage")
    const controller = new AbortController()
    const received = vi.fn()
    server.use(
      http.get(url, ({ request }) => {
        received(
          request.headers.get("Authorization"),
          request.headers.get("Cookie"),
        )
        return HttpResponse.json({ success: true, data: { id: " 17 " } })
      }),
    )
    try {
      await expect(
        validateNewApiAccessToken({
          ...target,
          abortSignal: controller.signal,
        }),
      ).resolves.toEqual({ status: "valid" })
      expect(received).toHaveBeenCalledExactlyOnceWith(
        "Bearer fixture-token",
        null,
      )
      expect(request).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          baseUrl: target.baseUrl,
          siteType: SITE_TYPES.NEW_API,
          directRequestReason: API_DIRECT_REQUEST_REASONS.CredentialIsolation,
          allowAccountCredentialRecovery: false,
          requestTimeoutMs: 10_000,
          abortSignal: controller.signal,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            userId: "17",
            accessToken: "fixture-token",
          },
        }),
        {
          endpoint,
          currentTabTransport: "disabled",
          tempWindowFallback: { codes: [], statusCodes: [] },
          options: { method: "GET", credentials: "omit", redirect: "error" },
        },
      )
      expect(runtime).not.toHaveBeenCalled()
    } finally {
      request.mockRestore()
      runtime.mockRestore()
    }
  })

  it.each([
    { id: 17, expected: "valid" },
    { id: 18, expected: "identity_mismatch" },
    { id: "", expected: "unavailable" },
    { id: null, expected: "unavailable" },
    { id: true, expected: "unavailable" },
  ])(
    "classifies the returned account ID $id as $expected",
    async ({ id, expected }) => {
      server.use(
        http.get(url, () => HttpResponse.json({ success: true, data: { id } })),
      )
      await expect(validateNewApiAccessToken(target)).resolves.toEqual({
        status: expected,
      })
    },
  )

  it.each([401, 403])(
    "classifies an attributable HTTP %i as invalid without browser fallback",
    async (status) => {
      const runtime = vi.spyOn(browser.runtime, "sendMessage")
      const received = vi.fn(() =>
        HttpResponse.json(
          { success: false, message: "Credential rejected" },
          { status },
        ),
      )
      server.use(http.get(url, received))
      try {
        await expect(validateNewApiAccessToken(target)).resolves.toEqual({
          status: "invalid",
        })
        expect(received).toHaveBeenCalledOnce()
        expect(runtime).not.toHaveBeenCalled()
      } finally {
        runtime.mockRestore()
      }
    },
  )

  it.each([
    { name: "network error", reply: () => HttpResponse.error() },
    {
      name: "HTTP 503",
      reply: () =>
        HttpResponse.json(
          { success: false, message: "Unavailable" },
          { status: 503 },
        ),
    },
    {
      name: "WAF challenge",
      reply: () =>
        HttpResponse.html("Please wait", {
          status: 403,
          headers: { "cf-mitigated": "challenge" },
        }),
    },
    {
      name: "unattributed 403 HTML",
      reply: () => HttpResponse.html("<h1>Forbidden</h1>", { status: 403 }),
    },
    {
      name: "malformed JSON",
      reply: () =>
        new HttpResponse("not JSON", {
          headers: { "Content-Type": "application/json" },
        }),
    },
  ])("keeps $name inconclusive", async ({ reply }) => {
    const runtime = vi.spyOn(browser.runtime, "sendMessage")
    server.use(http.get(url, reply))
    try {
      await expect(validateNewApiAccessToken(target)).resolves.toEqual({
        status: "unavailable",
      })
      expect(runtime).not.toHaveBeenCalled()
    } finally {
      runtime.mockRestore()
    }
  })

  it("treats an internal request timeout as unavailable", async () => {
    const request = vi
      .spyOn(newApiFamilyRequests, "data")
      .mockRejectedValueOnce(
        new DOMException("Request timed out", "TimeoutError"),
      )
    try {
      await expect(validateNewApiAccessToken(target)).resolves.toEqual({
        status: "unavailable",
      })
      expect(request).toHaveBeenCalledOnce()
    } finally {
      request.mockRestore()
    }
  })

  it.each([
    { baseUrl: "ftp://example.invalid" },
    { baseUrl: "https://user:password@example.invalid" },
    { baseUrl: "" },
    { accessToken: " " },
    { userId: " " },
    { siteType: SITE_TYPES.APIYI },
  ])("skips an ineligible target %o", async (invalid) => {
    const request = vi.spyOn(newApiFamilyRequests, "data")
    try {
      await expect(
        validateNewApiAccessToken({ ...target, ...invalid }),
      ).resolves.toEqual({ status: "unavailable" })
      expect(request).not.toHaveBeenCalled()
    } finally {
      request.mockRestore()
    }
  })

  it("propagates cancellation even if the request resolves after the signal aborts", async () => {
    const controller = new AbortController()
    const request = vi
      .spyOn(newApiFamilyRequests, "data")
      .mockImplementationOnce(async () => {
        controller.abort()
        return { id: 17 } as never
      })
    try {
      await expect(
        validateNewApiAccessToken({
          ...target,
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" })
      expect(request).toHaveBeenCalledOnce()
      await expect(
        validateNewApiAccessToken({
          ...target,
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: "AbortError" })
      expect(request).toHaveBeenCalledOnce()
    } finally {
      request.mockRestore()
    }
  })
})
