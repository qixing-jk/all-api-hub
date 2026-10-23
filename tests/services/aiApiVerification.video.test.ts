import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runApiVerificationProbe } from "~/services/verification/aiApiVerification"

const params = {
  probeId: "video-generation",
  apiType: "openai-compatible",
  baseUrl: "https://video.example.com",
  apiKey: "sk-test",
  modelId: "video-model",
} as const
const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

describe("video result polling", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("polls queued tasks and creates only one generation", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(() =>
        json({ task_id: "task/1", status: "queued" }),
      )
      .mockImplementationOnce(() =>
        json({ task_id: "task/1", status: "in_progress" }),
      )
      .mockImplementationOnce(() =>
        json({
          data: {
            task_id: "task/1",
            status: "completed",
            url: "https://cdn.example.com/video.mp4",
          },
        }),
      )
    const pending = runApiVerificationProbe(params)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await pending).toMatchObject({
      status: "pass",
      media: { type: "video", url: "https://cdn.example.com/video.mp4" },
    })
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["https://video.example.com/v1/video/generations", "POST"],
      ["https://video.example.com/v1/video/generations/task%2F1", "GET"],
      ["https://video.example.com/v1/video/generations/task%2F1", "GET"],
    ])
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    [
      { status: "failed", error: { message: "Render failed" } },
      "videoUnexpectedResponse",
    ],
    [{ status: "completed" }, "videoNoPlayableResult"],
    [
      { status: "completed", url: "javascript:alert(1)" },
      "videoNoPlayableResult",
    ],
  ])(
    "does not pass unsuccessful or unplayable results: %j",
    async (payload, key) => {
      vi.spyOn(globalThis, "fetch")
        .mockImplementationOnce(() =>
          json({ task_id: "task-1", status: "queued" }),
        )
        .mockImplementationOnce(() => json(payload))
      const result = await runApiVerificationProbe(params)
      expect(result).toMatchObject({
        status: "fail",
        summaryKey: `verifyDialog.summaries.${key}`,
        output: { taskId: "task-1" },
      })
      expect(result.media).toBeUndefined()
    },
  )

  it("bounds waiting and retains the task ID when the server keeps running", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        json({ task_id: "slow-task", status: "queued" }),
      )
    const pending = runApiVerificationProbe(params)
    await vi.advanceTimersByTimeAsync(120_000)
    const result = await pending
    expect(result).toMatchObject({
      status: "fail",
      summaryKey: "verifyDialog.summaries.videoGenerationTimedOut",
      output: { taskId: "slow-task", status: "queued" },
    })
    expect(
      fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("stops waiting and releases timers when the user cancels", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        json({ task_id: "stopped-task", status: "queued" }),
      )
    const controller = new AbortController()
    const pending = runApiVerificationProbe({
      ...params,
      abortSignal: controller.signal,
    })
    const assertion = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await assertion
    expect(vi.getTimerCount()).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
