import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { fetchAnthropicModelIds } from "~/services/aiApi/anthropic"
import { fetchGoogleModelIds } from "~/services/aiApi/google"
import { server } from "~~/tests/msw/server"

describe("AI API model fetcher HTTP routing", () => {
  it("queries Claude models below the Volcengine Ark Anthropic-compatible prefix", async () => {
    const hit = vi.fn()
    server.use(
      http.get(
        "https://volcengine-anthropic.example.invalid/api/compatible/v1/models",
        ({ request }) => {
          hit()
          const url = new URL(request.url)
          expect(url.searchParams.get("limit")).toBe("200")
          expect(request.headers.get("x-api-key")).toBe("sk-synthetic")
          expect(request.headers.get("anthropic-version")).toBe("2023-06-01")
          return HttpResponse.json({
            data: [{ id: "claude-test" }],
            has_more: false,
          })
        },
      ),
    )

    await expect(
      fetchAnthropicModelIds({
        baseUrl: "https://volcengine-anthropic.example.invalid/api/compatible",
        apiKey: "sk-synthetic",
      }),
    ).resolves.toEqual(["claude-test"])
    expect(hit).toHaveBeenCalledOnce()
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
        baseUrl: "https://google-compatible.example.invalid/proxy",
        apiKey: "AIza-synthetic",
      }),
    ).resolves.toEqual(["gemini-test"])
    expect(hit).toHaveBeenCalledOnce()
  })
})
