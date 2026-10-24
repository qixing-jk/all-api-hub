import { describe, expect, it, vi } from "vitest"

import { createVerificationProfileFetch } from "~/services/verification/aiApiVerification/requestProfiles"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"

describe("request profile transport preservation", () => {
  it.each(["Original system", undefined])(
    "preserves Claude string or absent system prompts (%s)",
    async (system) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response())
      const transport = createVerificationProfileFetch(fetch, {
        requestProfile: API_VERIFICATION_REQUEST_PROFILES.Claude,
        requestProfileEnhanced: true,
      })
      await transport("https://example.invalid/v1/messages", {
        method: "POST",
        body: JSON.stringify({
          system,
          messages: [{ role: "user", content: "Original user task" }],
        }),
      })
      const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body))
      expect(body.system.slice(3)).toEqual(
        system ? [{ type: "text", text: system }] : [],
      )
      expect(body.messages[0].content).toEqual([
        {
          type: "text",
          text: "Original user task",
          cache_control: { type: "ephemeral" },
        },
      ])
    },
  )

  it("wraps Codex string input without losing the original task", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response())
    const transport = createVerificationProfileFetch(fetch, {
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
      requestProfileEnhanced: true,
    })
    await transport("https://example.invalid/v1/responses", {
      method: "POST",
      body: JSON.stringify({ input: "Original user task" }),
    })
    const request = fetch.mock.calls[0]![0] as Request
    const body = await request.json()
    expect(body.input).toHaveLength(2)
    expect(body.input[0]).toMatchObject({ role: "developer" })
    expect(body.input[1]).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "Original user task" }],
    })
  })

  it.each([false, true])(
    "retains Claude system, tools and existing cache points (enhanced=%s)",
    async (enhanced) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response())
      const transport = createVerificationProfileFetch(fetch, {
        requestProfile: API_VERIFICATION_REQUEST_PROFILES.Claude,
        requestProfileEnhanced: enhanced,
        requestHeaders: { "x-claude-code-session-id": "local-session" },
      })
      const cached = { type: "ephemeral" }
      const system = [
        { type: "text", text: "Original system", cache_control: cached },
      ]
      const content = [
        { type: "text", text: "First text", cache_control: cached },
        { type: "text", text: "Final text", cache_control: cached },
      ]
      const tools = [{ name: "original_tool", cache_control: cached }]
      await transport("https://example.invalid/v1/messages", {
        method: "POST",
        headers: { "anthropic-beta": "existing-beta,claude-code-20250219" },
        body: JSON.stringify({
          system,
          messages: [{ role: "user", content }],
          tools,
          tool_choice: { type: "tool", name: "original_tool" },
        }),
      })
      const [url, init] = fetch.mock.calls[0]!
      expect(String(url)).toBe("https://example.invalid/v1/messages?beta=true")
      const body = JSON.parse(String(init!.body))
      expect(body.system.slice(-1)).toEqual(system)
      expect(body.messages).toEqual([{ role: "user", content }])
      expect(body.tools).toEqual(tools)
      expect(body.tool_choice).toEqual({ type: "tool", name: "original_tool" })
      expect(JSON.stringify(body).match(/"cache_control":/g)).toHaveLength(4)
      expect(
        new Headers(init!.headers)
          .get("anthropic-beta")!
          .split(",")
          .filter((value) => value === "claude-code-20250219"),
      ).toHaveLength(1)
      expect(new Headers(init!.headers).get("anthropic-beta")).toContain(
        "existing-beta",
      )
      expect(JSON.parse(body.metadata.user_id).session_id).toBe("local-session")
    },
  )

  it.each([
    API_VERIFICATION_REQUEST_PROFILES.Default,
    API_VERIFICATION_REQUEST_PROFILES.Claude,
  ])("leaves unrelated requests intact (%s)", async (profile) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response())
    const transport = createVerificationProfileFetch(fetch, {
      requestProfile: profile,
      requestProfileEnhanced: true,
    })
    const request = new Request("https://example.invalid/v1/models")
    await transport(request)
    expect(fetch.mock.calls[0]?.[0]).toBe(request)
    expect(fetch.mock.calls[0]?.[1]).toBeUndefined()
  })
})
