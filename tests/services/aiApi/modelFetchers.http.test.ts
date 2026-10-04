import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { fetchAnthropicModelIds } from "~/services/aiApi/anthropic"
import { fetchGoogleModelIds } from "~/services/aiApi/google"
import { server } from "~~/tests/msw/server"

describe("AI API model fetcher HTTP routing", () => {
  it("applies credential headers on every Anthropic page and the Bearer retry", async () => {
    const hits: Array<{ client: string | null; page: string | null }> = []
    server.use(
      http.get(
        "https://header-anthropic.example.invalid/v1/models",
        ({ request }) => {
          hits.push({
            client: request.headers.get("x-client"),
            page: new URL(request.url).searchParams.get("after_id"),
          })
          if (!request.headers.has("authorization"))
            return HttpResponse.json(
              { error: { message: "use bearer" } },
              { status: 401 },
            )
          if (!new URL(request.url).searchParams.has("after_id"))
            return HttpResponse.json({
              data: [{ id: "first" }],
              has_more: true,
              last_id: "first",
            })
          return HttpResponse.json({
            data: [{ id: "second" }],
            has_more: false,
          })
        },
      ),
    )
    await expect(
      fetchAnthropicModelIds({
        baseUrl: "https://header-anthropic.example.invalid",
        apiKey: "key",
        requestHeaders: { "x-client": "credential" },
      }),
    ).resolves.toEqual(["first", "second"])
    expect(hits).toEqual([
      { client: "credential", page: null },
      { client: "credential", page: null },
      { client: "credential", page: "first" },
    ])
  })
  it("uses a complete Anthropic mount without repeating v1", async () => {
    const hit = vi.fn()
    server.use(
      http.get(
        "https://anthropic-compatible.example.invalid/proxy/v1/models",
        () => {
          hit()
          return HttpResponse.json({
            data: [{ id: "claude-test" }],
            has_more: false,
          })
        },
      ),
    )
    await expect(
      fetchAnthropicModelIds({
        baseUrl: "https://anthropic-compatible.example.invalid/proxy/v1",
        apiKey: "sk-synthetic",
      }),
    ).resolves.toEqual(["claude-test"])
    expect(hit).toHaveBeenCalledOnce()
  })

  it("uses a complete Gemini mount without repeating v1beta", async () => {
    const hit = vi.fn()
    server.use(
      http.get(
        "https://google-compatible.example.invalid/proxy/v1beta/models",
        () => {
          hit()
          return HttpResponse.json({ models: [{ name: "models/gemini-test" }] })
        },
      ),
    )
    await expect(
      fetchGoogleModelIds({
        baseUrl: "https://google-compatible.example.invalid/proxy/v1beta",
        apiKey: "AIza-synthetic",
      }),
    ).resolves.toEqual(["gemini-test"])
    expect(hit).toHaveBeenCalledOnce()
  })

  it("negotiates auth without changing the configured model-list path", async () => {
    const authHeaders: Array<{
      authorization: string | null
      apiKey: string | null
    }> = []
    server.use(
      http.get(
        "https://anthropic-compatible.example.invalid/proxy/v1/models",
        ({ request }) => {
          authHeaders.push({
            authorization: request.headers.get("authorization"),
            apiKey: request.headers.get("x-api-key"),
          })
          const url = new URL(request.url)
          expect(url.searchParams.get("limit")).toBe("200")
          expect(request.headers.get("anthropic-version")).toBe("2023-06-01")
          if (!request.headers.has("authorization")) {
            return HttpResponse.json(
              { error: { message: "use bearer authentication" } },
              { status: 401 },
            )
          }
          return HttpResponse.json({
            data: [{ id: "claude-test" }],
            has_more: false,
          })
        },
      ),
    )

    await expect(
      fetchAnthropicModelIds({
        baseUrl: "https://anthropic-compatible.example.invalid/proxy/v1",
        apiKey: "sk-synthetic",
      }),
    ).resolves.toEqual(["claude-test"])
    expect(authHeaders).toEqual([
      { authorization: null, apiKey: "sk-synthetic" },
      { authorization: "Bearer sk-synthetic", apiKey: null },
    ])
  })

  it("keeps Gemini model discovery on its native Google-compatible path", async () => {
    const hit = vi.fn()
    server.use(
      http.get(
        "https://google-compatible.example.invalid/proxy/v1beta/models",
        ({ request }) => {
          hit()
          expect(request.headers.get("x-goog-api-key")).toBe("AIza-synthetic")
          return HttpResponse.json({
            models: [{ name: "models/gemini-test" }],
          })
        },
      ),
    )

    await expect(
      fetchGoogleModelIds({
        baseUrl: "https://google-compatible.example.invalid/proxy/v1beta",
        apiKey: "AIza-synthetic",
      }),
    ).resolves.toEqual(["gemini-test"])
    expect(hit).toHaveBeenCalledOnce()
  })

  it("negotiates Bearer auth for a Gemini-compatible model endpoint", async () => {
    const authHeaders: Array<{
      authorization: string | null
      apiKey: string | null
    }> = []
    server.use(
      http.get(
        "https://bearer-google.example.invalid/proxy/v1beta/models",
        ({ request }) => {
          authHeaders.push({
            authorization: request.headers.get("authorization"),
            apiKey: request.headers.get("x-goog-api-key"),
          })
          if (!request.headers.has("authorization")) {
            return HttpResponse.json(
              { error: { message: "use bearer authentication" } },
              { status: 401 },
            )
          }
          return HttpResponse.json({
            models: [{ name: "models/gemini-test" }],
          })
        },
      ),
    )

    await expect(
      fetchGoogleModelIds({
        baseUrl: "https://bearer-google.example.invalid/proxy/v1beta",
        apiKey: "synthetic-google-key",
      }),
    ).resolves.toEqual(["gemini-test"])
    expect(authHeaders).toEqual([
      { authorization: null, apiKey: "synthetic-google-key" },
      { authorization: "Bearer synthetic-google-key", apiKey: null },
    ])
  })
})
