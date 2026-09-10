import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import {
  runApiVerification,
  runApiVerificationProbe,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://verification-modes.example.invalid"

const responseMessage = {
  id: "msg-test",
  type: "message",
  role: "assistant",
  status: "completed",
  content: [{ type: "output_text", text: "OK", annotations: [] }],
}
const responsesBody = {
  id: "resp-test",
  object: "response",
  created_at: 0,
  model: "mode-test",
  status: "completed",
  output: [responseMessage],
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
}
const anthropicBody = {
  id: "msg-test",
  type: "message",
  role: "assistant",
  model: "claude-3-5-sonnet-20241022",
  content: [{ type: "text", text: "OK" }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
}
const googleBody = {
  candidates: [
    {
      index: 0,
      content: { role: "model", parts: [{ text: "OK" }] },
      finishReason: "STOP",
    },
  ],
  usageMetadata: {
    promptTokenCount: 1,
    candidatesTokenCount: 1,
    totalTokenCount: 2,
  },
}

const fixtures: Array<{
  apiType: ApiVerificationApiType
  modelId?: string
  path: string
  streamPath?: string
  body: Record<string, unknown>
  events: unknown[]
}> = [
  {
    apiType: "openai-compatible",
    path: "/v1/chat/completions",
    body: {
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "mode-test",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "OK" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
    events: [
      {
        id: "chatcmpl-test",
        object: "chat.completion.chunk",
        created: 0,
        model: "mode-test",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "OK" },
            finish_reason: null,
          },
        ],
      },
      {
        id: "chatcmpl-test",
        object: "chat.completion.chunk",
        created: 0,
        model: "mode-test",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      },
    ],
  },
  {
    apiType: "openai",
    path: "/v1/responses",
    body: responsesBody,
    events: [
      {
        type: "response.created",
        response: {
          ...responsesBody,
          status: "in_progress",
          output: [],
          usage: null,
        },
      },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...responseMessage, status: "in_progress", content: [] },
      },
      {
        type: "response.output_text.delta",
        item_id: "msg-test",
        output_index: 0,
        content_index: 0,
        delta: "OK",
      },
      {
        type: "response.output_item.done",
        output_index: 0,
        item: responseMessage,
      },
      { type: "response.completed", response: responsesBody },
    ],
  },
  {
    apiType: "anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    path: "/v1/messages",
    body: anthropicBody,
    events: [
      {
        type: "message_start",
        message: {
          ...anthropicBody,
          content: [],
          stop_reason: null,
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "OK" },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 1 },
      },
      { type: "message_stop" },
    ],
  },
  {
    apiType: "google",
    path: "/v1beta/models/mode-test:generateContent",
    streamPath: "/v1beta/models/mode-test:streamGenerateContent",
    body: googleBody,
    events: [googleBody],
  },
]

/** Respond in the requested wire format and capture what the probe sent. */
function mockGeneration(fixture: (typeof fixtures)[number]) {
  const requests: Array<{ path: string; streaming: boolean }> = []
  server.use(
    http.post(baseUrl + "/*", async ({ request }) => {
      const body = (await request.json()) as { stream?: boolean }
      const path = new URL(request.url).pathname
      const streaming = fixture.streamPath
        ? path === fixture.streamPath
        : body.stream === true
      requests.push({ path, streaming })
      return streaming
        ? new HttpResponse(
            fixture.events
              .map((event) => "data: " + JSON.stringify(event) + "\n\n")
              .join(""),
            { headers: { "Content-Type": "text/event-stream" } },
          )
        : HttpResponse.json(fixture.body)
    }),
  )
  return requests
}

describe.each(fixtures)("$apiType verification mode", (fixture) => {
  it("uses streaming by default and records the tested mode", async () => {
    const requests = mockGeneration(fixture)
    const result = await runApiVerificationProbe({
      baseUrl,
      apiKey: "sk-synthetic",
      apiType: fixture.apiType,
      modelId: fixture.modelId ?? "mode-test",
      probeId: "text-generation",
    })

    expect(requests).toEqual([
      { path: fixture.streamPath ?? fixture.path, streaming: true },
    ])
    expect(result, result.summary).toMatchObject({
      status: "pass",
      mode: "streaming",
      output: { text: "OK" },
    })
  })

  it("uses only the explicitly selected non-streaming mode", async () => {
    const requests = mockGeneration(fixture)
    const result = await runApiVerificationProbe({
      baseUrl,
      apiKey: "sk-synthetic",
      apiType: fixture.apiType,
      modelId: fixture.modelId ?? "mode-test",
      probeId: "text-generation",
      mode: "non-streaming",
    })

    expect(requests).toEqual([{ path: fixture.path, streaming: false }])
    expect(result, result.summary).toMatchObject({
      status: "pass",
      mode: "non-streaming",
      output: { text: "OK" },
    })
  })
})

describe("verification mode boundaries", () => {
  it.each([
    {
      mode: "non-streaming" as const,
      status: 400,
      message: "Stream must be set to true",
      streaming: false,
    },
    {
      mode: "streaming" as const,
      status: 422,
      message: "stream must be set to false",
      streaming: true,
    },
  ])("does not switch $mode after a mode rejection", async (testCase) => {
    const requests: boolean[] = []
    server.use(
      http.post(baseUrl + "/v1/responses", async ({ request }) => {
        const body = (await request.json()) as { stream?: boolean }
        requests.push(body.stream === true)
        return HttpResponse.json(
          { error: { message: testCase.message } },
          { status: testCase.status },
        )
      }),
    )

    const result = await runApiVerificationProbe({
      baseUrl,
      apiKey: "sk-synthetic",
      apiType: "openai",
      modelId: "mode-test",
      probeId: "text-generation",
      mode: testCase.mode,
    })

    expect(requests).toEqual([testCase.streaming])
    expect(result).toMatchObject({
      status: "fail",
      mode: testCase.mode,
      summary: testCase.message,
    })
  })

  it("applies the selected mode to suite generation without labeling the models request", async () => {
    const fixture = fixtures[1]
    const requests = mockGeneration(fixture)
    server.use(
      http.get(baseUrl + "/v1/models", () =>
        HttpResponse.json({ data: [{ id: "mode-test" }] }),
      ),
    )

    const report = await runApiVerification({
      baseUrl,
      apiKey: "sk-synthetic",
      apiType: fixture.apiType,
      modelId: "mode-test",
      mode: "non-streaming",
    })

    expect(
      report.results.find((result) => result.id === "models"),
    ).not.toHaveProperty("mode")
    expect(
      report.results.find((result) => result.id === "text-generation"),
    ).toMatchObject({ status: "pass", mode: "non-streaming" })
    expect(requests).toHaveLength(4)
    expect(requests.every((request) => !request.streaming)).toBe(true)
  })
})
