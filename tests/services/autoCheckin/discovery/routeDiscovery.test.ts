import { beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { discoverCheckInRouteOverrides } from "~/services/checkin/autoCheckin/discovery/routeDiscovery"
import { newApiProvider } from "~/services/checkin/autoCheckin/providers/newApi"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const { mockCollectFeedbackCluesInBrowser } = vi.hoisted(() => ({
  mockCollectFeedbackCluesInBrowser: vi.fn(),
}))

vi.mock("~/services/checkin/feedback/scanClient", () => ({
  collectFeedbackCluesInBrowser: mockCollectFeedbackCluesInBrowser,
}))

const METHOD_ID = AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn
const FORK_PATH = "/api/user/daily-9f3k"

const account = buildSiteAccount({
  site_url: "https://site.example.invalid",
  site_type: SITE_TYPES.NEW_API,
  checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
})

const detection = (
  reason: "permission_denied" | "invalid_response" | "timeout" | "network",
) => ({
  outcome: "unknown" as const,
  reason,
  attemptedAt: 1,
})

const clues = (routes: string[]) => ({
  status: "completed" as const,
  statusQueries: [],
  routes,
  authenticatedQueriesUnavailable: false,
})

const probe = vi.spyOn(newApiProvider, "probeRouteOverride")

describe("check-in route discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    probe.mockResolvedValue(undefined)
    mockCollectFeedbackCluesInBrowser.mockResolvedValue(
      clues(["/api/user/daily-9f3k", "/profile"]),
    )
  })

  it("retains configuration when the asset scan fails", async () => {
    mockCollectFeedbackCluesInBrowser.mockRejectedValueOnce(
      new Error("unavailable"),
    )
    await expect(
      discoverCheckInRouteOverrides({
        account,
        config: account.checkIn,
        detections: { [METHOD_ID]: detection("invalid_response") },
        context: {},
      }),
    ).resolves.toBe(account.checkIn)
    expect(probe).not.toHaveBeenCalled()
  })

  it.each([
    ["permission_denied", detection("permission_denied")],
    ["invalid_response", detection("invalid_response")],
  ])(
    "learns the deployment's path when detection reported %s",
    async (_reason, reported) => {
      probe.mockResolvedValueOnce({
        outcome: "known",
        today: "not_checked",
        evidence: { source: "probe", observedAt: 10 },
      })

      const config = await discoverCheckInRouteOverrides({
        account,
        config: account.checkIn,
        detections: { [METHOD_ID]: reported },
        context: {},
      })

      expect(config.routeOverrides).toEqual({
        [METHOD_ID]: expect.objectContaining({
          path: FORK_PATH,
          source: "discovery",
        }),
      })
      expect(probe).toHaveBeenCalledTimes(1)
      expect(probe).toHaveBeenCalledWith(
        expect.objectContaining({ path: FORK_PATH }),
      )
    },
  )

  it.each([detection("timeout"), detection("network")])(
    "does not scan assets for an inconclusive failure",
    async (reported) => {
      const config = await discoverCheckInRouteOverrides({
        account,
        config: account.checkIn,
        detections: { [METHOD_ID]: reported },
        context: {},
      })

      expect(config).toBe(account.checkIn)
      expect(mockCollectFeedbackCluesInBrowser).not.toHaveBeenCalled()
      expect(probe).not.toHaveBeenCalled()
    },
  )

  it("relearns a failed discovered route without probing the old path again", async () => {
    const oldPath = "/api/user/daily-old"
    const config = buildCheckInConfig({
      routeOverrides: {
        [METHOD_ID]: { path: oldPath, source: "discovery", observedAt: 5 },
      },
    })
    mockCollectFeedbackCluesInBrowser.mockResolvedValue(
      clues([oldPath, FORK_PATH]),
    )
    probe.mockResolvedValueOnce({
      outcome: "known",
      today: "not_checked",
      evidence: { source: "probe", observedAt: 10 },
    })

    const result = await discoverCheckInRouteOverrides({
      account: { ...account, checkIn: config },
      config,
      detections: { [METHOD_ID]: detection("invalid_response") },
      context: {},
    })

    expect(result.routeOverrides?.[METHOD_ID]).toEqual(
      expect.objectContaining({
        path: FORK_PATH,
        source: "discovery",
      }),
    )
    expect(probe).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledWith(
      expect.objectContaining({ path: FORK_PATH }),
    )
  })

  it("keeps a failed discovered route when no replacement is verified", async () => {
    const config = buildCheckInConfig({
      routeOverrides: {
        [METHOD_ID]: {
          path: "/api/user/old",
          source: "discovery",
          observedAt: 1,
        },
      },
    })
    const result = await discoverCheckInRouteOverrides({
      account: { ...account, checkIn: config },
      config,
      detections: { [METHOD_ID]: detection("invalid_response") },
      context: {},
    })
    expect(result).toBe(config)
    expect(probe).toHaveBeenCalled()
  })

  it("keeps an existing override instead of scanning again", async () => {
    const config = {
      ...account.checkIn,
      routeOverrides: {
        [METHOD_ID]: {
          path: "/api/user/already-learned",
          source: "manual" as const,
          observedAt: 5,
        },
      },
    }

    const result = await discoverCheckInRouteOverrides({
      account,
      config,
      detections: { [METHOD_ID]: detection("permission_denied") },
      context: {},
    })

    expect(result).toBe(config)
    expect(mockCollectFeedbackCluesInBrowser).not.toHaveBeenCalled()
  })

  it("rejects a candidate that does not answer with a complete status", async () => {
    probe.mockResolvedValue(undefined)

    const config = await discoverCheckInRouteOverrides({
      account,
      config: account.checkIn,
      detections: { [METHOD_ID]: detection("permission_denied") },
      context: {},
    })

    expect(config.routeOverrides).toBeUndefined()
  })

  it("skips a candidate path that is already the account's own route", async () => {
    mockCollectFeedbackCluesInBrowser.mockResolvedValue(
      clues(["/api/user/checkin", "/api/user/daily-9f3k"]),
    )
    probe.mockResolvedValueOnce({
      outcome: "known",
      today: "not_checked",
      evidence: { source: "probe", observedAt: 10 },
    })

    await discoverCheckInRouteOverrides({
      account,
      config: account.checkIn,
      detections: { [METHOD_ID]: detection("permission_denied") },
      context: {},
    })

    expect(probe).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledWith(
      expect.objectContaining({ path: FORK_PATH }),
    )
  })

  it("stops when the caller aborts before probing", async () => {
    const controller = new AbortController()
    controller.abort()

    const config = await discoverCheckInRouteOverrides({
      account,
      config: account.checkIn,
      detections: { [METHOD_ID]: detection("permission_denied") },
      context: { signal: controller.signal },
    })

    expect(config).toBe(account.checkIn)
    expect(probe).not.toHaveBeenCalled()
  })

  it("skips malformed paths before spending the probe budget", async () => {
    mockCollectFeedbackCluesInBrowser.mockResolvedValue(
      clues([
        "/api/checkin?month=bad",
        "/api/checkin#fragment",
        "/api/check\\in",
        "/api/daily invalid",
        "//other.invalid/checkin",
        FORK_PATH,
      ]),
    )
    probe.mockImplementation(async ({ path }) =>
      path === FORK_PATH
        ? {
            outcome: "known",
            today: "not_checked",
            evidence: { source: "probe", observedAt: 10 },
          }
        : undefined,
    )
    const result = await discoverCheckInRouteOverrides({
      account,
      config: account.checkIn,
      detections: { [METHOD_ID]: detection("invalid_response") },
      context: {},
    })
    expect(result.routeOverrides?.[METHOD_ID]?.path).toBe(FORK_PATH)
    expect(probe).toHaveBeenCalledTimes(1)
  })
})
