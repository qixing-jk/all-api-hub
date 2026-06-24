import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  runApiVerificationProbe: vi.fn(),
}))

vi.mock("~/services/verification/aiApiVerification", () => ({
  runApiVerificationProbe: mocks.runApiVerificationProbe,
}))

describe("cliSupport tool-calling runner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("maps a passing probe into CLI-specific output and uses the supported summary key", async () => {
    mocks.runApiVerificationProbe.mockResolvedValueOnce({
      id: "tool-calling",
      status: "pass",
      summary: "",
      summaryKey: "verifyDialog.summaries.toolCallSucceeded",
      summaryParams: { attempt: 1 },
      input: { provider: "openai" },
      output: { toolCalls: [{ name: "verify_tool" }] },
    })

    const { runCliToolCallingSimulation } = await import(
      "~/services/verification/cliSupportVerification/runners/toolCalling"
    )

    const result = await runCliToolCallingSimulation({
      toolId: "codex",
      apiType: "openai",
      baseUrl: "https://example.com",
      apiKey: "sk-secret",
      modelId: "gpt-5",
      endpointPath: "/v1/responses",
    })

    expect(result).toEqual({
      id: "codex",
      probeId: "tool-calling",
      status: "pass",
      summary: "Supported",
      summaryKey: "verifyDialog.summaries.supported",
      summaryParams: { attempt: 1 },
      input: {
        toolId: "codex",
        apiType: "openai",
        baseUrl: "https://example.com",
        endpoint: "/v1/responses",
        method: "POST",
        modelId: "gpt-5",
        probeInput: { provider: "openai" },
      },
      output: { toolCalls: [{ name: "verify_tool" }] },
    })
    expect(JSON.stringify(result)).not.toContain("sk-secret")
  })

  it("preserves failing probe summaries when available and falls back to Failed otherwise", async () => {
    mocks.runApiVerificationProbe.mockResolvedValueOnce({
      id: "tool-calling",
      status: "fail",
      summary: "",
      summaryKey: "verifyDialog.summaries.noToolCallDetected",
      summaryParams: undefined,
      input: { provider: "openai-compatible" },
      output: undefined,
    })

    const { runCliToolCallingSimulation } = await import(
      "~/services/verification/cliSupportVerification/runners/toolCalling"
    )

    const result = await runCliToolCallingSimulation({
      toolId: "gemini",
      apiType: "openai-compatible",
      baseUrl: "https://example.com",
      apiKey: "sk-secret",
      endpointPath: "/chat/completions",
    })

    expect(result).toMatchObject({
      id: "gemini",
      probeId: "tool-calling",
      status: "fail",
      summary: "Failed",
      summaryKey: "verifyDialog.summaries.noToolCallDetected",
      input: {
        toolId: "gemini",
        endpoint: "/chat/completions",
        method: "POST",
        modelId: undefined,
      },
      output: undefined,
    })
  })

  it("passes abort signals through to the shared API verification probe", async () => {
    mocks.runApiVerificationProbe.mockResolvedValueOnce({
      id: "tool-calling",
      status: "pass",
      latencyMs: 4,
      summary: "Supported",
      input: {},
      output: {},
    })

    const { runCliToolCallingSimulation } = await import(
      "~/services/verification/cliSupportVerification/runners/toolCalling"
    )
    const abortController = new AbortController()

    await runCliToolCallingSimulation({
      toolId: "claude",
      apiType: "anthropic",
      baseUrl: "https://example.com",
      apiKey: "sk-secret",
      modelId: "claude-test",
      endpointPath: "/v1/messages",
      abortSignal: abortController.signal,
    })

    expect(mocks.runApiVerificationProbe).toHaveBeenCalledWith(
      expect.objectContaining({
        probeId: "tool-calling",
        abortSignal: abortController.signal,
      }),
    )
  })
})
