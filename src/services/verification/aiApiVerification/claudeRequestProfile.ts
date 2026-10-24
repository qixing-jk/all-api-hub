export const CLAUDE_CLI_VERSION = "2.1.306"

/** SDK-owned content passes through; this adapter changes only CLI identity fields. */
type ClaudeContentPart = {
  type: string
  text?: string
  cache_control?: unknown
  [key: string]: unknown
}

type ClaudeRequestBody = {
  system?: string | ClaudeContentPart[]
  messages?: Array<{ role: string; content?: string | ClaudeContentPart[] }>
  tools?: unknown
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

/** Apply Claude identity and optional cache context without changing probe tools. */
export async function prepareClaudeProfileRequest(
  request: Request,
  body: ClaudeRequestBody,
  profileHeaders: Headers,
  enhanced: boolean,
) {
  const url = new URL(request.url)
  const identity = "You are Claude Code, Anthropic's official CLI for Claude."
  const existing =
    typeof body.system === "string"
      ? [{ type: "text", text: body.system }]
      : body.system ?? []
  body.system = [{ type: "text", text: identity }, ...existing]
  if (enhanced) {
    const content = body.messages?.find(
      (message) => message.role === "user",
    )?.content
    const text =
      typeof content === "string"
        ? content
        : (content ?? [])
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("")
    const sampled = [4, 7, 20].map((index) => text[index] ?? "0").join("")
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`59cf53e54c78${sampled}${CLAUDE_CLI_VERSION}`),
    )
    const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    )
      .join("")
      .slice(0, 3)
    const cacheCount =
      JSON.stringify({
        system: existing,
        messages: body.messages,
        tools: body.tools,
      }).match(/"cache_control":/g)?.length ?? 0
    let remainingCachePoints = Math.max(0, 4 - cacheCount)
    const cacheControl = () =>
      remainingCachePoints-- > 0 ? { cache_control: { type: "ephemeral" } } : {}
    body.system = [
      {
        type: "text",
        text: `x-anthropic-billing-header: cc_version=${CLAUDE_CLI_VERSION}.${fingerprint}; cc_entrypoint=cli;`,
      },
      { type: "text", text: identity, ...cacheControl() },
      {
        type: "text",
        text: `CWD: C:\\verification\\workspace\nDate: ${new Date().toISOString().slice(0, 10)}\nThis is a simulated verification workspace. Perform only the requested verification task.`,
        ...cacheControl(),
      },
      ...existing,
    ]
    // Cache only the last text part of the original user message.
    const message = body.messages
      ?.slice()
      .reverse()
      .find((message) => message.role === "user")
    if (typeof message?.content === "string")
      message.content = [
        { type: "text", text: message.content, ...cacheControl() },
      ]
    else if (Array.isArray(message?.content)) {
      const part = message.content
        .slice()
        .reverse()
        .find((part) => part.type === "text")
      if (part && !part.cache_control) Object.assign(part, cacheControl())
    }
  }
  body.metadata = {
    ...body.metadata,
    user_id: JSON.stringify({
      device_id: (crypto.randomUUID() + crypto.randomUUID()).replaceAll(
        "-",
        "",
      ),
      account_uuid: "",
      session_id: profileHeaders.get("x-claude-code-session-id"),
    }),
  }
  url.searchParams.set("beta", "true")
  // Keep feature flags required by the SDK's selected test. Explicit user
  // overrides still take precedence in the existing header transport.
  const requestHeaders = new Headers([...request.headers])
  requestHeaders.set(
    "anthropic-beta",
    [
      ...new Set([
        ...(requestHeaders.get("anthropic-beta")?.split(",") ?? []),
        "claude-code-20250219",
        "interleaved-thinking-2025-05-14",
        ...(enhanced
          ? [
              "thinking-token-count-2026-05-13",
              "context-management-2025-06-27",
              "prompt-caching-scope-2026-01-05",
              "effort-2025-11-24",
            ]
          : []),
      ]),
    ].join(","),
  )
  return {
    url: url.toString(),
    headers: requestHeaders,
    body: JSON.stringify(body),
  }
}
