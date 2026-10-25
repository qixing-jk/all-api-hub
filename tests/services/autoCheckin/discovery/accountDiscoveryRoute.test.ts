import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { discoverAccountCheckInMethods } from "~/services/checkin/autoCheckin/discovery/accountDiscovery"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery/discovery"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const { resolveFixtureRegistry, mockRouteDiscovery } = vi.hoisted(() => ({
  resolveFixtureRegistry: vi.fn(),
  mockRouteDiscovery: vi.fn(),
}))

afterEach(() => vi.unstubAllEnvs())
vi.mock("~/services/checkin/autoCheckin/discovery/discovery", () => ({
  discoverCheckInMethods: vi.fn(),
}))
vi.mock(
  "~/services/checkin/autoCheckin/discovery/devDiscoveryFixtures",
  () => ({
    resolveDevCheckInDiscoveryRegistry: resolveFixtureRegistry,
  }),
)
vi.mock("~/services/checkin/autoCheckin/discovery/routeDiscovery", () => ({
  discoverCheckInRouteOverrides: mockRouteDiscovery,
}))

const account = buildSiteAccount({
  site_url: "https://real.example.com",
  site_type: SITE_TYPES.NEW_API,
  checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
})

describe("route-learning round", () => {
  let firstResult: Awaited<ReturnType<typeof discoverCheckInMethods>>

  beforeEach(() => {
    firstResult = {
      config: buildCheckInConfig(),
      decision: {
        outcome: "unknown",
        matchedMethodIds: [],
        unknownMethodIds: [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn],
      },
      detections: {
        [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn]: {
          outcome: "unknown",
          reason: "permission_denied",
          attemptedAt: 1,
        },
      },
      statuses: {},
      timedOutMethodIds: [],
    } as Awaited<ReturnType<typeof discoverCheckInMethods>>
    vi.mocked(discoverCheckInMethods).mockResolvedValue(firstResult)
  })

  it("re-runs detection in the same round when a route was learned", async () => {
    const learned = buildCheckInConfig({
      routeOverrides: {
        [AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn]: {
          path: "/api/user/daily-9f3k",
          source: "discovery",
          observedAt: 2,
        },
      },
    })
    mockRouteDiscovery.mockResolvedValueOnce(learned)

    await discoverAccountCheckInMethods(account, {
      allowRouteDiscovery: true,
    })

    expect(mockRouteDiscovery).toHaveBeenCalledTimes(1)
    expect(discoverCheckInMethods).toHaveBeenCalledTimes(2)
    // Providers resolve their endpoint from `account.checkIn`, so the learned
    // route must reach the account as well as the config.
    expect(vi.mocked(discoverCheckInMethods).mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        account: expect.objectContaining({
          checkIn: expect.objectContaining({
            routeOverrides: learned.routeOverrides,
          }),
        }),
        config: expect.objectContaining({
          routeOverrides: learned.routeOverrides,
        }),
      }),
    )
  })

  it("keeps the first round's result when nothing was learned", async () => {
    // Nothing learned returns the same configuration it was given.
    mockRouteDiscovery.mockResolvedValueOnce(firstResult.config)

    const result = await discoverAccountCheckInMethods(account, {
      allowRouteDiscovery: true,
    })

    expect(mockRouteDiscovery).toHaveBeenCalledTimes(1)
    expect(discoverCheckInMethods).toHaveBeenCalledTimes(1)
    expect(result).toBe(firstResult)
  })
})
