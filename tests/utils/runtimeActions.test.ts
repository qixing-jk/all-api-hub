import { describe, expect, it } from "vitest"

import {
  composeRuntimeAction,
  hasRuntimeActionPrefix,
  isAutoRefreshRuntimeAction,
  RuntimeActionIds,
  RuntimeActionPrefixes,
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
      hasRuntimeActionPrefix(undefined, RuntimeActionPrefixes.ModelSync),
    ).toBe(false)
    expect(hasRuntimeActionPrefix(null, RuntimeActionPrefixes.ModelSync)).toBe(
      false,
    )
    expect(hasRuntimeActionPrefix(123, RuntimeActionPrefixes.ModelSync)).toBe(
      false,
    )
    expect(
      hasRuntimeActionPrefix(
        RuntimeActionIds.ModelSyncGetNextRun,
        RuntimeActionPrefixes.ModelSync,
      ),
    ).toBe(true)
    expect(
      hasRuntimeActionPrefix(
        "modelSyncX:getNextRun",
        RuntimeActionPrefixes.ModelSync,
      ),
    ).toBe(false)
  })

  it("composes stable on-the-wire action IDs", () => {
    expect(
      composeRuntimeAction(
        RuntimeActionPrefixes.ExternalCheckIn,
        "openAndMark",
      ),
    ).toBe(RuntimeActionIds.ExternalCheckInOpenAndMark)
    expect(RuntimeActionIds.PermissionsCheck).toBe("permissions:check")
  })

  it("detects legacy auto-refresh actions (prefix + allow-list)", () => {
    expect(isAutoRefreshRuntimeAction(undefined)).toBe(false)
    expect(isAutoRefreshRuntimeAction("autoRefresh:ping")).toBe(true)
    expect(isAutoRefreshRuntimeAction("autoRefreshSomething")).toBe(true)
    expect(isAutoRefreshRuntimeAction(RuntimeActionIds.AutoRefreshSetup)).toBe(
      true,
    )
    expect(
      isAutoRefreshRuntimeAction(RuntimeActionIds.AutoRefreshRefreshNow),
    ).toBe(true)
    expect(isAutoRefreshRuntimeAction(RuntimeActionIds.AutoRefreshStop)).toBe(
      true,
    )
    expect(
      isAutoRefreshRuntimeAction(RuntimeActionIds.AutoRefreshUpdateSettings),
    ).toBe(true)
    expect(
      isAutoRefreshRuntimeAction(RuntimeActionIds.AutoRefreshGetStatus),
    ).toBe(true)
    expect(
      isAutoRefreshRuntimeAction(RuntimeActionIds.AutoCheckinGetStatus),
    ).toBe(false)
  })
})
