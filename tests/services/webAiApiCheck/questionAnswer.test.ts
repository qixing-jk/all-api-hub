import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { resolveWebAiApiCheckQuestionAnswerMessage } from "~/services/verification/webAiApiCheck/background"
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
  ).toMatchObject({ success: false })
})
