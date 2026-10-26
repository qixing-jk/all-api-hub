import { describe, expect, it } from "vitest"

import { AGENT_TEST_TOOL_NAMES } from "~/services/verification/agentTest/constants"
import { createAgentTestEnvironment } from "~/services/verification/agentTest/environment"

/**
 * The tools are what the model actually calls, so they are exercised through the
 * public tool surface rather than the QuickJS internals.
 */
async function callTool(
  env: ReturnType<typeof createAgentTestEnvironment>,
  name: string,
  input: unknown,
): Promise<unknown> {
  const entry = (env.tools as Record<string, { execute?: unknown }>)[name]
  if (!entry || typeof entry.execute !== "function") {
    throw new Error(`No tool ${name}`)
  }
  return await (entry.execute as (input: unknown, ctx: unknown) => unknown)(
    input,
    {},
  )
}

describe("agent test environment tools", () => {
  it("rejects virtual paths that escape or cannot be normalized", async () => {
    const env = createAgentTestEnvironment()

    await expect(
      callTool(env, AGENT_TEST_TOOL_NAMES.WriteFile, {
        path: "../outside.svg",
        content: "x",
      }),
    ).resolves.toEqual({ error: "Path points outside the virtual workspace" })

    await expect(
      callTool(env, AGENT_TEST_TOOL_NAMES.WriteFile, {
        path: "nested/../../escape.svg",
        content: "x",
      }),
    ).resolves.toEqual({ error: "Path points outside the virtual workspace" })

    await expect(
      callTool(env, AGENT_TEST_TOOL_NAMES.WriteFile, {
        path: "bad\\windows.svg",
        content: "x",
      }),
    ).resolves.toEqual({ error: "Invalid virtual file path" })

    await expect(
      callTool(env, AGENT_TEST_TOOL_NAMES.ReadFile, { path: "./" }),
    ).resolves.toEqual({ error: "A file path is required" })

    // A rejected path must not leave a file behind.
    await expect(
      callTool(env, AGENT_TEST_TOOL_NAMES.ListFiles, {}),
    ).resolves.toEqual({ files: [] })
  })

  it("normalizes familiar path spellings to one workspace entry", async () => {
    const env = createAgentTestEnvironment()

    await callTool(env, AGENT_TEST_TOOL_NAMES.WriteFile, {
      path: "/artifacts/./pelican.svg",
      content: "<svg/>",
    })

    await expect(
      callTool(env, AGENT_TEST_TOOL_NAMES.ListFiles, {}),
    ).resolves.toEqual({ files: ["artifacts/pelican.svg"] })
    await expect(
      callTool(env, AGENT_TEST_TOOL_NAMES.ReadFile, {
        path: "artifacts/../artifacts/pelican.svg",
      }),
    ).resolves.toEqual({ content: "<svg/>" })
  })

  it("refuses a workspace write that would exceed the size budget", async () => {
    const env = createAgentTestEnvironment()

    await expect(
      callTool(env, AGENT_TEST_TOOL_NAMES.WriteFile, {
        path: "big.svg",
        content: "x".repeat(64 * 1024 * 1024 + 1),
      }),
    ).resolves.toEqual({ error: "Workspace size limit exceeded" })

    await expect(
      callTool(env, AGENT_TEST_TOOL_NAMES.ListFiles, {}),
    ).resolves.toEqual({ files: [] })
  })

  it("reports a QuickJS compile error instead of leaking host objects", async () => {
    const env = createAgentTestEnvironment()

    const output = (await callTool(env, AGENT_TEST_TOOL_NAMES.ExecuteJs, {
      code: "this is not javascript(",
    })) as { error?: string }

    expect(output.error).toEqual(expect.any(String))
    expect(output.error).not.toContain("at ")
  })
})
