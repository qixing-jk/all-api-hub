import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { runCliSupportTool } from "~/services/verification/cliSupportVerification"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://cli-modes.example.invalid"
const cliFixtures = [
  { toolId: "claude", path: "/v1/messages" },
  { toolId: "codex", path: "/v1/responses" },
  {
    toolId: "gemini",
    path: "/v1beta/models/{model}:generateContent",
    streamPath: "/v1beta/models/{model}:streamGenerateContent",
  },
] as const

describe.each(cliFixtures)("$toolId verification modes", (fixture) => {
  it.each([undefined, "streaming", "non-streaming"] as const)(
    "sends only the selected mode %s through the public CLI service",
    async (mode) => {
      const expectedMode = mode ?? "streaming"
      const streaming = expectedMode === "streaming"
      const endpoint =
        "streamPath" in fixture && streaming ? fixture.streamPath : fixture.path
      const rejection = streaming
        ? "stream must be set to false"
        : "Stream must be set to true"
      const requests: Array<{ path: string; streaming: boolean }> = []
      server.use(
        http.post(baseUrl + "/*", async ({ request }) => {
          const path = new URL(request.url).pathname
          const body = (await request.json()) as { stream?: boolean }
          requests.push({
            path,
            streaming:
              fixture.toolId === "gemini"
                ? path.endsWith(":streamGenerateContent")
                : body.stream === true,
          })
          return HttpResponse.json(
            {
              type: "error",
              error: {
                type: "invalid_request_error",
                code: 400,
                status: "INVALID_ARGUMENT",
                message: rejection,
              },
            },
            { status: 400 },
          )
        }),
      )

      const result = await runCliSupportTool({
        toolId: fixture.toolId,
        baseUrl,
        apiKey: "sk-mode-fixture",
        modelId: "mode-test",
        mode,
      })

      expect(requests).toEqual([
        { path: endpoint.replace("{model}", "mode-test"), streaming },
      ])
      expect(result).toMatchObject({
        id: fixture.toolId,
        probeId: "tool-calling",
        status: "fail",
        mode: expectedMode,
        summary: rejection,
        input: { endpoint },
      })
    },
  )
})
