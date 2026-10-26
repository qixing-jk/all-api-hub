/**
 * Single owner of the default probe prompts and of user overrides.
 *
 * Probes read their prompt from here instead of holding a private constant, so
 * an override applies everywhere the probe runs (account dialog, credential
 * profile dialog, Web AI API Check, batch verification) without each caller
 * threading the value through.
 */
import { API_VERIFICATION_PROBE_IDS } from "../types"
import type { ApiVerificationProbeId } from "../types"

/** Prompts that are part of the request contract rather than sample text. */
const DEFAULT_PROBE_PROMPTS: Partial<Record<ApiVerificationProbeId, string>> = {
  [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Reply with exactly: OK",
  [API_VERIFICATION_PROBE_IDS.StructuredOutput]:
    "Return a JSON object with shape { ok: true }.",
  [API_VERIFICATION_PROBE_IDS.ToolCalling]:
    "Call the verify_tool tool once. Reply with a short sentence that includes the returned time.",
  [API_VERIFICATION_PROBE_IDS.WebSearch]:
    "Use web search to find one recent headline about AI SDK.",
  [API_VERIFICATION_PROBE_IDS.Embedding]: "ping",
  [API_VERIFICATION_PROBE_IDS.ImageGeneration]: "a red dot",
  [API_VERIFICATION_PROBE_IDS.VideoGeneration]:
    "A simple geometric shape rotates slowly on a plain background.",
}

/** Probes whose prompt the user may edit; probes that send none are excluded. */
export const EDITABLE_PROBE_PROMPT_IDS = Object.keys(
  DEFAULT_PROBE_PROMPTS,
) as ApiVerificationProbeId[]

export type ProbePromptOverrides = Partial<
  Record<ApiVerificationProbeId, string>
>

/**
 * Returns the built-in prompt for a probe, or `null` when it sends none.
 */
export function getDefaultProbePrompt(
  probeId: ApiVerificationProbeId,
): string | null {
  return DEFAULT_PROBE_PROMPTS[probeId] ?? null
}

/**
 * Resolve the prompt each probe should send.
 *
 * A blank or non-string override falls back to the default: a probe must always
 * send something, and an empty prompt would turn a real failure into a confusing
 * provider error.
 */
export function resolveProbePrompts(
  overrides: ProbePromptOverrides | undefined,
): ProbePromptOverrides {
  const resolved: ProbePromptOverrides = {}

  for (const probeId of EDITABLE_PROBE_PROMPT_IDS) {
    resolved[probeId] = resolveProbePrompt(probeId, overrides)
  }

  return resolved
}

/**
 * Resolve one probe's prompt, preferring a supplied override map.
 */
export function resolveProbePrompt(
  probeId: ApiVerificationProbeId,
  overrides?: ProbePromptOverrides,
): string | undefined {
  const override = overrides?.[probeId]
  const trimmed = typeof override === "string" ? override.trim() : ""
  return trimmed || DEFAULT_PROBE_PROMPTS[probeId]
}
