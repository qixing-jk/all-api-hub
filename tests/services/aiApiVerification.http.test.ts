import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { runApiVerificationProbe } from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"

function anthropicEventStream(events: unknown[]) {
  return new HttpResponse(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  )
}

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
    const authHeaders: Array<{
      authorization: string | null
      apiKey: string | null
    }> = []
    server.use(
      http.post(
        "https://ark.cn-beijing.volces.com/api/compatible/v1/messages",
        ({ request }) => {
          authHeaders.push({
            authorization: request.headers.get("authorization"),
            apiKey: request.headers.get("x-api-key"),
          })
          if (!request.headers.has("authorization")) {
            return HttpResponse.json(
              { error: { message: "use bearer authentication" } },
              { status: 401 },
            )
          }
          return HttpResponse.json(
            { error: { message: "synthetic rejection" } },
            { status: 400 },
          )
        },
      ),
    )

    await runApiVerificationProbe({
      baseUrl: "https://ark.cn-beijing.volces.com/api/compatible",
      apiKey: "sk-synthetic",
      apiType: "anthropic",
      modelId: "claude-test",
      probeId: "text-generation",
    })

    await runApiVerificationProbe({
      baseUrl: "https://ark.cn-beijing.volces.com/api/compatible",
      apiKey: "sk-synthetic",
      apiType: "anthropic",
      modelId: "claude-test",
      probeId: "text-generation",
    })

    expect(authHeaders).toEqual([
      { authorization: null, apiKey: "sk-synthetic" },
      { authorization: "Bearer sk-synthetic", apiKey: null },
      { authorization: "Bearer sk-synthetic", apiKey: null },
    ])
  })

  it("does not replay non-401 Anthropic failures with another credential", async () => {
    const authHeaders: Array<{
      authorization: string | null
      apiKey: string | null
    }> = []
    server.use(
      http.post(
        "https://anthropic-compatible.example.invalid/v1/messages",
        ({ request }) => {
          authHeaders.push({
            authorization: request.headers.get("authorization"),
            apiKey: request.headers.get("x-api-key"),
          })
          return HttpResponse.json(
            { error: { message: "synthetic rejection" } },
            { status: 403 },
          )
        },
      ),
    )

    await runApiVerificationProbe({
      baseUrl: "https://anthropic-compatible.example.invalid",
      apiKey: "sk-synthetic",
      apiType: "anthropic",
      modelId: "claude-test",
      probeId: "text-generation",
    })

    expect(authHeaders).toEqual([
      { authorization: null, apiKey: "sk-synthetic" },
    ])
  })

  it("uses Anthropic streaming for text responses with unsigned thinking blocks", async () => {
    let requestBody: unknown
    server.use(
      http.post(
        "https://anthropic-stream.example.invalid/v1/messages",
        async ({ request }) => {
          requestBody = await request.json()
          return anthropicEventStream([
            {
              type: "message_start",
              message: {
                id: "msg-test",
                type: "message",
                role: "assistant",
                model: "deepseek-test",
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 88, output_tokens: 0 },
              },
            },
            {
              type: "content_block_start",
              index: 0,
              content_block: { type: "thinking", thinking: "" },
            },
            {
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "thinking_delta",
                thinking: "Reply exactly OK.",
              },
            },
            { type: "content_block_stop", index: 0 },
            {
              type: "content_block_start",
              index: 1,
              content_block: { type: "text", text: "" },
            },
            {
              type: "content_block_delta",
              index: 1,
              delta: { type: "text_delta", text: "OK" },
            },
            { type: "content_block_stop", index: 1 },
            {
              type: "message_delta",
              delta: { stop_reason: "end_turn", stop_sequence: null },
              usage: { output_tokens: 16 },
            },
            { type: "message_stop" },
          ])
        },
      ),
    )

    await expect(
      runApiVerificationProbe({
        baseUrl: "https://anthropic-stream.example.invalid",
        apiKey: "sk-synthetic",
        apiType: "anthropic",
        modelId: "deepseek-test",
        probeId: "text-generation",
      }),
    ).resolves.toMatchObject({
      id: "text-generation",
      status: "pass",
      output: { text: "OK" },
    })
    expect(requestBody).toMatchObject({ stream: true })
  })

  it("uses Anthropic streaming for tool calls with unsigned thinking blocks", async () => {
    let requestBody: unknown
    server.use(
      http.post(
        "https://anthropic-tool-stream.example.invalid/v1/messages",
        async ({ request }) => {
          requestBody = await request.json()
          return anthropicEventStream([
            {
              type: "message_start",
              message: {
                id: "msg-tool-test",
                type: "message",
                role: "assistant",
                model: "deepseek-test",
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 354, output_tokens: 0 },
              },
            },
            {
              type: "content_block_start",
              index: 0,
              content_block: { type: "thinking", thinking: "" },
            },
            {
              type: "content_block_delta",
              index: 0,
              delta: {
                type: "thinking_delta",
                thinking: "Call the tool once.",
              },
            },
            { type: "content_block_stop", index: 0 },
            {
              type: "content_block_start",
              index: 1,
              content_block: {
                type: "tool_use",
                id: "call-test",
                name: "verify_tool",
                input: {},
              },
            },
            { type: "content_block_stop", index: 1 },
            {
              type: "message_delta",
              delta: { stop_reason: "tool_use", stop_sequence: null },
              usage: { output_tokens: 51 },
            },
            { type: "message_stop" },
          ])
        },
      ),
    )

    await expect(
      runApiVerificationProbe({
        baseUrl: "https://anthropic-tool-stream.example.invalid",
        apiKey: "sk-synthetic",
        apiType: "anthropic",
        modelId: "deepseek-test",
        probeId: "tool-calling",
      }),
    ).resolves.toMatchObject({
      id: "tool-calling",
      status: "pass",
      output: {
        toolCalls: [expect.objectContaining({ toolName: "verify_tool" })],
      },
    })
    expect(requestBody).toMatchObject({ stream: true })
  })
})
