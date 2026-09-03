import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import { fetchOpenRouterPublicModelCatalog } from "~/services/apiService/openrouter/publicModelCatalog"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { server } from "~~/tests/msw/server"

describe("OpenRouter public model catalog transport", () => {
  beforeEach(() => server.resetHandlers())

  it("requests every output modality from the canonical public endpoint without authorization", async () => {
    let capturedRequest: Request | undefined
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, ({ request }) => {
        capturedRequest = request
        return HttpResponse.json({
          data: [
            {
              id: "example/model-alpha",
              name: "Model Alpha",
              future_field: "ignored by callers",
            },
          ],
          total_count: 1,
          links: { next: null },
        })
      }),
    )

    await expect(fetchOpenRouterPublicModelCatalog()).resolves.toEqual([
      expect.objectContaining({
        id: "example/model-alpha",
        name: "Model Alpha",
        future_field: "ignored by callers",
      }),
    ])
    expect(capturedRequest?.url).toBe(
      `${OPENROUTER_API_BASE_URL}/models?output_modalities=all`,
    )
    expect(capturedRequest?.headers.has("authorization")).toBe(false)
  })

  it("follows canonical pagination and de-duplicates model ids in first-seen order", async () => {
    const requestedUrls: string[] = []
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, ({ request }) => {
        requestedUrls.push(request.url)
        const offset = new URL(request.url).searchParams.get("offset")

        if (offset === "2") {
          return HttpResponse.json({
            data: [
              { id: "example/model-beta", name: "Duplicate Beta" },
              { id: "example/model-gamma", name: "Model Gamma" },
            ],
            total_count: 3,
            links: { next: null },
          })
        }

        return HttpResponse.json({
          data: [
            { id: "example/model-alpha", name: "Model Alpha" },
            { id: "example/model-beta", name: "Model Beta" },
          ],
          total_count: 3,
          links: {
            next: `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&offset=2`,
          },
        })
      }),
    )

    const models = await fetchOpenRouterPublicModelCatalog()

    expect(models.map((model) => [model.id, model.name])).toEqual([
      ["example/model-alpha", "Model Alpha"],
      ["example/model-beta", "Model Beta"],
      ["example/model-gamma", "Model Gamma"],
    ])
    expect(requestedUrls).toEqual([
      `${OPENROUTER_API_BASE_URL}/models?output_modalities=all`,
      `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&offset=2`,
    ])
  })

  it.each([
    {
      name: "a malformed envelope",
      body: { data: [], total_count: 0 },
    },
    {
      name: "an explicitly unsuccessful envelope",
      body: {
        success: false,
        data: [],
        total_count: 0,
        links: { next: null },
      },
    },
    {
      name: "a blank model id",
      body: {
        data: [{ id: "   " }],
        total_count: 1,
        links: { next: null },
      },
    },
  ])("rejects $name", async ({ body }) => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json(body),
      ),
    )

    await expect(fetchOpenRouterPublicModelCatalog()).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
  })

  it.each([
    {
      name: "a malformed next link",
      next: "not a valid URL",
    },
    {
      name: "an external next link",
      next: "https://catalog.example.invalid/models?output_modalities=all&offset=1",
    },
    {
      name: "a next link without a progress marker",
      next: `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&cursor=next`,
    },
    {
      name: "a non-progressing offset",
      next: `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&offset=0`,
    },
  ])("rejects $name", async ({ next }) => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json({
          data: [{ id: "example/model-alpha" }],
          total_count: 2,
          links: { next },
        }),
      ),
    )

    await expect(fetchOpenRouterPublicModelCatalog()).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
  })

  it.each([
    { status: 401, code: API_ERROR_CODES.HTTP_401 },
    { status: 403, code: API_ERROR_CODES.HTTP_403 },
    { status: 429, code: API_ERROR_CODES.HTTP_429 },
    { status: 500, code: API_ERROR_CODES.HTTP_OTHER },
  ])("classifies HTTP $status failures", async ({ status, code }) => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json({}, { status }),
      ),
    )

    await expect(fetchOpenRouterPublicModelCatalog()).rejects.toMatchObject({
      statusCode: status,
      code,
    })
  })

  it("preserves documented OpenRouter error details for catalog failures", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json(
          { error: { code: 429, message: "Catalog rate limit reached" } },
          { status: 429 },
        ),
      ),
    )

    await expect(fetchOpenRouterPublicModelCatalog()).rejects.toMatchObject({
      statusCode: 429,
      code: API_ERROR_CODES.HTTP_429,
      upstreamCode: "429",
      message: "Catalog rate limit reached",
    })
  })

  it("rejects cyclic pagination", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, ({ request }) => {
        const offset = new URL(request.url).searchParams.get("offset")
        return HttpResponse.json({
          data: [
            {
              id: offset === "1" ? "example/model-beta" : "example/model-alpha",
            },
          ],
          total_count: 3,
          links: {
            next: `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&offset=1`,
          },
        })
      }),
    )

    await expect(fetchOpenRouterPublicModelCatalog()).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
  })

  it("rejects pagination cycles that alternate progress markers", async () => {
    const requestedUrls: string[] = []
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, ({ request }) => {
        requestedUrls.push(request.url)
        const url = new URL(request.url)
        const offset = url.searchParams.get("offset")
        const page = url.searchParams.get("page")

        if (offset === "1") {
          return HttpResponse.json({
            data: [{ id: "example/model-beta" }],
            total_count: 4,
            links: {
              next: `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&page=1`,
            },
          })
        }
        if (page === "1") {
          return HttpResponse.json({
            data: [{ id: "example/model-gamma" }],
            total_count: 4,
            links: {
              next: `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&offset=1`,
            },
          })
        }

        return HttpResponse.json({
          data: [{ id: "example/model-alpha" }],
          total_count: 4,
          links: {
            next: `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&offset=1`,
          },
        })
      }),
    )

    await expect(fetchOpenRouterPublicModelCatalog()).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
    expect(requestedUrls).toHaveLength(3)
  })

  it("rejects a page that adds no model identities before another page", async () => {
    const requestedOffsets: Array<string | null> = []
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, ({ request }) => {
        const offset = new URL(request.url).searchParams.get("offset")
        requestedOffsets.push(offset)

        if (offset === "1") {
          return HttpResponse.json({
            data: [{ id: "example/model-alpha" }],
            total_count: 3,
            links: {
              next: `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&offset=2`,
            },
          })
        }
        if (offset === "2") {
          return HttpResponse.json({
            data: [{ id: "example/model-beta" }, { id: "example/model-gamma" }],
            total_count: 3,
            links: { next: null },
          })
        }

        return HttpResponse.json({
          data: [{ id: "example/model-alpha" }],
          total_count: 3,
          links: {
            next: `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&offset=1`,
          },
        })
      }),
    )

    await expect(fetchOpenRouterPublicModelCatalog()).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
    expect(requestedOffsets).toEqual([null, "1"])
  })

  it("rejects incomplete final totals", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, () =>
        HttpResponse.json({
          data: [{ id: "example/model-alpha" }],
          total_count: 2,
          links: { next: null },
        }),
      ),
    )

    await expect(fetchOpenRouterPublicModelCatalog()).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
  })

  it("rejects inconsistent totals across pages", async () => {
    server.use(
      http.get(`${OPENROUTER_API_BASE_URL}/models`, ({ request }) => {
        const offset = new URL(request.url).searchParams.get("offset")

        return HttpResponse.json(
          offset === "1"
            ? {
                data: [{ id: "example/model-beta" }],
                total_count: 3,
                links: { next: null },
              }
            : {
                data: [{ id: "example/model-alpha" }],
                total_count: 2,
                links: {
                  next: `${OPENROUTER_API_BASE_URL}/models?output_modalities=all&offset=1`,
                },
              },
        )
      }),
    )

    await expect(fetchOpenRouterPublicModelCatalog()).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
  })

  it("propagates caller cancellation to the active request", async () => {
    const abortController = new AbortController()
    let receivedSignal: AbortSignal | null | undefined
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce((_input, options) => {
        receivedSignal = options?.signal

        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          )
        })
      })

    try {
      const request = fetchOpenRouterPublicModelCatalog(abortController.signal)
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
      const reason = new DOMException("Cancelled", "AbortError")
      abortController.abort(reason)

      await expect(request).rejects.toBe(reason)
      expect(receivedSignal).toBe(abortController.signal)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
