export type ChannelFilterAction = "include" | "exclude"

export type ChannelFilterRuleType = "pattern" | "probe"

export type ChannelFilterProbeId =
  | "models"
  | "text-generation"
  | "tool-calling"
  | "structured-output"
  | "web-search"

export interface ChannelModelFilterRule {
  id: string
  ruleType?: ChannelFilterRuleType
  name: string
  description?: string
  action: ChannelFilterAction
  enabled: boolean
  createdAt: number
  updatedAt: number

  pattern?: string
  isRegex?: boolean

  probeId?: ChannelFilterProbeId
  apiType?: string
  verificationBaseUrl?: string
  verificationApiKey?: string
}

export type ChannelModelFilterInput = Omit<
  ChannelModelFilterRule,
  "id" | "createdAt" | "updatedAt"
> & {
  id?: string
}
