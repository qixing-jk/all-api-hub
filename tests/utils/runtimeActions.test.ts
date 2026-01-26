import { describe, expect, it } from "vitest"

import {
  composeRuntimeAction,
  hasRuntimeActionPrefix,
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

  it("routes auto-refresh actions via a single namespaced prefix", () => {
    expect(
      hasRuntimeActionPrefix(undefined, RuntimeActionPrefixes.AutoRefresh),
    ).toBe(false)
    expect(
      hasRuntimeActionPrefix(null, RuntimeActionPrefixes.AutoRefresh),
    ).toBe(false)
    expect(hasRuntimeActionPrefix(123, RuntimeActionPrefixes.AutoRefresh)).toBe(
      false,
    )

    expect(
      hasRuntimeActionPrefix(
        "autoRefresh:ping",
        RuntimeActionPrefixes.AutoRefresh,
      ),
    ).toBe(true)
    expect(
      hasRuntimeActionPrefix(
        RuntimeActionIds.AutoRefreshSetup,
        RuntimeActionPrefixes.AutoRefresh,
      ),
    ).toBe(true)
    expect(
      hasRuntimeActionPrefix(
        RuntimeActionIds.AutoRefreshRefreshNow,
        RuntimeActionPrefixes.AutoRefresh,
      ),
    ).toBe(true)
    expect(
      hasRuntimeActionPrefix(
        RuntimeActionIds.AutoRefreshStop,
        RuntimeActionPrefixes.AutoRefresh,
      ),
    ).toBe(true)
    expect(
      hasRuntimeActionPrefix(
        RuntimeActionIds.AutoRefreshUpdateSettings,
        RuntimeActionPrefixes.AutoRefresh,
      ),
    ).toBe(true)
    expect(
      hasRuntimeActionPrefix(
        RuntimeActionIds.AutoRefreshGetStatus,
        RuntimeActionPrefixes.AutoRefresh,
      ),
    ).toBe(true)
    expect(
      hasRuntimeActionPrefix(
        RuntimeActionIds.AutoCheckinGetStatus,
        RuntimeActionPrefixes.AutoRefresh,
      ),
    ).toBe(false)
  })
})
