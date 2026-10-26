import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { runApiVerificationProbe } from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://prompt-override.example.invalid"

const readPrompt = async (request: Request) => {
  const body = (await request.json()) as {
    messages?: Array<{ role: string; content: unknown }>
  }
  const lastUser = [...(body.messages ?? [])]
    .reverse()
    .find((message) => message.role === "user")
  return typeof lastUser?.content === "string" ? lastUser.content : ""
}

const completion = (text: string) =>
  HttpResponse.json({
    id: "chatcmpl-prompt",
    object: "chat.completion",
    created: 0,
    model: "prompt-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
  })

describe("probe prompt overrides", () => {
  it("sends the default prompt when no override is given", async () => {
    const prompts: string[] = []
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, async ({ request }) => {
        prompts.push(await readPrompt(request))
        return completion("OK")
      }),
    )

    const result = await runApiVerificationProbe({
      baseUrl,
      apiKey: "test",
      apiType: "openai-compatible",
      modelId: "prompt-model",
      mode: "non-streaming",
      probeId: "text-generation",
    })

    expect(result.status).toBe("pass")
    expect(prompts).toEqual(["Reply with exactly: OK"])
  })

  it("sends the user's override instead of the default", async () => {
    const prompts: string[] = []
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, async ({ request }) => {
        prompts.push(await readPrompt(request))
        return completion("OK")
      }),
    )

    await runApiVerificationProbe({
      baseUrl,
      apiKey: "test",
      apiType: "openai-compatible",
      modelId: "prompt-model",
      mode: "non-streaming",
      probeId: "text-generation",
      probePromptOverrides: {
        "text-generation": "Answer with OK only.",
      },
    })

    expect(prompts).toEqual(["Answer with OK only."])
  })

  it("falls back to the default when the override is blank", async () => {
    const prompts: string[] = []
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, async ({ request }) => {
        prompts.push(await readPrompt(request))
        return completion("OK")
      }),
    )

    await runApiVerificationProbe({
      baseUrl,
      apiKey: "test",
      apiType: "openai-compatible",
      modelId: "prompt-model",
      mode: "non-streaming",
      probeId: "text-generation",
      probePromptOverrides: { "text-generation": "   " },
    })

    expect(prompts).toEqual(["Reply with exactly: OK"])
  })

  it("records the sent prompt in the probe diagnostics", async () => {
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, () => completion("OK")),
    )

    const result = await runApiVerificationProbe({
      baseUrl,
      apiKey: "test",
      apiType: "openai-compatible",
      modelId: "prompt-model",
      mode: "non-streaming",
      probeId: "text-generation",
      probePromptOverrides: { "text-generation": "Say OK." },
    })

    expect(result.input).toMatchObject({ prompt: "Say OK." })
  })
})
