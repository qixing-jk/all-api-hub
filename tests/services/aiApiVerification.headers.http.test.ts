import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { runApiVerificationProbe } from "~/services/verification/aiApiVerification"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://verification-headers.example.invalid"
const requestHeaders = {
  "x-client": "credential-client",
  authorization: "Bearer credential-auth",
}

describe("verification credential header propagation", () => {
  it.each([
    { apiType: "openai-compatible", probeId: "models" },
    { apiType: "anthropic", probeId: "models" },
    { apiType: "google", probeId: "models" },
    { apiType: "openai-compatible", probeId: "text-generation" },
    { apiType: "openai", probeId: "text-generation" },
    { apiType: "anthropic", probeId: "text-generation" },
    { apiType: "google", probeId: "text-generation" },
    { apiType: "openai", probeId: "tool-calling" },
    { apiType: "openai", probeId: "structured-output" },
    { apiType: "openai", probeId: "web-search" },
    { apiType: "google", probeId: "web-search" },
  ] as const)(
    "sends configured headers for $apiType $probeId",
    async ({ apiType, probeId }) => {
      const captures: Headers[] = []
      server.use(
        http.all(`${baseUrl}/*`, ({ request }) => {
          captures.push(request.headers)
          return HttpResponse.json(
            {
              error: {
                message: "Authentication denied",
                type: "authentication_error",
                status: "UNAUTHENTICATED",
                code: 401,
              },
            },
            { status: 401 },
          )
        }),
      )
      const result = await runApiVerificationProbe({
        baseUrl,
        apiKey: "sk-original",
        apiType,
        probeId,
        modelId: "test-model",
        mode: "non-streaming",
        requestHeaders,
      })
      expect(captures.length).toBeGreaterThan(0)
      for (const headers of captures) {
        expect(headers.get("x-client")).toBe("credential-client")
        expect(headers.get("authorization")).toBe("Bearer credential-auth")
      }
      expect(result.status).toBe("fail")
    },
  )
})
