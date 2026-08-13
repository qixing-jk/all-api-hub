import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { runApiVerificationProbe } from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"

describe("AI API verification HTTP routing", () => {
  it("sends Volcengine Ark Coding Plan text generation below its complete OpenAI-compatible prefix", async () => {
    const hit = vi.fn()
    server.use(
      http.post(
        "https://volcengine-coding-plan.example.invalid/api/coding/v3/chat/completions",
        () => {
          hit()
          return HttpResponse.json({
            id: "chatcmpl-test",
            object: "chat.completion",
            created: 0,
            model: "coding-model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "OK" },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          })
        },
      ),
    )

    await expect(
      runApiVerificationProbe({
        baseUrl: "https://volcengine-coding-plan.example.invalid/api/coding/v3",
        apiKey: "sk-synthetic",
        apiType: "openai-compatible",
        modelId: "coding-model",
        probeId: "text-generation",
      }),
    ).resolves.toMatchObject({
      id: "text-generation",
      status: "pass",
    })
    expect(hit).toHaveBeenCalledOnce()
  })

  it("sends Volcengine Ark Anthropic text generation through its compatible prefix", async () => {
    const hit = vi.fn()
    server.use(
      http.post(
        "https://volcengine-anthropic.example.invalid/api/compatible/v1/messages",
        () => {
          hit()
          return HttpResponse.json(
            { error: { message: "synthetic rejection" } },
            { status: 401 },
          )
        },
      ),
    )

    await runApiVerificationProbe({
      baseUrl: "https://volcengine-anthropic.example.invalid/api/compatible",
      apiKey: "sk-synthetic",
      apiType: "anthropic",
      modelId: "claude-test",
      probeId: "text-generation",
    })

    expect(hit).toHaveBeenCalledOnce()
  })
})
