import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { runApiVerificationProbe } from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"

describe.each(["streaming", "non-streaming"] as const)(
  "Google %s grounding",
  (mode) => {
    it.each([true, false])(
      "requires search evidence (grounded=%s)",
      async (grounded) => {
        const bodies: unknown[] = []
        server.use(
          http.post("https://search.example.com/*", async ({ request }) => {
            bodies.push(await request.json())
            const body = {
              candidates: [
                {
                  index: 0,
                  content: { role: "model", parts: [{ text: "AI news" }] },
                  finishReason: "STOP",
                  ...(grounded
                    ? {
                        groundingMetadata: {
                          webSearchQueries: ["AI news"],
                          groundingChunks: [
                            {
                              web: {
                                uri: "https://news.example.com/ai",
                                title: "AI news",
                              },
                            },
                          ],
                        },
                      }
                    : {}),
                },
              ],
              usageMetadata: {
                promptTokenCount: 1,
                candidatesTokenCount: 1,
                totalTokenCount: 2,
              },
            }
            return mode === "streaming"
              ? new HttpResponse(`data: ${JSON.stringify(body)}\n\n`, {
                  headers: { "Content-Type": "text/event-stream" },
                })
              : HttpResponse.json(body)
          }),
        )
        const result = await runApiVerificationProbe({
          baseUrl: "https://search.example.com",
          apiKey: "test-key",
          apiType: "google",
          modelId: "gemini-2.5-flash",
          probeId: "web-search",
          mode,
        })
        expect(result, result.summary).toMatchObject({
          status: grounded ? "pass" : "fail",
          output: { sourcesCount: grounded ? 1 : 0 },
        })
        expect(bodies).toHaveLength(1)
        expect(bodies[0]).toMatchObject({ tools: [{ googleSearch: {} }] })
      },
    )
  },
)
