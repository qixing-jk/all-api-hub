import { afterEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { getCheckInFeedbackStatusRoutes } from "~/services/checkin/autoCheckin/providers/feedbackRoutes"
import {
  AUTO_CHECKIN_METHOD_DEFINITIONS,
  type AutoCheckinMethodDefinition,
} from "~/services/checkin/autoCheckin/providers/registry"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

afterEach(() => vi.restoreAllMocks())

describe("registered check-in feedback status routes", () => {
  it.each([
    AUTO_CHECKIN_METHOD_IDS.ClawhudDailyCheckIn,
    AUTO_CHECKIN_METHOD_IDS.GeniusProgrammerDailyCheckIn,
  ])(
    "uses the native timezone query for user check-in status: %s",
    (methodId) => {
      vi.spyOn(
        Intl.DateTimeFormat.prototype,
        "resolvedOptions",
      ).mockReturnValue({
        timeZone: "Asia/Singapore",
      } as Intl.ResolvedDateTimeFormatOptions)
      const definition: AutoCheckinMethodDefinition =
        AUTO_CHECKIN_METHOD_DEFINITIONS[methodId]
      const declared = definition.feedbackStatusRoutes
      const routes =
        typeof declared === "function" ? declared(new Date()) : declared
      expect(routes).toEqual([
        { path: "/api/v1/user/checkin/status?timezone=Asia%2FSingapore" },
      ])
      expect(
        getCheckInFeedbackStatusRoutes(
          SITE_TYPES.SUB2API,
          "https://api.clawhud.com",
        ),
      ).toContainEqual({
        path: "/api/v1/user/checkin/status?timezone=Asia%2FSingapore",
      })
    },
  )

  it("keeps one user status route with UTC when timezone data is unavailable", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("unavailable")
    })
    const routes = getCheckInFeedbackStatusRoutes(
      SITE_TYPES.SUB2API,
      "https://api.clawhud.com",
    )
    expect(
      routes.filter(({ path }) =>
        path.startsWith("/api/v1/user/checkin/status"),
      ),
    ).toEqual([{ path: "/api/v1/user/checkin/status?timezone=UTC" }])
  })

  it("uses Hiyo's read-only route with the browser timezone", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Asia/Singapore",
    } as Intl.ResolvedDateTimeFormatOptions)
    expect(
      getCheckInFeedbackStatusRoutes(
        SITE_TYPES.SUB2API,
        "https://free.hiyo.top",
      ),
    ).toContainEqual({ path: "/api/v1/checkin?timezone=Asia%2FSingapore" })
  })
  it("uses DaiGua's distinct read-only status route", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Asia/Singapore",
    } as Intl.ResolvedDateTimeFormatOptions)
    expect(
      getCheckInFeedbackStatusRoutes(
        SITE_TYPES.SUB2API,
        "https://api.daigua.icu",
      ),
    ).toContainEqual({
      path: "/api/v1/checkin/status?timezone=Asia%2FSingapore",
    })
  })
  it("uses the browser timezone for ToolCode growth-center status", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Asia/Singapore",
    } as Intl.ResolvedDateTimeFormatOptions)
    expect(
      getCheckInFeedbackStatusRoutes(
        SITE_TYPES.SUB2API,
        "https://toolcode.top",
      ),
    ).toContainEqual({
      path: "/api/v1/engagement/checkin/status?timezone=Asia%2FSingapore",
    })
  })

  it("includes Xiaobai's read-only protocol on Sub2API deployments", () => {
    expect(
      getCheckInFeedbackStatusRoutes(
        SITE_TYPES.SUB2API,
        "https://true-sota.com",
      ),
    ).toContainEqual({ path: "/checkin/api/status" })
  })

  it("uses the browser timezone for AI Router's status contract", () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Asia/Shanghai",
    } as Intl.ResolvedDateTimeFormatOptions)
    expect(
      getCheckInFeedbackStatusRoutes(
        SITE_TYPES.SUB2API,
        "https://ai-router.dev",
      ),
    ).toContainEqual({
      path: "/api/v1/user/daily-checkin?timezone=Asia%2FShanghai",
    })
  })

  it("retains all ten candidate protocols on AI Router without truncation", () => {
    const routes = getCheckInFeedbackStatusRoutes(
      SITE_TYPES.SUB2API,
      "https://ai-router.dev",
    )
    expect(routes).toHaveLength(10)
    expect(routes).toContainEqual({ path: "/api/v1/welfare/profile" })
    expect(
      routes.some((route) =>
        route.path.startsWith("/api/v1/user/checkin?timezone="),
      ),
    ).toBe(true)
    expect(routes[0]?.path).toMatch(
      /^\/api\/v1\/user\/daily-checkin\?timezone=/,
    )
    expect(
      routes.some((route) =>
        route.path.startsWith("/api/v1/user/daily-checkin?timezone="),
      ),
    ).toBe(true)
    expect(routes).toContainEqual({ path: "/checkin/api/status" })
  })

  it("requires feedback coverage for every method with status readback", () => {
    for (const definition of Object.values(AUTO_CHECKIN_METHOD_DEFINITIONS)) {
      if (!definition.supportsStatusReadback) continue
      const routes = getCheckInFeedbackStatusRoutes(
        definition.siteTypes[0],
        "origins" in definition
          ? atIndex(definition.origins, 0)
          : "https://example.com",
      )
      const metadata: AutoCheckinMethodDefinition = definition
      const declared = metadata.feedbackStatusRoutes
      const methodRoutes =
        typeof declared === "function" ? declared(new Date()) : declared
      expect(methodRoutes.length, definition.id).toBeGreaterThan(0)
      expect(routes, definition.id).toEqual(
        expect.arrayContaining([...methodRoutes]),
      )
    }
  })
})
