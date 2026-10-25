import { describe, expect, it } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import {
  listCheckInRoutePaths,
  normalizeCheckInRoutePath,
  readCheckInRouteOverride,
  readCheckInRoutePath,
  withCheckInRouteOverride,
} from "~/services/checkin/autoCheckin/configuration/routeOverrides"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const CANONICAL = "/api/user/checkin"
const FORK_PATH = "/api/user/daily-9f3k"
const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn

describe("check-in route overrides", () => {
  it.each([
    "/api/user/daily-9f3k",
    "/api/user/checkin",
    "/console/api/check-in",
    "/api/v1/sign_in",
  ])("accepts a same-origin request path: %s", (path) => {
    expect(normalizeCheckInRoutePath(path)).toBe(path)
  })

  it.each([
    "",
    "api/user/checkin",
    "//evil.example.com/checkin",
    "https://evil.example.com/api/user/checkin",
    "/api/user/checkin?month=2026-10",
    "/api/user/checkin#fragment",
    "/api/user/../admin",
    "/api/user/checkin ",
    "/api/user/check\\in",
    "/api/user/<script>",
  ])("rejects an unsafe or non-path value: %s", (value) => {
    expect(normalizeCheckInRoutePath(value)).toBeNull()
  })

  it("rejects a path longer than the storage bound", () => {
    expect(normalizeCheckInRoutePath(`/api/${"a".repeat(400)}`)).toBeNull()
  })

  it("falls back to the canonical path without an override", () => {
    expect(
      readCheckInRoutePath(buildCheckInConfig(), METHOD_ID, CANONICAL),
    ).toBe(CANONICAL)
    expect(
      readCheckInRouteOverride(buildCheckInConfig(), METHOD_ID),
    ).toBeUndefined()
  })

  it("reads a stored override instead of the canonical path", () => {
    const config = withCheckInRouteOverride(buildCheckInConfig(), METHOD_ID, {
      path: FORK_PATH,
      source: "manual",
      observedAt: 5,
    })
    expect(readCheckInRouteOverride(config, METHOD_ID)).toEqual({
      path: FORK_PATH,
      source: "manual",
      observedAt: 5,
    })
    expect(readCheckInRoutePath(config, METHOD_ID, CANONICAL)).toBe(FORK_PATH)
  })

  it("drops an override without touching other configuration", () => {
    const withOverride = withCheckInRouteOverride(
      buildCheckInConfig({ automaticExecutionEnabled: true }),
      METHOD_ID,
      { path: FORK_PATH, source: "discovery", observedAt: 5 },
    )
    const cleared = withCheckInRouteOverride(withOverride, METHOD_ID, null)
    expect(cleared.routeOverrides).toBeUndefined()
    expect(cleared.automaticExecutionEnabled).toBe(true)
  })

  it("ignores an invalid stored path instead of requesting it", () => {
    const config = {
      ...buildCheckInConfig(),
      routeOverrides: {
        [METHOD_ID]: {
          path: "https://evil.example.com/checkin",
          source: "manual" as const,
          observedAt: 1,
        },
      },
    }
    expect(readCheckInRoutePath(config, METHOD_ID, CANONICAL)).toBe(CANONICAL)
    expect(readCheckInRouteOverride(config, METHOD_ID)).toBeUndefined()
  })

  it("lists unique usable diagnostic routes and excludes invalid stored values", () => {
    expect(listCheckInRoutePaths(buildCheckInConfig())).toEqual([])
    const config = buildCheckInConfig({
      routeOverrides: {
        [METHOD_ID]: { path: FORK_PATH, source: "manual", observedAt: 1 },
        [AUTO_CHECKIN_METHOD_IDS.VeloeraDailyCheckIn]: {
          path: FORK_PATH,
          source: "discovery",
          observedAt: 2,
        },
        [AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn]: {
          path: "//unsafe.invalid",
          source: "manual",
          observedAt: 3,
        },
      },
    })
    expect(listCheckInRoutePaths(config)).toEqual([FORK_PATH])
  })
})
