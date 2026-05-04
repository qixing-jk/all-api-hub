import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification"

export type ChannelFilterAction = "include" | "exclude"

export type ChannelModelFilterRuleKind = "pattern" | "probe"

export type ChannelModelProbeFilterMatchMode = "all" | "any"

interface ChannelModelFilterRuleBase {
  id: string
  name: string
  description?: string
  action: ChannelFilterAction
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface ChannelModelPatternFilterRule
  extends ChannelModelFilterRuleBase {
  kind?: "pattern"
  pattern: string
  isRegex: boolean
}

export interface ChannelModelProbeFilterRule
  extends ChannelModelFilterRuleBase {
  kind: "probe"
  probeIds: ApiVerificationProbeId[]
  /**
   * Forward-compatible execution condition. The UI currently writes "all" only.
   */
  match: ChannelModelProbeFilterMatchMode
}

export type ChannelModelFilterRule =
  | ChannelModelPatternFilterRule
  | ChannelModelProbeFilterRule

export const CHANNEL_MODEL_FILTER_PROBE_IDS = [
  "text-generation",
  "tool-calling",
  "structured-output",
  "web-search",
] as const satisfies ApiVerificationProbeId[]

export const DEFAULT_CHANNEL_MODEL_FILTER_PROBE_IDS = [
  CHANNEL_MODEL_FILTER_PROBE_IDS[0],
] as const satisfies ApiVerificationProbeId[]

/**
 * Returns true when a channel model filter rule is backed by API verification probes.
 */
export function isProbeChannelModelFilterRule(
  rule: ChannelModelFilterRule,
): rule is ChannelModelProbeFilterRule {
  return rule.kind === "probe"
}

/**
 * Returns true when a channel model filter rule uses model-name pattern matching.
 */
export function isPatternChannelModelFilterRule(
  rule: ChannelModelFilterRule,
): rule is ChannelModelPatternFilterRule {
  return rule.kind !== "probe"
}
