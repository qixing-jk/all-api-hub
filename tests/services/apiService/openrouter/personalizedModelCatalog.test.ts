import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { fetchOpenRouterPersonalizedModelCatalog } from "~/services/apiService/openrouter/personalizedModelCatalog"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { server } from "~~/tests/msw/server"

describe("OpenRouter personalized model catalog transport", () => {
  beforeEach(() => server.resetHandlers())

  it("uses a Management Key only on the canonical personalized endpoint", async () => {
    let capturedRequest: Request | undefined
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models/user`, ({ request }) => {
        capturedRequest = request
        return HttpResponse.json({
          data: [{ id: "example/model-alpha", name: "Model Alpha" }],
          total_count: 1,
          links: { next: null },
        })
      }),
    )

    await expect(
      fetchOpenRouterPersonalizedModelCatalog({
        accountId: "account-example-a",
        managementKey: "management-key-example",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "example/model-alpha",
        name: "Model Alpha",
      }),
    ])
    expect(capturedRequest?.url).toBe(`${OPENROUTER_API_BASE_URL}/models/user`)
    expect(capturedRequest?.headers.get("authorization")).toBe(
      "Bearer management-key-example",
    )
  })

  it("follows canonical offset pagination without mixing model identities", async () => {
    const requestedUrls: string[] = []
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models/user`, ({ request }) => {
        requestedUrls.push(request.url)
        const offset = new URL(request.url).searchParams.get("offset")

        return HttpResponse.json(
          offset === "1"
            ? {
                data: [{ id: "example/model-beta" }],
                total_count: 2,
                links: { next: null },
              }
            : {
                data: [{ id: "example/model-alpha" }],
                total_count: 2,
                links: {
                  next: `${OPENROUTER_API_BASE_URL}/models/user?offset=1&limit=1`,
                },
              },
        )
      }),
    )

    await expect(
      fetchOpenRouterPersonalizedModelCatalog({
        accountId: "account-example-a",
        managementKey: "management-key-example",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "example/model-alpha" }),
      expect.objectContaining({ id: "example/model-beta" }),
    ])
    expect(requestedUrls).toEqual([
      `${OPENROUTER_API_BASE_URL}/models/user`,
      `${OPENROUTER_API_BASE_URL}/models/user?offset=1&limit=1`,
    ])
  })

  it.each([
    { status: 401, code: API_ERROR_CODES.HTTP_401 },
    { status: 403, code: API_ERROR_CODES.HTTP_403 },
    { status: 429, code: API_ERROR_CODES.HTTP_429 },
    { status: 503, code: API_ERROR_CODES.HTTP_OTHER },
  ])(
    "classifies personalized HTTP $status failures",
    async ({ status, code }) => {
      server.use(
        http.get(`${OPENROUTER_API_BASE_URL}/models/user`, () =>
          HttpResponse.json({}, { status }),
        ),
      )

      await expect(
        fetchOpenRouterPersonalizedModelCatalog({
          accountId: "account-example-a",
          managementKey: "management-key-example",
        }),
      ).rejects.toMatchObject({ statusCode: status, code })
    },
  )

  it.each([
    {
      name: "a malformed envelope",
      body: { data: [], total_count: 0 },
    },
    {
      name: "a blank model identity",
      body: {
        data: [{ id: "   " }],
        total_count: 1,
        links: { next: null },
      },
    },
    {
      name: "an external next page",
      body: {
        data: [{ id: "example/model-alpha" }],
        total_count: 2,
        links: {
          next: "https://catalog.example.invalid/models/user?offset=1&limit=1",
        },
      },
    },
  ])("rejects $name", async ({ body }) => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models/user`, () =>
        HttpResponse.json(body),
      ),
    )

    await expect(
      fetchOpenRouterPersonalizedModelCatalog({
        accountId: "account-example-a",
        managementKey: "management-key-example",
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.JSON_PARSE_ERROR })
  })

  it("propagates caller cancellation without starting another request", async () => {
    const abortController = new AbortController()
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementationOnce(
      (_input, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          )
        }),
    )

    try {
      const request = fetchOpenRouterPersonalizedModelCatalog({
        accountId: "account-example-a",
        managementKey: "management-key-example",
        abortSignal: abortController.signal,
      })
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
      const reason = new DOMException("Cancelled", "AbortError")
      abortController.abort(reason)

      await expect(request).rejects.toBe(reason)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
