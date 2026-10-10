import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery/discovery"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { hiyoProvider } from "~/services/checkin/autoCheckin/providers/hiyo"
import { createAutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers/registry"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const METHOD_ID = "hiyo:daily-checkin"
const account = () =>
  buildSiteAccount({
    id: "hiyo-test",
    site_url: "https://free.hiyo.top",
    site_type: SITE_TYPES.SUB2API,
    authType: AuthTypeEnum.AccessToken,
    account_info: {
      id: "42",
      username: "Example",
      access_token: "example-token",
      quota: 0,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    checkIn: {
      automaticExecutionEnabled: true,
      selection: { mode: "automatic", methodId: METHOD_ID },
      methodKnowledge: {
        methods: {
          [METHOD_ID]: {
            detection: {
              outcome: "matched",
              evidence: { source: "probe", observedAt: 100 },
            },
          },
        },
      },
    },
  })
const statusData = (checked = false) => ({
  enabled: true,
  daily_claimed: checked,
  daily_available: !checked,
  can_claim: !checked,
  tokens_met: true,
})
const response = (data: unknown) => ({
  ok: true,
  status: 200,
  headers: {},
  body: { code: 0, message: "success", data },
})
const run = () =>
  executeSelectedCheckIn({
    account: account(),
    globalAutomaticExecutionEnabled: true,
    context: {
      tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      protectionBypassExecution: userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
      ),
    },
  })

describe("registered Hiyo daily check-in", () => {
  beforeEach(() => {
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("discovers a matching Sub2API deployment without posting", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(statusData()))
    const method = autoCheckinMethodRegistry
      .getCandidates(SITE_TYPES.SUB2API, "https://another.example")
      .find(({ id }) => id === METHOD_ID)
    expect(method).toBeDefined()
    await expect(
      method!.provider.detect!({ account: account(), observedAt: 200 }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: { availability: "enabled", today: "not_checked" },
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    expect(fetchApiResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: { method: "GET", cache: "no-store" },
      }),
    )
  })

  it("executes an eligible daily claim and preserves the real USD reward in quota", async () => {
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response(statusData()))
      .mockResolvedValueOnce(
        response({
          type: "daily",
          amount: 0.4275,
          balance: 3.9763,
          status: statusData(true),
        }),
      )
    await expect(run()).resolves.toMatchObject({
      kind: "executed",
      methodId: METHOD_ID,
      result: { status: "success", reward: { quota: 213750 } },
      retryable: false,
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })

  it.each([true, false])(
    "never retries an uncertain claim that could consume a bonus (readback checked=%s)",
    async (checked) => {
      let reads = 0
      vi.mocked(fetchApiResponse).mockImplementation(
        async (request, options) => {
          if (options?.options?.method === "POST") {
            request.observer?.onDispatch()
            throw new TypeError("Failed to fetch")
          }
          return response(statusData(reads++ === 0 ? false : checked))
        },
      )
      const result = await run()
      expect(result).toMatchObject({ kind: "executed", retryable: false })
      if (checked)
        expect(result).toMatchObject({ result: { status: "success" } })
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.filter(
            ([, options]) => options?.options?.method === "POST",
          ),
      ).toHaveLength(1)
    },
  )

  it.each([
    { ...statusData(true), can_claim: true, bonus_available: 2 },
    {
      ...statusData(),
      daily_available: false,
      can_claim: true,
      bonus_available: 2,
    },
    { ...statusData(), tokens_met: false },
    { ...statusData(), enabled: false },
  ])(
    "does not post when daily completion or eligibility prevents it (%j)",
    async (data) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(response(data))
      await run()
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
      expect(
        vi.mocked(fetchApiResponse).mock.calls[0]?.[1]?.options?.method,
      ).toBe("GET")
    },
  )

  it("does not submit when a fresh status cannot be read", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(run()).resolves.toMatchObject({ kind: "blocked" })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })

  it.each([
    undefined,
    { outcome: "known", availability: "disabled", today: "not_checked" },
    { outcome: "known", availability: "enabled", today: "checked" },
  ] as const)(
    "rejects a direct claim without eligible status proof (%j)",
    async (statusProof) => {
      await expect(
        hiyoProvider.checkIn(account(), {
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
          protectionBypassExecution: userCommandExecution(
            PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
          ),
          statusProof: statusProof && {
            ...statusProof,
            evidence: { source: "probe", observedAt: 200 },
          },
        }),
      ).resolves.toMatchObject({
        status: "failed",
        reasonCode: "status_unavailable",
      })
      expect(fetchApiResponse).not.toHaveBeenCalled()
    },
  )

  it.each(["abort", "timeout"])(
    "finishes %s discovery even if the transport ignores cancellation",
    async (mode) => {
      const controller = new AbortController()
      let resolve!: (value: ReturnType<typeof response>) => void
      let started!: () => void
      const dispatched = new Promise<void>((done) => {
        started = done
      })
      vi.mocked(fetchApiResponse).mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done
            started()
          }),
      )
      const registry = createAutoCheckinMethodRegistry(
        autoCheckinMethodRegistry
          .getCandidates(SITE_TYPES.SUB2API)
          .filter(({ id }) => id === METHOD_ID),
      )
      const saved = account()
      const pending = discoverCheckInMethods({
        account: saved,
        config: saved.checkIn,
        registry,
        signal: controller.signal,
        perAdapterTimeoutMs: 10,
        deadlineMs: 100,
      })
      await dispatched
      if (mode === "abort") controller.abort()
      const result = await pending
      expect(result.detections[METHOD_ID]).not.toMatchObject({
        outcome: "matched",
      })
      resolve(response(statusData()))
      await Promise.resolve()
      expect(result.detections[METHOD_ID]).not.toMatchObject({
        outcome: "matched",
      })
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    },
  )
})
