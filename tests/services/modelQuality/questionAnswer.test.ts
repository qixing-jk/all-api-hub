import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { runQuestionAnswerTest } from "~/services/verification/modelQuality/questionAnswer"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://questions.example.invalid"
const params = {
  baseUrl,
  apiKey: "synthetic-key",
  apiType: "openai-compatible" as const,
  modelId: "test-model",
  mode: "non-streaming" as const,
  question: "What is six times seven?",
  referenceAnswer: "42",
}

function answer(text: string, finishReason = "stop") {
  return HttpResponse.json({
    id: "test-answer",
    object: "chat.completion",
    created: 0,
    model: "test-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: finishReason,
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
  })
}

describe("question and answer testing", () => {
  afterEach(() => vi.unstubAllEnvs())
  it("uses the selected client identity and custom headers for question requests", async () => {
    vi.stubEnv("BROWSER", "firefox")
    let headers!: Headers
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, ({ request }) => {
        headers = request.headers
        return answer("FINAL_ANSWER: 42")
      }),
    )
    await runQuestionAnswerTest({
      ...params,
      requestProfile: "claude",
      requestProfileEnhanced: true,
      requestHeaders: { "X-Tenant": "custom-tenant" },
    })
    expect(headers.get("x-app")).toBe("cli")
    expect(headers.get("x-tenant")).toBe("custom-tenant")
  })
  it.each([
    ["I considered 42.\nFINAL_ANSWER: 41", "stop", "42", "mismatched"],
    [
      "42 appears in the question, but I cannot solve it.",
      "stop",
      "42",
      "ungraded",
    ],
    ["42", "stop", "42", "matched"],
    ["  ４２  ", "stop", "42", "matched"],
    ["FINAL_ANSWER:  ４２  ", "stop", "42", "matched"],
    ["FINAL_ANSWER: 42 items", "stop", "42", "mismatched"],
    ["FINAL_ANSWER: yes", "stop", "Yes", "mismatched"],
    ["FINAL_ANSWER: 4 2", "stop", "42", "mismatched"],
    ["FINAL_ANSWER: 42.", "stop", "42", "mismatched"],
    ["FINAL_ANSWER: 42\nMore explanation.", "stop", "42", "ungraded"],
    ["An open-ended answer.", "stop", "", "manual"],
    ["", "stop", "42", "empty"],
    ["FINAL_ANSWER: 42", "length", "42", "incomplete"],
    ["FINAL_ANSWER: 42", "content_filter", "42", "incomplete"],
  ] as const)(
    "keeps the outcome of %j (%s, %s) distinct",
    async (text, finish, referenceAnswer, outcome) => {
      server.use(
        http.post(`${baseUrl}/v1/chat/completions`, () => answer(text, finish)),
      )
      expect(
        await runQuestionAnswerTest({ ...params, referenceAnswer }),
      ).toMatchObject({ outcome })
    },
  )

  it("keeps questions with no reference available for manual review", async () => {
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, async ({ request }) => {
        expect(await request.json()).toMatchObject({
          messages: [{ role: "user", content: params.question }],
        })
        return answer("42")
      }),
    )
    expect(
      await runQuestionAnswerTest({ ...params, referenceAnswer: "" }),
    ).toMatchObject({ outcome: "manual" })
  })

  it("does not retry provider errors or treat them as wrong answers", async () => {
    let requests = 0
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, () => {
        requests += 1
        return HttpResponse.json(
          { error: { message: "Unavailable" } },
          { status: 503 },
        )
      }),
    )
    await expect(runQuestionAnswerTest(params)).rejects.toThrow()
    expect(requests).toBe(1)
  })

  it("does not send blank questions or already cancelled requests", async () => {
    await expect(
      runQuestionAnswerTest({ ...params, question: " " }),
    ).rejects.toThrow("Question is required")
    await expect(
      runQuestionAnswerTest({ ...params, abortSignal: AbortSignal.abort() }),
    ).rejects.toThrow()
  })
  it("grades the final answer without disclosing the reference to the model", async () => {
    let sent: unknown
    server.use(
      http.post(`${baseUrl}/v1/chat/completions`, async ({ request }) => {
        sent = await request.json()
        return answer("Six groups of seven.\nFINAL_ANSWER: 42")
      }),
    )
    const result = await runQuestionAnswerTest(params)
    expect(result).toMatchObject({
      outcome: "matched",
      answer: "42",
      referenceAnswer: "42",
      question: params.question,
    })
    expect(JSON.stringify(sent)).not.toContain("42")
    expect(sent).toMatchObject({
      messages: expect.arrayContaining([
        { role: "user", content: params.question },
      ]),
    })
  })
})
