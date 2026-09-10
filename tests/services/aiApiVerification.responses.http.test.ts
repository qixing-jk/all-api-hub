import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { runApiVerificationProbe } from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"

function textResponse(text: string) {
  return {
    id: "resp-test",
    object: "response",
    created_at: 0,
    model: "gpt-test",
    status: "completed",
    output: [
      {
        id: "msg-test",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  }
}

function textResponseEvents(text: string) {
  const response = textResponse(text)
  const message = response.output[0]
  return [
    {
      type: "response.created",
      response: { ...response, status: "in_progress", output: [], usage: null },
    },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { ...message, status: "in_progress", content: [] },
    },
    {
      type: "response.output_text.delta",
      item_id: message.id,
      output_index: 0,
      content_index: 0,
      delta: text,
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: message,
    },
    { type: "response.completed", response },
  ]
}

function responsesEventStream(events: unknown[]) {
  return new HttpResponse(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  )
}

function requireStreamingResponses(events: unknown[]) {
  const requestBodies: Record<string, unknown>[] = []
  server.use(
    http.post(
      "https://responses-stream.example.invalid/v1/responses",
      async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        requestBodies.push(body)
        if (body.stream !== true) {
          return HttpResponse.json(
            { error: { message: "Stream must be set to true" } },
            { status: 400 },
          )
        }
        return responsesEventStream(events)
      },
    ),
  )
  return requestBodies
}

