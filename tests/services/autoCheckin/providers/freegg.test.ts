import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { canAutomaticallyRetryCheckinResult } from "~/services/checkin/autoCheckin/execution/resultPolicy"
import { freeggProvider } from "~/services/checkin/autoCheckin/providers/freegg"
import {
  getAutoCheckinCandidateMethodIds,
  supportsCheckInStatusReadback,
} from "~/services/checkin/autoCheckin/providers/registry"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: { envelope: vi.fn() },
}))

const envelope = vi.mocked(newApiFamilyRequests.envelope)
const now = Date.parse("2026-11-24T00:00:00.000Z")
const account = () =>
  buildSiteAccount({
    site_url: "https://freegg.app",
    site_type: SITE_TYPES.NEW_API,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      ...buildSiteAccount().account_info,
      id: "17",
      access_token: "test-account-token",
    },
  })
const context = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
}
const log = (extra: Record<string, unknown> = {}) => ({
  id: 51,
  user_id: 17,
  type: 4,
  created_at: now / 1000,
  content: "Daily allowance credited: $0.0020",
  quota: 1000,
  ...extra,
})
const logs = (items: unknown[]) => ({
  success: true,
  message: "",
  data: { items },
})
const mockExecution = (
  before: unknown[],
  after: unknown[],
  selfId: unknown = 17,
) => {
  envelope
    .mockResolvedValueOnce(logs(before))
    .mockResolvedValueOnce({
      success: true,
      message: "",
      data: { id: selfId, quota: 100000 },
    })
    .mockResolvedValueOnce(logs(after))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(now)
})
afterEach(() => vi.useRealTimers())

describe("FreeGG daily allowance", () => {
  it("discovers the separate grant without authenticated requests or standard check-in enablement", async () => {
    envelope.mockResolvedValueOnce({
      success: true,
      message: "",
      data: { system_name: "FreeGG", checkin_enabled: false },
    })
    expect(
      await freeggProvider.detect!({ account: account(), observedAt: now }),
    ).toMatchObject({ outcome: "matched" })
    expect(envelope).toHaveBeenCalledTimes(1)
    expect(envelope).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { authType: AuthTypeEnum.None },
        directRequestReason: "passive",
      }),
      expect.objectContaining({
        endpoint: "/api/status",
        currentTabTransport: "disabled",
        tempWindowFallback: { codes: [], statusCodes: [] },
        options: expect.objectContaining({ credentials: "omit" }),
      }),
    )
  })

  it("does not probe unrelated deployments or trust branding on another origin", async () => {
    const unrelated = { ...account(), site_url: "https://other.example" }
    expect(
      await freeggProvider.detect!({ account: unrelated, observedAt: now }),
    ).toMatchObject({ outcome: "unsupported" })
    expect(envelope).not.toHaveBeenCalled()
    expect(
      getAutoCheckinCandidateMethodIds(SITE_TYPES.NEW_API, unrelated.site_url),
    ).not.toContain(AUTO_CHECKIN_METHOD_IDS.FreeGgDailyAllowance)
    expect(
      getAutoCheckinCandidateMethodIds(SITE_TYPES.NEW_API, account().site_url),
    ).toContain(AUTO_CHECKIN_METHOD_IDS.FreeGgDailyAllowance)
  })

  it("confirms only a new account-matched allowance record and dispatches self once as a mutation", async () => {
    mockExecution([], [log()])
    const result = await freeggProvider.checkIn(account(), context)
    expect(result.status).toBe("success")
    expect(result.awards).toHaveLength(1)
    expect(envelope.mock.calls.map(([, options]) => options.endpoint)).toEqual([
      "/api/log/self?p=1&page_size=30&type=4",
      "/api/user/self",
      "/api/log/self?p=1&page_size=30&type=4",
    ])
    expect(envelope.mock.calls[1]?.[1]).toMatchObject({
      operationSemantics: "mutation",
      currentTabTransport: "disabled",
      tempWindowFallback: { codes: [], statusCodes: [] },
    })
    for (const [request] of envelope.mock.calls) {
      expect(request.protectionBypassExecution).toBeUndefined()
      expect(request.allowAccountCredentialRecovery).not.toBe(true)
      expect(request.fetchContext).toBeUndefined()
    }
  })

  it.each([
    { type: 1, content: "Top-up credited: $20" },
    { content: "Quota added by administrator", quota: 10000000 },
    { content: "Daily allowance unavailable" },
    { content: "Daily allowance credited: $0", quota: 0 },
    { user_id: 99 },
    { id: undefined },
    { created_at: now / 1000 - 3600 },
    { created_at: now / 1000 + 3600 },
  ])(
    "keeps unrelated, undated or malformed evidence uncertain: %j",
    async (extra) => {
      mockExecution([], [log(extra)])
      const result = await freeggProvider.checkIn(account(), context)
      expect(result).toMatchObject({
        status: "uncertain",
        reasonCode: "checkin_unconfirmed",
      })
      expect(result.awards).toBeUndefined()
    },
  )

  it("never turns an older record into today's success using the browser timezone", async () => {
    mockExecution([log()], [log()])
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
    expect(
      supportsCheckInStatusReadback(
        AUTO_CHECKIN_METHOD_IDS.FreeGgDailyAllowance,
      ),
    ).toBe(false)
    expect(freeggProvider.getStatus).toBeUndefined()
  })

  it.each([undefined, 99])(
    "requires the self response to prove saved identity: %s",
    async (selfId) => {
      envelope.mockResolvedValueOnce(logs([])).mockResolvedValueOnce({
        success: true,
        message: "",
        data: { id: selfId },
      })
      expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
        status: "uncertain",
      })
      expect(envelope).toHaveBeenCalledTimes(2)
    },
  )

  it("never claims from a balance increase when there is no allowance record", async () => {
    mockExecution([], [])
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
  })

  it("does not dispatch self if the log baseline cannot be read", async () => {
    envelope.mockRejectedValueOnce(new Error("offline"))
    expect((await freeggProvider.checkIn(account(), context)).status).not.toBe(
      "success",
    )
    expect(envelope).toHaveBeenCalledTimes(1)
  })

  it("does not trigger for a baseline that proves another account", async () => {
    envelope.mockResolvedValueOnce(logs([log({ user_id: 99 })]))
    expect(await freeggProvider.checkIn(account(), context)).toMatchObject({
      status: "uncertain",
    })
    expect(envelope).toHaveBeenCalledTimes(1)
  })

  it("propagates discovery cancellation without falling back to authenticated access", async () => {
    const controller = new AbortController()
    controller.abort()
    envelope.mockRejectedValueOnce(controller.signal.reason)
    await expect(
      freeggProvider.detect!({
        account: account(),
        observedAt: now,
        signal: controller.signal,
      }),
    ).rejects.toBe(controller.signal.reason)
    expect(envelope.mock.calls[0]?.[0].abortSignal).toBe(controller.signal)
    expect(envelope).toHaveBeenCalledTimes(1)
  })

  it("does not replay a lost self response or schedule another mutation", async () => {
    envelope
      .mockResolvedValueOnce(logs([]))
      .mockRejectedValueOnce(new Error("response lost"))
    const result = await freeggProvider.checkIn(account(), context)
    expect(result).toMatchObject({ status: "uncertain" })
    expect(envelope).toHaveBeenCalledTimes(2)
    expect(
      canAutomaticallyRetryCheckinResult(
        result,
        AUTO_CHECKIN_METHOD_IDS.FreeGgDailyAllowance,
      ),
    ).toBe(false)
  })
})
