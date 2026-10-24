import { normalizeHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"

import {
  CLAUDE_CLI_VERSION,
  prepareClaudeProfileRequest,
} from "./claudeRequestProfile"
import { API_TYPES, type ApiVerificationRequestProfile } from "./types"

const VERIFICATION_REQUEST_PROFILE_API_TYPES = {
  [API_VERIFICATION_REQUEST_PROFILES.Codex]: API_TYPES.OPENAI,
  [API_VERIFICATION_REQUEST_PROFILES.Claude]: API_TYPES.ANTHROPIC,
  [API_VERIFICATION_REQUEST_PROFILES.Gemini]: API_TYPES.GOOGLE,
} as const

/** Validate optional profile metadata read from persisted verification results. */
export function isVerificationRequestProfile(
  value: unknown,
): value is ApiVerificationRequestProfile {
  return (
    value === API_VERIFICATION_REQUEST_PROFILES.Default ||
    value === API_VERIFICATION_REQUEST_PROFILES.Codex ||
    value === API_VERIFICATION_REQUEST_PROFILES.Claude ||
    value === API_VERIFICATION_REQUEST_PROFILES.Gemini
  )
}

/** CLI profiles own a protocol; changing identity must not keep another wire format. */
export function getVerificationRequestProfileApiType(
  profile: ApiVerificationRequestProfile,
) {
  return profile === API_VERIFICATION_REQUEST_PROFILES.Default
    ? undefined
    : VERIFICATION_REQUEST_PROFILE_API_TYPES[profile]
}

/** Ordinary requests omit simulation metadata at every UI dispatch boundary. */
export function getVerificationRequestProfileOptions(
  profile: ApiVerificationRequestProfile,
  enhanced: boolean,
): {
  requestProfile?: ApiVerificationRequestProfile
  requestProfileEnhanced?: true
} {
  return profile === API_VERIFICATION_REQUEST_PROFILES.Default
    ? {}
    : {
        requestProfile: profile,
        ...(enhanced ? { requestProfileEnhanced: true } : {}),
      }
}

/**
 * API-key client fingerprints pinned in .scratch/cli-request-simulation/research.md.
 * Identities are generated for this probe, never copied from a logged-in client.
 */
export function createVerificationProfileHeaders(
  profile: ApiVerificationRequestProfile | undefined,
  overrides?: Record<string, string>,
  modelId?: string,
  enhanced = false,
): Record<string, string> | undefined {
  if (!profile || profile === API_VERIFICATION_REQUEST_PROFILES.Default)
    return overrides
  const sessionId = crypto.randomUUID()
  const custom = normalizeHeaderOverrides(overrides)
  if (profile === API_VERIFICATION_REQUEST_PROFILES.Gemini) {
    return {
      "user-agent": `GeminiCLI/0.65.0/${modelId ?? ""} (win32; x64; cli)`,
      ...custom,
    }
  }
  if (profile === API_VERIFICATION_REQUEST_PROFILES.Claude) {
    return {
      "user-agent": `claude-cli/${CLAUDE_CLI_VERSION} (external, cli)`,
      ...(enhanced
        ? {
            "x-stainless-lang": "js",
            "x-stainless-package-version": "0.128.0",
            "x-stainless-os": "Windows",
            "x-stainless-arch": "x64",
            "x-stainless-runtime": "node",
            "x-stainless-runtime-version": "v26.3.0",
            "x-stainless-retry-count": "0",
            "x-stainless-timeout": "600",
          }
        : {}),
      "x-app": "cli",
      "anthropic-version": "2023-06-01",
      "x-claude-code-session-id": sessionId,
      ...custom,
    }
  }
  const threadId = enhanced ? custom?.["thread-id"] ?? sessionId : sessionId
  const effectiveSessionId = enhanced
    ? custom?.["session-id"] ?? sessionId
    : sessionId
  const windowId = custom?.["x-codex-window-id"] ?? `${threadId}:0`
  const turnId = crypto.randomUUID()
  const turnMetadata = enhanced
    ? JSON.stringify({
        installation_id: crypto.randomUUID(),
        session_id: effectiveSessionId,
        thread_id: threadId,
        window_id: windowId,
        window_number: 0,
        turn_id: turnId,
        root_turn_id: turnId,
        request_kind: "turn",
        history_initialization: "new",
        model: modelId,
        turn_started_at_unix_ms: Date.now(),
      })
    : undefined
  return {
    "user-agent": "codex_cli_rs/0.164.0 (Windows 10.0; x86_64)",
    originator: "codex_cli_rs",
    "session-id": effectiveSessionId,
    "thread-id": threadId,
    "x-client-request-id": enhanced ? threadId : crypto.randomUUID(),
    ...(turnMetadata ? { "x-codex-turn-metadata": turnMetadata } : {}),
    "x-codex-window-id": windowId,
    ...custom,
  }
}

/** Preserve the SDK's response parsing and the existing isolated header transport. */
export function createVerificationProfileFetch(
  fetch: typeof globalThis.fetch,
  params: {
    requestProfileEnhanced?: boolean
    requestProfile?: ApiVerificationRequestProfile
    requestHeaders?: Record<string, string>
  },
): typeof globalThis.fetch {
  if (
    !params.requestProfile ||
    params.requestProfile === API_VERIFICATION_REQUEST_PROFILES.Default
  )
    return fetch
  return async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const isCodex =
      params.requestProfile === API_VERIFICATION_REQUEST_PROFILES.Codex &&
      url.pathname.endsWith("/responses")
    const isClaude =
      params.requestProfile === API_VERIFICATION_REQUEST_PROFILES.Claude &&
      url.pathname.endsWith("/messages")
    const isGemini =
      params.requestProfile === API_VERIFICATION_REQUEST_PROFILES.Gemini &&
      params.requestProfileEnhanced &&
      /:(streamGenerateContent|generateContent)$/.test(url.pathname)
    if (request.method !== "POST" || (!isCodex && !isClaude && !isGemini)) {
      return fetch(input, init)
    }
    const body = await request.clone().json()
    const headers = new Headers(params.requestHeaders)
    if (isGemini) {
      body.systemInstruction = {
        ...body.systemInstruction,
        parts: [
          {
            text: "You are Gemini CLI, a command-line interface for Gemini. Perform only the requested verification task with the provided tools.",
          },
          ...(body.systemInstruction?.parts ?? []),
        ],
      }
      return fetch(new Request(request, { body: JSON.stringify(body) }))
    }
    if (isClaude) {
      const prepared = await prepareClaudeProfileRequest(
        request,
        body,
        headers,
        params.requestProfileEnhanced === true,
      )
      return fetch(prepared.url, {
        ...init,
        method: request.method,
        headers: prepared.headers,
        signal: request.signal,
        body: prepared.body,
      })
    }
    body.store = false
    body.include = [
      ...new Set([...(body.include ?? []), "reasoning.encrypted_content"]),
    ]
    body.client_metadata = {
      ...body.client_metadata,
      session_id: headers.get("session-id"),
      thread_id: headers.get("thread-id"),
      "x-codex-window-id": headers.get("x-codex-window-id"),
    }
    if (params.requestProfileEnhanced) {
      const turn = headers.get("x-codex-turn-metadata")
      if (turn) {
        body.client_metadata["x-codex-turn-metadata"] = turn
        body.client_metadata["x-codex-installation-id"] =
          JSON.parse(turn).installation_id
      }
      body.prompt_cache_key = headers.get("session-id")
      body.input = [
        {
          type: "message",
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "You are a coding agent running in the Codex CLI, a terminal-based coding assistant. Perform only the requested verification task with the provided tools.",
            },
          ],
        },
        ...(typeof body.input === "string"
          ? [
              {
                role: "user",
                content: [{ type: "input_text", text: body.input }],
              },
            ]
          : body.input ?? []),
      ]
    }
    return fetch(new Request(request, { body: JSON.stringify(body) }))
  }
}
