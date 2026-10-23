import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { runApiVerificationProbe } from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const params = {
  baseUrl: "https://native-video.example.com",
  apiKey: "google-video-secret",
  apiType: "google",
  modelId: "veo-2.0-generate-001",
  probeId: "video-generation",
} as const

describe("Google SDK video generation verification", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts once, polls through the SDK, and returns the playable video URL", async () => {
    vi.useFakeTimers()
    const requests: Array<{
      method: string
      url: string
      headers: Headers
      body?: unknown
    }> = []
    let statusCalls = 0
    server.use(
      http.all("https://native-video.example.com/*", async ({ request }) => {
        requests.push({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body: request.method === "POST" ? await request.json() : undefined,
        })
        if (request.method === "POST")
          return HttpResponse.json({ name: "operations/video-1" })
        statusCalls += 1
        return HttpResponse.json(
          statusCalls === 1
            ? { name: "operations/video-1", done: false }
            : {
                name: "operations/video-1",
                done: true,
                response: {
                  generateVideoResponse: {
                    generatedSamples: [
                      {
                        video: {
                          uri: "https://native-video.example.com/v1beta/files/video.mp4?alt=media",
                        },
                      },
                    ],
                  },
                },
              },
        )
      }),
    )

    const pending = runApiVerificationProbe(params)
    await vi.advanceTimersByTimeAsync(2000)
    const result = await pending

    expect(result).toMatchObject({
      status: "pass",
      media: {
        type: "video",
        url: "https://native-video.example.com/v1beta/files/video.mp4?alt=media&key=google-video-secret",
        credentialed: true,
      },
      output: {
        taskId: "operations/video-1",
        status: "completed",
        url: "https://native-video.example.com/v1beta/files/video.mp4?alt=media",
      },
    })
    expect(
      requests.map(({ method, url }) => [method, new URL(url).pathname]),
    ).toEqual([
      ["POST", "/v1beta/models/veo-2.0-generate-001:predictLongRunning"],
      ["GET", "/v1beta/operations/video-1"],
      ["GET", "/v1beta/operations/video-1"],
    ])
    const startRequest = atIndex(requests, 0)
    expect(startRequest.body).toMatchObject({
      instances: [{ prompt: expect.any(String) }],
      parameters: { sampleCount: 1 },
    })
    expect(startRequest.headers.get("x-goog-api-key")).toBe(params.apiKey)
    expect(startRequest.headers.get("authorization")).toBeNull()
  })

  it("reports a failed Google video operation without claiming success", async () => {
    server.use(
      http.post("https://native-video.example.com/*", () =>
        HttpResponse.json({ name: "operations/video-failed" }),
      ),
      http.get("https://native-video.example.com/*", () =>
        HttpResponse.json({
          name: "operations/video-failed",
          done: true,
          error: { message: "Generation rejected" },
        }),
      ),
    )

    await expect(runApiVerificationProbe(params)).resolves.toMatchObject({
      status: "fail",
      output: { taskId: "operations/video-failed", status: "error" },
    })
  })

  it("stops SDK status polling when the user cancels", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const requests: string[] = []
    server.use(
      http.post("https://native-video.example.com/*", () =>
        HttpResponse.json({ name: "operations/video-cancelled" }),
      ),
      http.get("https://native-video.example.com/*", ({ request }) => {
        requests.push(request.url)
        queueMicrotask(() => controller.abort())
        return HttpResponse.json({
          name: "operations/video-cancelled",
          done: false,
        })
      }),
    )

    const pending = runApiVerificationProbe({
      ...params,
      abortSignal: controller.signal,
    })

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(requests).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
