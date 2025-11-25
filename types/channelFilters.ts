export type ChannelFilterAction = "include" | "exclude"

export interface ChannelFilterRule {
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

export type ChannelFilterInput = Omit<
  ChannelFilterRule,
  "id" | "createdAt" | "updatedAt"
> & {
  id?: string
}
