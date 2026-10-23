import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { runApiVerificationProbe } from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"

describe("verification image transport", () => {
  it.each([false, true])(
    "downloads URL images without forwarding API credentials to a CDN (overrides: %s)",
    async (withOverrides) => {
      let posts = 0
      let downloads = 0
      server.use(
        http.post(
          "https://media.example.com/v1/images/generations",
          ({ request }) => {
            posts++
            expect(request.headers.get("authorization")).toBe(
              withOverrides ? "Bearer custom" : "Bearer sk-test",
            )
            return HttpResponse.json({
              data: [{ url: "https://cdn.example.com/image.png" }],
            })
          },
        ),
        http.get("https://cdn.example.com/image.png", ({ request }) => {
          downloads++
          expect(request.headers.has("authorization")).toBe(false)
          expect(request.headers.has("x-client")).toBe(false)
          return new HttpResponse(
            Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
            {
              headers: { "content-type": "image/png" },
            },
          )
        }),
      )
      const result = await runApiVerificationProbe({
        baseUrl: "https://media.example.com",
        apiKey: "sk-test",
        apiType: "openai-compatible",
        probeId: "image-generation",
        modelId: "image-model",
        ...(withOverrides
          ? {
              requestHeaders: {
                authorization: "Bearer custom",
                "x-client": "private",
              },
            }
          : {}),
      })
      expect(result).toMatchObject({
        status: "pass",
        media: { type: "image", url: "data:image/png;base64,iVBORw0KGgo=" },
      })
      expect(posts).toBe(1)
      expect(downloads).toBe(1)
    },
  )

  it("reports download failure without submitting another paid generation", async () => {
    let posts = 0
    let downloads = 0
    server.use(
      http.post("https://media.example.com/v1/images/generations", () => {
        posts++
        return HttpResponse.json({
          data: [{ url: "https://cdn.example.com/missing.png" }],
        })
      }),
      http.get("https://cdn.example.com/missing.png", () => {
        downloads++
        return new HttpResponse(null, { status: 503 })
      }),
    )
    const result = await runApiVerificationProbe({
      baseUrl: "https://media.example.com",
      apiKey: "sk-test",
      apiType: "openai-compatible",
      probeId: "image-generation",
      modelId: "image-model",
    })
    expect(result.status).toBe("fail")
    expect(result.media).toBeUndefined()
    expect(posts).toBe(1)
    expect(downloads).toBe(1)
  })

  it("keeps credential overrides on same-origin image downloads", async () => {
    server.use(
      http.post("https://media.example.com/v1/images/generations", () =>
        HttpResponse.json({
          data: [{ url: "https://media.example.com/image.png" }],
        }),
      ),
      http.get("https://media.example.com/image.png", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer custom")
        expect(request.headers.get("x-client")).toBe("private")
        return new HttpResponse(
          Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
        )
      }),
    )
    const result = await runApiVerificationProbe({
      baseUrl: "https://media.example.com",
      apiKey: "sk-test",
      apiType: "openai-compatible",
      probeId: "image-generation",
      modelId: "image-model",
      requestHeaders: { authorization: "Bearer custom", "x-client": "private" },
    })
    expect(result.status).toBe("pass")
  })

  it("cancels an image download without resubmitting generation", async () => {
    const controller = new AbortController()
    let posts = 0
    server.use(
      http.post("https://media.example.com/v1/images/generations", () => {
        posts++
        return HttpResponse.json({
          data: [{ url: "https://media.example.com/image.png" }],
        })
      }),
      http.get("https://media.example.com/image.png", () => {
        controller.abort()
        return new HttpResponse(null)
      }),
    )
    await expect(
      runApiVerificationProbe({
        baseUrl: "https://media.example.com",
        apiKey: "sk-test",
        apiType: "openai-compatible",
        probeId: "image-generation",
        modelId: "image-model",
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(posts).toBe(1)
  })

  it.each([
    { url: 123 },
    { url: "javascript:alert(1)" },
    { url: "   " },
    { b64_json: 123 },
    { b64_json: "   " },
    { b64_json: "" },
  ])(
    "rejects unusable image fields without claiming success: %j",
    async (item) => {
      server.use(
        http.post("https://media.example.com/v1/images/generations", () =>
          HttpResponse.json({ data: [item] }),
        ),
      )
      const result = await runApiVerificationProbe({
        baseUrl: "https://media.example.com",
        apiKey: "sk-test",
        apiType: "openai-compatible",
        probeId: "image-generation",
        modelId: "image-model",
      })
      expect(result).toMatchObject({
        status: "fail",
      })
      expect(result.media).toBeUndefined()
    },
  )

  it.each(["openai/gpt-image-1:free", "gpt-image-2", "GPT_IMAGE_1"])(
    "preserves image alias %s without imposing SDK-only response options",
    async (modelId) => {
      let body: unknown
      server.use(
        http.post(
          "https://media.example.com/v1/images/generations",
          async ({ request }) => {
            body = await request.json()
            return HttpResponse.json({ data: [{ b64_json: "iVBORw0KGgo=" }] })
          },
        ),
      )
      const result = await runApiVerificationProbe({
        baseUrl: "https://media.example.com",
        apiKey: "sk-test",
        apiType: "openai",
        probeId: "image-generation",
        modelId,
      })
      expect(body).not.toHaveProperty("response_format")
      expect(result.status).toBe("pass")
    },
  )
  it.each(["dall-e-2", "gpt-image-1", "gpt-image-future"])(
    "accepts URL responses for OpenAI image model %s without imposing response_format",
    async (modelId) => {
      let body: unknown
      let posts = 0
      server.use(
        http.post(
          "https://media.example.com/v1/images/generations",
          async ({ request }) => {
            posts++
            body = await request.json()
            return HttpResponse.json({
              data: [{ url: "https://media.example.com/image.png" }],
            })
          },
        ),
        http.get(
          "https://media.example.com/image.png",
          () =>
            new HttpResponse(
              Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
            ),
        ),
      )
      const result = await runApiVerificationProbe({
        baseUrl: "https://media.example.com",
        apiKey: "sk-test",
        apiType: "openai",
        probeId: "image-generation",
        modelId,
      })
      expect(body).toMatchObject({ model: modelId, n: 1 })
      expect(body).not.toHaveProperty("response_format")
      expect(result).toMatchObject({
        status: "pass",
        media: { type: "image", url: "data:image/png;base64,iVBORw0KGgo=" },
      })
      expect(posts).toBe(1)
    },
  )

  it("accepts base64 responses for standard OpenAI images", async () => {
    let body: unknown
    server.use(
      http.post(
        "https://media.example.com/v1/images/generations",
        async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({ data: [{ b64_json: "iVBORw0KGgo=" }] })
        },
      ),
    )
    const result = await runApiVerificationProbe({
      baseUrl: "https://media.example.com",
      apiKey: "sk-test",
      apiType: "openai",
      probeId: "image-generation",
      modelId: "dall-e-2",
    })
    expect(body).toMatchObject({
      model: "dall-e-2",
      n: 1,
      size: "256x256",
    })
    expect(result).toMatchObject({
      status: "pass",
      media: { type: "image", url: "data:image/png;base64,iVBORw0KGgo=" },
    })
  })
})
