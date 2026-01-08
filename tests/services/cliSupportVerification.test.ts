import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { runCliSupportToolFromRegistry } from "~/services/cliSupportVerification"
import { server } from "~/tests/msw/server"

describe("cliSupportVerification", () => {
  it("returns fail without sending a request when model id is missing", async () => {
    const hit = vi.fn()
    server.use(
      http.post("https://example.com/v1/messages", () => {
        hit()
        return HttpResponse.json({ ok: true })
      }),
    )

    const result = await runCliSupportToolFromRegistry("claude", {
      baseUrl: "https://example.com",
      apiKey: "sk-should-not-send",
      modelId: "",
    })

    expect(result.status).toBe("fail")
    expect(result.summaryKey).toBe("verifyDialog.summaries.noModelIdProvided")
    expect(hit).not.toHaveBeenCalled()
  })

  it("maps 401 to fail and redacts secrets from error summaries (Codex)", async () => {
    const apiKey = "sk-secret-401"
    server.use(
      http.post("https://example.com/v1/responses", async () => {
        return new HttpResponse(`invalid key: ${apiKey}`, {
          status: 401,
          headers: { "content-type": "text/plain" },
        })
      }),
    )

    const result = await runCliSupportToolFromRegistry("codex", {
      baseUrl: "https://example.com",
      apiKey,
      modelId: "gpt-test",
    })

    expect(result.status).toBe("fail")
    expect(result.summaryKey).toBe("verifyDialog.summaries.unauthorized")
    expect(result.summary).not.toContain(apiKey)
  })

  it("treats 404 as fail (not unsupported) when a request is sent (Gemini)", async () => {
    server.use(
      http.post(
        "https://example.com/v1beta/models/gemini-test:generateContent",
        () => {
          return HttpResponse.json({ error: "not found" }, { status: 404 })
        },
      ),
    )

    const result = await runCliSupportToolFromRegistry("gemini", {
      baseUrl: "https://example.com",
      apiKey: "sk-test",
      modelId: "gemini-test",
    })

    expect(result.status).toBe("fail")
    expect(result.summaryKey).toBe("verifyDialog.summaries.endpointNotFound")
  })
})
