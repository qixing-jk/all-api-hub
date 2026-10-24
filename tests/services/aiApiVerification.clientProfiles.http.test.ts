import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runApiVerificationProbe } from "~/services/verification/aiApiVerification"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"
import { runCliSupportTool } from "~/services/verification/cliSupportVerification"
import { server } from "~~/tests/msw/server"

const baseUrl = "https://cli-profile.example.invalid"

function textResponse() {
  return {
    id: "resp-profile",
    object: "response",
    created_at: 0,
    model: "gpt-test",
    status: "completed",
    output: [
      {
        id: "msg-profile",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "OK", annotations: [] }],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  }
}

describe("verification CLI request profiles", () => {
  beforeEach(() => {
    // Exercise real HTTP through the public service. Receiving-server browser
    // coverage separately verifies Chromium's DNR-backed User-Agent transport.
    vi.stubEnv("BROWSER", "firefox")
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    {
      apiType: "openai-compatible",
      probeId: "text-generation",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
    },
    {
      apiType: "openai",
      probeId: "embedding",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
    },
    {
      apiType: "anthropic",
      probeId: "text-generation",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Gemini,
    },
  ] as const)(
    "rejects an incompatible $requestProfile / $apiType / $probeId before sending a request",
    async (selection) => {
      let requests = 0
      server.use(
        http.all(baseUrl + "/*", () => {
          requests++
          return HttpResponse.json(
            { error: { message: "Must not dispatch" } },
            { status: 400 },
          )
        }),
      )
      const result = await runApiVerificationProbe({
        ...selection,
        baseUrl,
        apiKey: "sk-test",
        modelId: "test",
        mode: "non-streaming",
      })
      expect(result).toMatchObject({
        status: "unsupported",
        requestProfile: selection.requestProfile,
      })
      expect(requests).toBe(0)
    },
  )

  it("lets ordinary text tests opt into a Codex request while leaving the default ordinary", async () => {
    const requests: Array<{ headers: Headers; body: Record<string, unknown> }> =
      []
    server.use(
      http.post(`${baseUrl}/v1/responses`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        requests.push({ headers: request.headers, body })
        if (request.headers.get("originator") !== "codex_cli_rs") {
          return HttpResponse.json(
            { error: { message: "Codex CLI required" } },
            { status: 403 },
          )
        }
        return HttpResponse.json(textResponse())
      }),
    )
    const params = {
      baseUrl,
      apiKey: "sk-profile-test",
      apiType: "openai",
      modelId: "gpt-test",
      probeId: "text-generation",
      mode: "non-streaming",
    } as const
    expect(
      await runApiVerificationProbe({
        ...params,
        requestProfileEnhanced: true,
      }),
    ).toMatchObject({
      status: "fail",
    })
    const result = await runApiVerificationProbe({
      ...params,
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
    })
    expect(result, result.summary).toMatchObject({
      status: "pass",
      output: { text: "OK" },
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
    })
    expect(requests).toHaveLength(2)
    const ordinary = requests[0]!
    expect(ordinary.headers.get("originator")).toBeNull()
    expect(ordinary.body).not.toHaveProperty("client_metadata")
    const simulated = requests[1]!
    expect(simulated.headers.get("user-agent")).toMatch(
      /^codex_cli_rs\/0\.164\.0 /,
    )
    expect(simulated.headers.get("authorization")).toBe(
      "Bearer sk-profile-test",
    )
    expect(simulated.headers.get("session-id")).toMatch(/^[a-f0-9-]{36}$/)
    expect(simulated.headers.get("x-codex-window-id")).toBe(
      `${simulated.headers.get("session-id")}:0`,
    )
    expect(simulated.body).toMatchObject({
      store: false,
      include: ["reasoning.encrypted_content"],
      client_metadata: {
        session_id: simulated.headers.get("session-id"),
        thread_id: simulated.headers.get("thread-id"),
        "x-codex-window-id": simulated.headers.get("x-codex-window-id"),
      },
    })
    expect(JSON.stringify(result)).not.toContain("sk-profile-test")
  })

  it("sends Claude Code headers, identity and local API-key metadata without changing the text test", async () => {
    let capture:
      | { url: string; headers: Headers; body: Record<string, any> }
      | undefined
    server.use(
      http.post(`${baseUrl}/v1/messages`, async ({ request }) => {
        capture = {
          url: request.url,
          headers: request.headers,
          body: (await request.json()) as Record<string, any>,
        }
        const hasIdentity = capture.body.system?.some(
          (block: { text?: string }) =>
            block.text?.includes("You are Claude Code"),
        )
        if (request.headers.get("x-app") !== "cli" || !hasIdentity) {
          return HttpResponse.json(
            {
              type: "error",
              error: {
                type: "permission_error",
                message: "Claude Code required",
              },
            },
            { status: 403 },
          )
        }
        return HttpResponse.json({
          id: "msg-claude",
          type: "message",
          role: "assistant",
          model: "claude-test",
          content: [{ type: "text", text: "OK" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      }),
    )
    const result = await runApiVerificationProbe({
      baseUrl,
      apiKey: "sk-claude-test",
      apiType: "anthropic",
      modelId: "claude-test",
      probeId: "text-generation",
      mode: "non-streaming",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Claude,
      requestHeaders: { "X-Custom": "retained" },
    })
    expect(result, result.summary).toMatchObject({
      status: "pass",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Claude,
      output: { text: "OK" },
    })
    expect(capture!.headers.get("user-agent")).toBe(
      "claude-cli/2.1.306 (external, cli)",
    )
    expect(capture!.headers.get("x-custom")).toBe("retained")
    expect(capture!.headers.get("x-api-key")).toBe("sk-claude-test")
    expect(capture!.headers.get("anthropic-beta")).toContain(
      "claude-code-20250219",
    )
    expect(capture!.headers.get("anthropic-version")).toBe("2023-06-01")
    expect(new URL(capture!.url).searchParams.get("beta")).toBe("true")
    const user = JSON.parse(capture!.body.metadata.user_id)
    expect(user).toMatchObject({
      device_id: expect.stringMatching(/^[a-f0-9]{64}$/),
      account_uuid: "",
      session_id: expect.stringMatching(/^[a-f0-9-]{36}$/),
    })
    expect(user.session_id).toBe(
      capture!.headers.get("x-claude-code-session-id"),
    )
    expect(capture!.body.messages).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "Reply with exactly: OK" }],
      },
    ])
    expect(JSON.stringify(result)).not.toContain("sk-claude-test")
  })

  it("uses the native API-key Gemini CLI path and a model-specific client identity", async () => {
    let headers: Headers | undefined
    let body: unknown
    server.use(
      http.post(
        `${baseUrl}/v1beta/models/gemini-test:generateContent`,
        async ({ request }) => {
          headers = request.headers
          body = await request.json()
          return HttpResponse.json({
            candidates: [
              {
                content: { role: "model", parts: [{ text: "OK" }] },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 1,
              candidatesTokenCount: 1,
              totalTokenCount: 2,
            },
          })
        },
      ),
    )
    const result = await runApiVerificationProbe({
      baseUrl,
      apiKey: "gemini-secret",
      apiType: "google",
      modelId: "gemini-test",
      probeId: "text-generation",
      mode: "non-streaming",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Gemini,
    })
    expect(result, result.summary).toMatchObject({
      status: "pass",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Gemini,
    })
    expect(headers!.get("user-agent")).toBe(
      "GeminiCLI/0.65.0/gemini-test (win32; x64; cli)",
    )
    expect(headers!.get("x-goog-api-key")).toBe("gemini-secret")
    expect(headers!.get("originator")).toBeNull()
    expect(body).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "Reply with exactly: OK" }] }],
    })
  })

  it.each(
    [
      { toolId: "codex", path: "/v1/responses", ua: "codex_cli_rs/0.164.0" },
      { toolId: "claude", path: "/v1/messages", ua: "claude-cli/2.1.306" },
      {
        toolId: "gemini",
        path: "/v1beta/models/test-model:generateContent",
        ua: "GeminiCLI/0.65.0/test-model",
      },
    ].flatMap((profile) =>
      [false, true].map((requestProfileEnhanced) => ({
        ...profile,
        requestProfileEnhanced,
      })),
    ),
  )(
    "enables the $toolId request profile by default in CLI verification",
    async ({ toolId, path, ua, requestProfileEnhanced }) => {
      let capture: { headers: Headers; body: Record<string, any> } | undefined
      server.use(
        http.post(baseUrl + path, async ({ request }) => {
          capture = {
            headers: request.headers,
            body: (await request.json()) as Record<string, any>,
          }
          return HttpResponse.json(
            {
              type: "error",
              error: {
                message: "Captured",
                type: "invalid_request_error",
                code: 400,
                status: "INVALID_ARGUMENT",
              },
            },
            { status: 400 },
          )
        }),
      )
      const result = await runCliSupportTool({
        toolId: toolId as "codex" | "claude" | "gemini",
        requestProfileEnhanced,
        baseUrl,
        apiKey: "sk-cli-test",
        modelId: "test-model",
        mode: "non-streaming",
      })
      expect(capture?.headers.get("user-agent")).toContain(ua)
      expect(result).toMatchObject({
        id: toolId,
        probeId: "tool-calling",
        requestProfile: toolId,
        status: "fail",
      })
      if (requestProfileEnhanced)
        expect(result).toMatchObject({ requestProfileEnhanced: true })
      else expect(result).not.toHaveProperty("requestProfileEnhanced")
      const tools =
        toolId === "gemini"
          ? capture!.body.tools[0].functionDeclarations
          : capture!.body.tools
      expect(tools).toHaveLength(1)
      expect(tools[0].name).toBe("verify_tool")
      if (toolId === "codex")
        expect(capture!.body).toMatchObject({
          store: false,
          client_metadata: { session_id: expect.any(String) },
        })
      if (toolId === "claude")
        expect(capture!.body.system).toContainEqual(
          expect.objectContaining({
            type: "text",
            text: "You are Claude Code, Anthropic's official CLI for Claude.",
          }),
        )
    },
  )

  it("enhances Codex with consistent turn metadata and preserves the user probe", async () => {
    let capture: { headers: Headers; body: Record<string, any> } | undefined
    server.use(
      http.post(`${baseUrl}/v1/responses`, async ({ request }) => {
        capture = {
          headers: request.headers,
          body: (await request.json()) as Record<string, any>,
        }
        return HttpResponse.json(textResponse())
      }),
    )
    const result = await runApiVerificationProbe({
      baseUrl,
      apiKey: "sk-test",
      apiType: "openai",
      modelId: "gpt-test",
      probeId: "text-generation",
      mode: "non-streaming",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
      requestProfileEnhanced: true,
    })
    expect(result).toMatchObject({
      status: "pass",
      requestProfileEnhanced: true,
    })
    const { headers, body } = capture!
    expect(body.input[0]).toMatchObject({
      role: "developer",
      content: [
        { type: "input_text", text: expect.stringContaining("Codex CLI") },
      ],
    })
    expect(body.input[1]).toMatchObject({
      role: "user",
      content: [{ type: "input_text", text: "Reply with exactly: OK" }],
    })
    const turn = JSON.parse(headers.get("x-codex-turn-metadata")!)
    expect(turn).toMatchObject({
      session_id: headers.get("session-id"),
      thread_id: headers.get("thread-id"),
      window_id: headers.get("x-codex-window-id"),
      installation_id: expect.stringMatching(/^[a-f0-9-]{36}$/),
      turn_id: expect.stringMatching(/^[a-f0-9-]{36}$/),
    })
    expect(turn.root_turn_id).toBe(turn.turn_id)
    expect(body.client_metadata).toMatchObject({
      "x-codex-installation-id": turn.installation_id,
      "x-codex-turn-metadata": headers.get("x-codex-turn-metadata"),
    })
    expect(body.prompt_cache_key).toBe(headers.get("session-id"))
    expect(headers.get("x-client-request-id")).toBe(headers.get("thread-id"))
    expect(body).not.toHaveProperty("tools")
  })

  it("enhances Gemini system instructions without changing native contents", async () => {
    let body: Record<string, any> | undefined
    server.use(
      http.post(
        `${baseUrl}/v1beta/models/gemini-test:generateContent`,
        async ({ request }) => {
          body = (await request.json()) as Record<string, any>
          return HttpResponse.json({
            candidates: [
              {
                content: { role: "model", parts: [{ text: "OK" }] },
                finishReason: "STOP",
              },
            ],
          })
        },
      ),
    )
    const result = await runApiVerificationProbe({
      baseUrl,
      apiKey: "sk-test",
      apiType: "google",
      modelId: "gemini-test",
      probeId: "text-generation",
      mode: "non-streaming",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Gemini,
      requestProfileEnhanced: true,
    })
    expect(result).toMatchObject({
      status: "pass",
      requestProfileEnhanced: true,
    })
    expect(body!.systemInstruction.parts[0].text).toContain("Gemini CLI")
    expect(body!.contents).toEqual([
      { role: "user", parts: [{ text: "Reply with exactly: OK" }] },
    ])
    expect(body).not.toHaveProperty("tools")
  })

  it("keeps Gemini enhancements when running the separate grounding provider", async () => {
    let body: Record<string, any> | undefined
    server.use(
      http.post(
        `${baseUrl}/v1beta/models/gemini-test:generateContent`,
        async ({ request }) => {
          body = (await request.json()) as Record<string, any>
          return HttpResponse.json(
            {
              error: {
                message: "Captured",
                code: 400,
                status: "INVALID_ARGUMENT",
              },
            },
            { status: 400 },
          )
        },
      ),
    )
    await runApiVerificationProbe({
      baseUrl,
      apiKey: "sk-test",
      apiType: "google",
      modelId: "gemini-test",
      probeId: "web-search",
      mode: "non-streaming",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Gemini,
      requestProfileEnhanced: true,
    })
    expect(body!.systemInstruction?.parts[0].text).toContain("Gemini CLI")
    expect(body!.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ googleSearch: {} })]),
    )
  })

  it("optionally adds Claude prompt, cache and SDK fingerprints while preserving the text probe", async () => {
    const captures: Array<{ headers: Headers; body: Record<string, any> }> = []
    server.use(
      http.post(`${baseUrl}/v1/messages`, async ({ request }) => {
        const body = (await request.json()) as Record<string, any>
        captures.push({ headers: request.headers, body })
        if (!body.system?.[0]?.text.startsWith("x-anthropic-billing-header:"))
          return HttpResponse.json(
            { error: { message: "Enhanced client features required" } },
            { status: 403 },
          )
        return HttpResponse.json({
          id: "msg-enhanced",
          type: "message",
          role: "assistant",
          model: "claude-test",
          content: [{ type: "text", text: "OK" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        })
      }),
    )
    const params = {
      baseUrl,
      apiKey: "enhanced-secret",
      apiType: "anthropic",
      probeId: "text-generation",
      modelId: "claude-test",
      mode: "non-streaming",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Claude,
    } as const
    const basic = await runApiVerificationProbe(params)
    const enhanced = await runApiVerificationProbe({
      ...params,
      requestProfileEnhanced: true,
    })
    expect(basic).toMatchObject({ status: "fail" })
    expect(basic).not.toHaveProperty("requestProfileEnhanced")
    expect(enhanced, enhanced.summary).toMatchObject({
      status: "pass",
      requestProfileEnhanced: true,
    })
    const capture = captures[1]!
    expect(capture.headers.get("x-stainless-lang")).toBe("js")
    expect(capture.headers.get("x-stainless-package-version")).toBe("0.128.0")
    expect(capture.headers.get("anthropic-beta")).toContain(
      "prompt-caching-scope-2026-01-05",
    )
    expect(capture.body.system[0].text).toMatch(
      /^x-anthropic-billing-header: cc_version=2\.1\.306\.6d4; cc_entrypoint=cli;$/,
    )
    expect(capture.body.system[0].text).not.toContain("cch=")
    expect(capture.body.system[1]).toMatchObject({
      text: "You are Claude Code, Anthropic's official CLI for Claude.",
      cache_control: { type: "ephemeral" },
    })
    expect(capture.body.system[2].text).toContain("CWD:")
    expect(capture.body.system[2].text).toContain("Date:")
    expect(capture.body.messages[0]).toMatchObject({
      role: "user",
      content: [
        {
          type: "text",
          text: "Reply with exactly: OK",
          cache_control: { type: "ephemeral" },
        },
      ],
    })
    expect(capture.body).not.toHaveProperty("tools")
    expect(JSON.stringify(enhanced)).not.toContain("enhanced-secret")
  })

  it("preserves SDK feature betas while adding the Claude Code identity", async () => {
    let betas: string | null = null
    server.use(
      http.post(`${baseUrl}/v1/messages`, ({ request }) => {
        betas = request.headers.get("anthropic-beta")
        return HttpResponse.json(
          { error: { message: "Captured" } },
          { status: 400 },
        )
      }),
    )
    await runApiVerificationProbe({
      baseUrl,
      apiKey: "sk-test",
      apiType: "anthropic",
      probeId: "tool-calling",
      modelId: "claude-test",
      mode: "non-streaming",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Claude,
    })
    expect(betas).toContain("claude-code-20250219")
    expect(betas).toContain("structured-outputs-2025-11-13")
  })

  it.each(["structured-output", "web-search"] as const)(
    "keeps the Codex profile for ordinary %s probes",
    async (probeId) => {
      let body: Record<string, unknown> | undefined
      server.use(
        http.post(`${baseUrl}/v1/responses`, async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(
            { error: { message: "Captured" } },
            { status: 400 },
          )
        }),
      )
      await runApiVerificationProbe({
        baseUrl,
        apiKey: "sk-test",
        apiType: "openai",
        probeId,
        modelId: "gpt-test",
        mode: "non-streaming",
        requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
      })
      expect(body).toMatchObject({
        store: false,
        client_metadata: { session_id: expect.any(String) },
      })
    },
  )
})
