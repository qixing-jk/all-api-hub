import type { LucideIcon } from "lucide-react"

export type UnreadFilter = "all" | "unread" | "read"

export interface AnnouncementMetric {
  key: string
  label: string
  value: number
  icon: LucideIcon
  tone: "blue" | "amber" | "emerald"
}
