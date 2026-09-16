import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  getHealthStatusDisplay,
  getStatusIndicatorColor,
} from "~/utils/healthStatus"

const t = ((key: string) => key) as TFunction

describe("health status presentation", () => {
  it.each([
    ["healthy", "healthy", "bg-success-indicator"],
    ["warning", "warning", "bg-warning-indicator"],
    ["error", "error", "bg-destructive-indicator"],
    ["unknown", "unknown", "bg-neutral-indicator"],
    ["future-status", "unknown", "bg-neutral-indicator"],
    ["", "unknown", "bg-neutral-indicator"],
    [undefined, "unknown", "bg-neutral-indicator"],
  ])("keeps the label and marker consistent for %s", (status, label, color) => {
    expect(getHealthStatusDisplay(status, t)).toEqual({
      text: `account:healthStatus.${label}`,
      color,
    })
    expect(getStatusIndicatorColor(status)).toBe(color)
  })
})
