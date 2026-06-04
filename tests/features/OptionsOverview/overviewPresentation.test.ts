import { describe, expect, it } from "vitest"

import {
  AUTO_CHECKIN_STATUS_BADGE_VARIANTS,
  OVERVIEW_ATTENTION_BADGE_VARIANTS,
  OVERVIEW_CONFIGURATION_BADGE_VARIANTS,
  OVERVIEW_NEUTRAL_PANEL_CLASSES,
  OVERVIEW_SEVERITY_BADGE_VARIANTS,
} from "~/features/OptionsOverview/components/overviewPresentation"

describe("overview presentation constants", () => {
  it("keeps shared severity badge variants aligned with the badge component vocabulary", () => {
    expect(OVERVIEW_SEVERITY_BADGE_VARIANTS).toEqual({
      success: "success",
      warning: "warning",
      info: "info",
      error: "danger",
    })
    expect(OVERVIEW_ATTENTION_BADGE_VARIANTS).toEqual({
      error: "danger",
      warning: "warning",
      info: "info",
    })
  })

  it("keeps configuration readiness statuses visually distinct", () => {
    expect(OVERVIEW_CONFIGURATION_BADGE_VARIANTS).toEqual({
      configured: "success",
      disabled: "secondary",
      needs_setup: "warning",
      not_applicable: "outline",
    })
  })

  it("keeps auto check-in run statuses mapped to badge variants", () => {
    expect(AUTO_CHECKIN_STATUS_BADGE_VARIANTS).toEqual({
      ready: "success",
      success: "success",
      partial: "warning",
      failed: "danger",
      disabled: "secondary",
      not_run: "info",
    })
  })

  it("exposes a reusable neutral panel class set", () => {
    expect(OVERVIEW_NEUTRAL_PANEL_CLASSES).toContain("border-slate-200/80")
    expect(OVERVIEW_NEUTRAL_PANEL_CLASSES).toContain("dark:bg-white/[0.03]")
  })
})
