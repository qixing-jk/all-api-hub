import { describe, expect, it } from "vitest"

import { SHIELD_DEV_TRIGGER_PRESETS } from "~/features/BasicSettings/components/tabs/Refresh/automaticFeatureSettings"
import {
  isProtectionBypassTaskPermitted,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"

describe("protection bypass development presets", () => {
  it("contains only existing automatic behaviors that permit API fallback fetches", () => {
    expect(SHIELD_DEV_TRIGGER_PRESETS).toHaveLength(6)
    expect(SHIELD_DEV_TRIGGER_PRESETS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: "account_refresh",
          trigger: "scheduled",
          surface: "background",
        }),
        expect.objectContaining({
          feature: "key_management",
          trigger: "background_recovery",
          surface: "options",
        }),
      ]),
    )
    for (const preset of SHIELD_DEV_TRIGGER_PRESETS) {
      expect(
        isProtectionBypassTaskPermitted(
          preset.feature,
          TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch,
        ),
      ).toBe(true)
    }
  })
})
