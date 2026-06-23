import { describe, expect, it } from "vitest"

import {
  composeRuntimeAction,
  hasRuntimeActionPrefix,
  RuntimeActionIds,
  RuntimeActionPrefixes,
  RuntimeMessageTypes,
} from "~/constants/runtimeActions"

describe("runtimeActions registry and helpers", () => {
  it("keeps RuntimeActionIds unique to prevent ambiguous routing", () => {
    const values = Object.values(RuntimeActionIds)
    const unique = new Set(values)

    if (unique.size !== values.length) {
      const duplicates = values.filter(
        (value, index) => values.indexOf(value) !== index,
      )
      throw new Error(
        `Duplicate RuntimeActionIds detected: ${Array.from(
          new Set(duplicates),
        ).join(", ")}`,
      )
    }

    expect(unique.size).toBe(values.length)
  })

  it("matches prefixes safely (null/undefined/non-string never match)", () => {
    expect(
      hasRuntimeActionPrefix(undefined, RuntimeActionPrefixes.OpenSettings),
    ).toBe(false)
    expect(
      hasRuntimeActionPrefix(null, RuntimeActionPrefixes.OpenSettings),
    ).toBe(false)
    expect(
      hasRuntimeActionPrefix(123, RuntimeActionPrefixes.OpenSettings),
    ).toBe(false)
    expect(
      hasRuntimeActionPrefix(
        "openSettings:webAiApiCheck",
        RuntimeActionPrefixes.OpenSettings,
      ),
    ).toBe(true)
    expect(
      hasRuntimeActionPrefix(
        "openSettingsX:webAiApiCheck",
        RuntimeActionPrefixes.OpenSettings,
      ),
    ).toBe(false)
  })

  it("composes stable on-the-wire action IDs", () => {
    expect(
      composeRuntimeAction(RuntimeActionPrefixes.CookieInterceptor, "trackUrl"),
    ).toBe("cookieInterceptor:trackUrl")
    expect(RuntimeActionIds.PermissionsCheck).toBe("permissions:check")
    expect(RuntimeActionIds.ApiCheckContextMenuTrigger).toBe(
      "apiCheck:contextMenuTrigger",
    )
    expect(RuntimeActionIds.RedemptionAssistContextMenuTrigger).toBe(
      "redemptionAssist:contextMenuTrigger",
    )
  })

  it("keeps raw runtime action IDs for non-typed runtime routes", () => {
    expect(RuntimeActionIds.ContentGetLocalStorage).toBe("getLocalStorage")
    expect(RuntimeActionIds.ContentPerformTempWindowFetch).toBe(
      "performTempWindowFetch",
    )
    expect(RuntimeActionIds.OpenTempWindow).toBe("openTempWindow")
    expect(RuntimeActionIds.TempWindowFetch).toBe("tempWindowFetch")
    expect(RuntimeActionIds.CloudflareGuardLog).toBe("cloudflareGuardLog")
    expect(RuntimeActionIds.OpenSettingsWebAiApiCheck).toBe(
      "openSettings:webAiApiCheck",
    )
    expect(RuntimeActionIds.OpenFeedbackBugReport).toBe(
      "feedback:openBugReport",
    )
    expect(RuntimeActionIds.AccountRefreshCompleted).toBe(
      "accountRefresh:completed",
    )
    expect(RuntimeActionIds.BalanceHistoryDebugSeedEstimateSnapshots).toBe(
      "balanceHistory:debugSeedEstimateSnapshots",
    )
  })

  it("keeps broadcast runtime message types stable", () => {
    expect(RuntimeMessageTypes.AccountKeyRepairProgress).toBe(
      "ACCOUNT_KEY_REPAIR_PROGRESS",
    )
    expect(RuntimeMessageTypes.TAG_STORE_UPDATE).toBe("TAG_STORE_UPDATE")
  })
})
