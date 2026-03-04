export type ChannelFilterAction = "include" | "exclude"

export interface ChannelModelFilterRule {
  id: string
  name: string
  description?: string
  pattern: string
  isRegex: boolean
  action: ChannelFilterAction
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export type ChannelModelFilterInput = Omit<
  ChannelModelFilterRule,
  "id" | "createdAt" | "updatedAt"
> & {
  id?: string
}