describe("OpenAI Responses verification HTTP behavior", () => {
  it("keeps successful non-streaming requests to one attempt", async () => {
    const requestBodies: unknown[] = []
    server.use(
      http.post(
        "https://responses-stream.example.invalid/v1/responses",
        async ({ request }) => {
          const body = (await request.json()) as { stream?: boolean }
          requestBodies.push(body)
          if (body.stream === true) {
            return HttpResponse.json(
              { error: { message: "Streaming is not supported" } },
              { status: 400 },
            )
          }
          return HttpResponse.json(textResponse("OK"))
        },
      ),
    )

    const result = await runApiVerificationProbe({
      baseUrl: "https://responses-stream.example.invalid",
      apiKey: "sk-synthetic",
      apiType: "openai",
      modelId: "gpt-test",
      probeId: "text-generation",
      mode: "non-streaming",
    })

    expect(result, result.summary).toMatchObject({
      status: "pass",
      output: { text: "OK" },
    })
    expect(requestBodies).toHaveLength(1)
    expect(requestBodies[0]).not.toHaveProperty("stream", true)
  })

  it.each([
    {
      probeId: "text-generation",
      text: "OK",
      output: { text: "OK" },
    },
    {
      probeId: "structured-output",
      text: '{"ok":true}',
      output: { output: { ok: true } },
    },
  ] as const)(
    "verifies streamed $probeId output directly",
    async ({ probeId, text, output }) => {
      const requestBodies = requireStreamingResponses(textResponseEvents(text))

      const result = await runApiVerificationProbe({
        baseUrl: "https://responses-stream.example.invalid",
        apiKey: "sk-synthetic",
        apiType: "openai",
        modelId: "gpt-test",
        probeId,
      })

      expect(result, result.summary).toMatchObject({
        id: probeId,
        status: "pass",
        output,
      })
      expect(requestBodies).toHaveLength(1)
      expect(requestBodies[0]).toHaveProperty("stream", true)
    },
  )

  it("executes tool calls returned by a streaming test", async () => {
    const toolCall = {
      type: "function_call",
      id: "fc-test",
      call_id: "call-test",
      name: "verify_tool",
      arguments: "{}",
      status: "completed",
    }
    const response = { ...textResponse(""), output: [toolCall] }
    const requestBodies = requireStreamingResponses([
      {
        type: "response.created",
        response: {
          ...response,
          status: "in_progress",
          output: [],
          usage: null,
        },
      },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...toolCall, status: "in_progress", arguments: "" },
      },
      {
        type: "response.function_call_arguments.delta",
        item_id: toolCall.id,
        output_index: 0,
        delta: "{}",
      },
      { type: "response.output_item.done", output_index: 0, item: toolCall },
      { type: "response.completed", response },
    ])

    const result = await runApiVerificationProbe({
      baseUrl: "https://responses-stream.example.invalid",
      apiKey: "sk-synthetic",
      apiType: "openai",
      modelId: "gpt-test",
      probeId: "tool-calling",
    })

    expect(result, result.summary).toMatchObject({
      status: "pass",
      output: {
        toolCalls: [{ toolName: "verify_tool", input: {} }],
        toolResults: [
          { toolName: "verify_tool", output: { now: expect.any(String) } },
        ],
      },
    })
    expect(requestBodies).toHaveLength(1)
    expect(requestBodies[0]).toHaveProperty("stream", true)
  })

  it.each([
    { status: 400, message: "Unknown model" },
    { status: 422, message: "stream must be set to false" },
    { status: 401, message: "Stream must be set to true" },
    { status: 403, message: "Stream must be set to true" },
    { status: 429, message: "Stream must be set to true" },
    { status: 500, message: "Stream must be set to true" },
  ])(
    "does not change response mode for $status: $message",
    async ({ status, message }) => {
      const requestBodies: Record<string, unknown>[] = []
      server.use(
        http.post(
          "https://responses-stream.example.invalid/v1/responses",
          async ({ request }) => {
            requestBodies.push(
              (await request.json()) as Record<string, unknown>,
            )
            return HttpResponse.json(
              { error: { message } },
              { status, headers: { "Retry-After": "0" } },
            )
          },
        ),
      )

      const result = await runApiVerificationProbe({
        baseUrl: "https://responses-stream.example.invalid",
        apiKey: "sk-synthetic",
        apiType: "openai",
        modelId: "gpt-test",
        probeId: "text-generation",
      })

      expect(result.status).toBe("fail")
      expect(requestBodies.length).toBeGreaterThan(0)
      for (const body of requestBodies) {
        expect(body).toHaveProperty("stream", true)
      }
    },
  )

  it("preserves sources returned by a streaming web-search test", async () => {
    const textEvents = textResponseEvents("AI SDK news")
    const requestBodies = requireStreamingResponses([
      ...textEvents.slice(0, -2),
      {
        type: "response.output_text.annotation.added",
        item_id: "msg-test",
        output_index: 0,
        content_index: 0,
        annotation_index: 0,
        annotation: {
          type: "url_citation",
          start_index: 0,
          end_index: 11,
          url: "https://news.example.invalid/ai-sdk",
          title: "AI SDK news",
        },
      },
      ...textEvents.slice(-2),
    ])

    const result = await runApiVerificationProbe({
      baseUrl: "https://responses-stream.example.invalid",
      apiKey: "sk-synthetic",
      apiType: "openai",
      modelId: "gpt-test",
      probeId: "web-search",
    })

    expect(result, result.summary).toMatchObject({
      status: "pass",
      output: {
        sourcesCount: 1,
        sourcesPreview: [
          {
            sourceType: "url",
            url: "https://news.example.invalid/ai-sdk",
            title: "AI SDK news",
          },
        ],
      },
    })
    expect(requestBodies).toHaveLength(1)
    expect(requestBodies[0]).toHaveProperty("stream", true)
  })

  it("preserves the upstream failure when a streaming test is rejected", async () => {
    const requestBodies: unknown[] = []
    server.use(
      http.post(
        "https://responses-stream.example.invalid/v1/responses",
        async ({ request }) => {
          const body = (await request.json()) as { stream?: boolean }
          requestBodies.push(body)
          return HttpResponse.json(
            {
              error: {
                message: body.stream
                  ? "Access denied sk-synthetic"
                  : "Stream must be set to true",
              },
            },
            { status: body.stream ? 403 : 400 },
          )
        },
      ),
    )

    const result = await runApiVerificationProbe({
      baseUrl: "https://responses-stream.example.invalid",
      apiKey: "sk-synthetic",
      apiType: "openai",
      modelId: "gpt-test",
      probeId: "text-generation",
    })

    expect(result).toMatchObject({
      status: "fail",
      summaryKey: "verifyDialog.summaries.forbidden",
      output: { inferredHttpStatus: 403 },
    })
    expect(result.summary).toContain("Access denied")
    expect(result.summary).not.toContain("sk-synthetic")
    expect(requestBodies).toHaveLength(1)
  })

  it("rejects partial output without replaying an errored stream", async () => {
    const requestBodies = requireStreamingResponses([
      ...textResponseEvents("OK").slice(0, -2),
      {
        type: "error",
        sequence_number: 4,
        error: {
          type: "server_error",
          code: "server_error",
          message: "Generation failed sk-synthetic",
        },
      },
    ])

    const result = await runApiVerificationProbe({
      baseUrl: "https://responses-stream.example.invalid",
      apiKey: "sk-synthetic",
      apiType: "openai",
      modelId: "gpt-test",
      probeId: "text-generation",
    })

    expect(result.status).toBe("fail")
    expect(result.summary).not.toContain("sk-synthetic")
    expect(requestBodies).toHaveLength(1)
  })
})
