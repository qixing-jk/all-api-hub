import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getCheckInFeedbackStatusRoutes } from "~/services/checkin/autoCheckin/providers/feedbackRoutes"
import {
  AUTO_CHECKIN_METHOD_DEFINITIONS,
  type AutoCheckinMethodDefinition,
} from "~/services/checkin/autoCheckin/providers/registry"

afterEach(() => vi.restoreAllMocks())

describe("registered check-in feedback status routes", () => {
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

  it("retains all five candidate protocols on AI Router without truncation", () => {
    const routes = getCheckInFeedbackStatusRoutes(
      SITE_TYPES.SUB2API,
      "https://ai-router.dev",
    )
    expect(routes).toHaveLength(5)
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
        "origins" in definition ? definition.origins[0] : "https://example.com",
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
