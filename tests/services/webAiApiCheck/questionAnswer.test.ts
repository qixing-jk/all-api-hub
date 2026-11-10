import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { resolveWebAiApiCheckQuestionAnswerMessage } from "~/services/verification/webAiApiCheck/background"
import type { ApiCheckQuestionAnswerRequest } from "~/services/verification/webAiApiCheck/types"
import { server } from "~~/tests/msw/server"

it("runs webpage questions through the background and preserves request headers", async () => {
  let sent: unknown
  let tenant: string | null = null
  server.use(
    http.post(
      "https://web-question.invalid/v1/chat/completions",
      async ({ request }) => {
        sent = await request.json()
        tenant = request.headers.get("x-tenant")
        return HttpResponse.json({
          id: "qa",
          object: "chat.completion",
          created: 0,
          model: "test",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: "FINAL_ANSWER: 21" },
            },
          ],
        })
      },
    ),
  )
  const response = await resolveWebAiApiCheckQuestionAnswerMessage(
    {
      runId: "qa-run",
      baseUrl: "https://web-question.invalid",
      apiKey: "test-secret",
      modelId: "test",
      apiType: "openai-compatible",
      mode: "non-streaming",
      question: "Solve the candy problem.",
      referenceAnswer: "21",
      requestHeaders: { "X-Tenant": "qa-tenant" },
    },
    100,
  )
  expect(response).toMatchObject({
    success: true,
    result: { outcome: "matched" },
  })
  expect(tenant).toBe("qa-tenant")
  expect(JSON.stringify(sent)).not.toContain("21")
})

it("rejects invalid webpage settings before sending a request", async () => {
  let requests = 0
  server.use(
    http.all("*", () => {
      requests += 1
      return HttpResponse.error()
    }),
  )
  expect(
    await resolveWebAiApiCheckQuestionAnswerMessage({
      runId: "invalid",
      baseUrl: "file:///local",
      apiKey: "key",
      modelId: "test",
      apiType: "openai-compatible",
      question: "Question",
      referenceAnswer: "",
    }),
  ).toMatchObject({ success: false, error: "Invalid baseUrl" })
  expect(requests).toBe(0)
})

it.each([
  { apiType: "invalid" },
  { mode: "invalid" },
  { requestProfile: "invalid" },
  { question: " " },
  { referenceAnswer: null },
  { apiKey: 123 },
  { modelId: 123 },
  { runId: 123 },
  { runId: " " },
  { baseUrl: 123 },
])(
  "rejects malformed question configuration %j without sending requests",
  async (invalid) => {
    let requests = 0
    server.use(
      http.all("*", () => {
        requests += 1
        return HttpResponse.error()
      }),
    )
    await expect(
      resolveWebAiApiCheckQuestionAnswerMessage({
        runId: "invalid",
        baseUrl: "https://web-question.invalid",
        apiKey: "key",
        modelId: "test",
        apiType: "openai-compatible",
        question: "Question",
        referenceAnswer: "",
        ...invalid,
      } as unknown as ApiCheckQuestionAnswerRequest),
    ).resolves.toEqual({
      success: false,
      error: "Invalid question test request",
    })
    expect(requests).toBe(0)
  },
)

it("sanitizes provider failures without leaking keys or custom header values", async () => {
  server.use(
    http.post("https://web-question.invalid/v1/chat/completions", () =>
      HttpResponse.json(
        { error: { message: "Failed key-secret header-secret" } },
        { status: 500 },
      ),
    ),
  )
  const result = await resolveWebAiApiCheckQuestionAnswerMessage({
    runId: "failure",
    baseUrl: "https://web-question.invalid",
    apiKey: "key-secret",
    modelId: "test",
    apiType: "openai-compatible",
    mode: "non-streaming",
    question: "Question",
    referenceAnswer: "",
    requestHeaders: { "X-Secret": "header-secret" },
  })
  expect(result.success).toBe(false)
  expect(JSON.stringify(result)).toContain("Failed")
  expect(JSON.stringify(result)).not.toContain("key-secret")
  expect(JSON.stringify(result)).not.toContain("header-secret")
})

it.each([
  null,
  "headers",
  [],
  { "X-Test": 123 },
  { " ": "value" },
  { "X-Test\r": "value" },
  { "X-Test": "value\nother" },
])(
  "rejects malformed question headers %j before sending requests",
  async (requestHeaders) => {
    let requests = 0
    server.use(
      http.all("*", () => {
        requests += 1
        return HttpResponse.error()
      }),
    )
    await expect(
      resolveWebAiApiCheckQuestionAnswerMessage({
        runId: "invalid-headers",
        baseUrl: "https://web-question.invalid",
        apiKey: "key",
        modelId: "test",
        apiType: "openai-compatible",
        question: "Question",
        referenceAnswer: "",
        requestHeaders,
      } as unknown as ApiCheckQuestionAnswerRequest),
    ).resolves.toEqual({
      success: false,
      error: "Invalid request headers",
    })
    expect(requests).toBe(0)
  },
)
