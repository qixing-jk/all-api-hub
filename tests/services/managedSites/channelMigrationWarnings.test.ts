import { describe, expect, it } from "vitest"

import { toMigrationWarningCodes } from "~/services/managedSites/channelMigrationWarnings"
import type {
  ManagedSiteMigrationLossSignals,
  ManagedSiteMigrationTargetAdjustments,
} from "~/types/managedSiteMigrationCapability"

const noLoss: ManagedSiteMigrationLossSignals = {
  hasModelMapping: false,
  hasStatusCodeMapping: false,
  hasAdvancedSettings: false,
  hasMultiKeyState: false,
}

const noAdjustments: ManagedSiteMigrationTargetAdjustments = {
  remappedType: false,
  normalizedBaseUrl: false,
  forcedDefaultGroup: false,
  ignoredPriority: false,
  ignoredWeight: false,
  simplifiedStatus: false,
}

describe("migration warning attribution", () => {
  it("does not warn when the target preserves the source settings", () => {
    expect(
      toMigrationWarningCodes({
        lossSignals: noLoss,
        adjustments: noAdjustments,
      }),
    ).toEqual([])
  })

  it.each([
    ["hasModelMapping", "drops-model-mapping"],
    ["hasStatusCodeMapping", "drops-status-code-mapping"],
    ["hasAdvancedSettings", "drops-advanced-settings"],
    ["hasMultiKeyState", "drops-multi-key-state"],
  ] as const)("reports the specific loss for %s", (signal, warning) => {
    expect(
      toMigrationWarningCodes({
        lossSignals: { ...noLoss, [signal]: true },
        adjustments: noAdjustments,
      }),
    ).toEqual([warning])
  })

  it.each([
    ["remappedType", "target-remaps-channel-type"],
    ["normalizedBaseUrl", "target-normalizes-base-url"],
    ["forcedDefaultGroup", "target-forces-default-group"],
    ["ignoredPriority", "target-ignores-priority"],
    ["ignoredWeight", "target-ignores-weight"],
    ["simplifiedStatus", "target-simplifies-status"],
  ] as const)(
    "reports the specific adjustment for %s",
    (adjustment, warning) => {
      expect(
        toMigrationWarningCodes({
          lossSignals: noLoss,
          adjustments: { ...noAdjustments, [adjustment]: true },
        }),
      ).toEqual([warning])
    },
  )

  it("keeps every applicable loss and adjustment in preview order", () => {
    expect(
      toMigrationWarningCodes({
        lossSignals: {
          hasModelMapping: true,
          hasStatusCodeMapping: true,
          hasAdvancedSettings: true,
          hasMultiKeyState: true,
        },
        adjustments: {
          remappedType: true,
          normalizedBaseUrl: true,
          forcedDefaultGroup: true,
          ignoredPriority: true,
          ignoredWeight: true,
          simplifiedStatus: true,
        },
      }),
    ).toEqual([
      "drops-model-mapping",
      "drops-status-code-mapping",
      "drops-advanced-settings",
      "drops-multi-key-state",
      "target-remaps-channel-type",
      "target-normalizes-base-url",
      "target-forces-default-group",
      "target-ignores-priority",
      "target-ignores-weight",
      "target-simplifies-status",
    ])
  })
})
