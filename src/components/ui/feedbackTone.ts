import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react"

/** Shared status symbols and indicator colors; containers own their surfaces. */
export const feedbackToneStyles = {
  default: { indicator: "text-primary", Icon: Info },
  neutral: { indicator: "text-muted-foreground", Icon: Info },
  info: { indicator: "text-info-indicator", Icon: Info },
  warning: { indicator: "text-warning-indicator", Icon: TriangleAlert },
  success: { indicator: "text-success-indicator", Icon: CircleCheck },
  destructive: { indicator: "text-destructive-indicator", Icon: CircleAlert },
} as const

export type FeedbackTone = keyof typeof feedbackToneStyles
