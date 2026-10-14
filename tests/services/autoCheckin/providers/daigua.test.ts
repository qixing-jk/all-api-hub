import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { discoverCheckInMethods } from "~/services/checkin/autoCheckin/discovery/discovery"
import { executeSelectedCheckIn } from "~/services/checkin/autoCheckin/methods"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import { daiguaProvider } from "~/services/checkin/autoCheckin/providers/daigua"
import { createAutoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers/registry"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { tempWindowTurnstileFetch } from "~/utils/browser/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))
vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()),
  tempWindowTurnstileFetch: vi.fn(),
}))

const METHOD_ID = "daigua:daily-checkin"
const account = () =>
  buildSiteAccount({
    id: "daigua-test",
    site_url: "https://api.daigua.icu",
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
  luck_enabled: true,
  can_checkin: !checked,
  min_reward: 0.1,
  max_reward: 0.6,
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

describe("registered DaiGua daily check-in", () => {
  beforeEach(() => {
    vi.mocked(fetchApiResponse)
      .mockReset()
      .mockResolvedValue(response(statusData()))
    vi.mocked(tempWindowTurnstileFetch)
      .mockReset()
      .mockResolvedValue({
        success: false,
        error: "token unavailable",
        turnstile: { status: "timeout", hasTurnstile: true },
      })
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

  it("reports mandatory Turnstile as manual verification without retrying", async () => {
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response(statusData()))
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {},
        body: {
          code: 400,
          message: "turnstile verification failed",
          reason: "TURNSTILE_VERIFICATION_FAILED",
        },
      })
      .mockResolvedValueOnce(response(statusData()))
    await expect(run()).resolves.toMatchObject({
      kind: "executed",
      retryable: false,
      result: {
        status: "failed",
        reasonCode: "manual_verification_required",
        messageParams: { checkInUrl: "https://api.daigua.icu/checkin" },
      },
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(4)
  })

  it.each(["timeout", "not_present", "rejected"] as const)(
    "confirms native completion after verification %s without another claim",
    async (verification) => {
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(response(statusData()))
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          headers: {},
          body: {
            code: 400,
            message: "turnstile verification failed",
            reason: "TURNSTILE_VERIFICATION_FAILED",
          },
        })
        .mockResolvedValueOnce(response(statusData()))
        .mockResolvedValueOnce(response(statusData(true)))

      vi.mocked(tempWindowTurnstileFetch).mockResolvedValue(
        verification === "rejected"
          ? {
              success: false,
              status: 400,
              error: "turnstile verification failed",
              turnstile: { status: "token_obtained", hasTurnstile: true },
            }
          : {
              success: false,
              error: "token unavailable",
              turnstile: {
                status: verification,
                hasTurnstile: verification !== "not_present",
              },
            },
      )

      const outcome = await run()
      expect(outcome).toMatchObject({
        kind: "executed",
        retryable: false,
        result: { status: "success", reconciliation: "checked" },
      })
      if (outcome.kind === "executed") {
        expect(outcome.result.reward).toBeUndefined()
        expect(outcome.result.reasonCode).toBeUndefined()
      }
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.filter(
            ([, options]) => options?.options?.method === "POST",
          ),
      ).toHaveLength(1)
    },
  )

  it.each(["direct", "assisted"])(
    "preserves the %s grant and reward when final status readback fails",
    async (mode) => {
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(response(statusData()))
        .mockResolvedValueOnce(
          mode === "direct"
            ? response({ reward_amount: 0.19, checkin_type: "normal" })
            : {
                ok: false,
                status: 400,
                headers: {},
                body: {
                  code: 400,
                  message: "turnstile verification failed",
                  reason: "TURNSTILE_VERIFICATION_FAILED",
                },
              },
        )
      if (mode === "assisted") {
        vi.mocked(fetchApiResponse).mockResolvedValueOnce(
          response(statusData()),
        )
        vi.mocked(tempWindowTurnstileFetch).mockResolvedValue({
          success: true,
          status: 200,
          data: {
            code: 0,
            message: "success",
            data: { reward_amount: 0.19, checkin_type: "normal" },
          },
          turnstile: { status: "token_obtained", hasTurnstile: true },
        })
      }
      vi.mocked(fetchApiResponse).mockRejectedValueOnce(
        new TypeError("Failed to fetch"),
      )

      await expect(run()).resolves.toMatchObject({
        kind: "executed",
        retryable: false,
        result: { status: "success", reward: { quota: 95000 } },
      })
      expect(
        vi.mocked(fetchApiResponse).mock.calls.at(-1)?.[1]?.options?.method,
      ).toBe("GET")
    },
  )

  it("preserves manual guidance when final status is unavailable", async () => {
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response(statusData()))
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {},
        body: {
          code: 400,
          message: "turnstile verification failed",
          reason: "TURNSTILE_VERIFICATION_FAILED",
        },
      })
      .mockResolvedValueOnce(response(statusData()))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))

    await expect(run()).resolves.toMatchObject({
      kind: "executed",
      retryable: false,
      result: { status: "failed", reasonCode: "manual_verification_required" },
    })
  })

  it("tries shared browser assistance once with a body token after explicit rejection", async () => {
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response(statusData()))
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {},
        body: {
          code: 400,
          message: "turnstile verification failed",
          reason: "TURNSTILE_VERIFICATION_FAILED",
        },
      })
      .mockResolvedValueOnce(response(statusData()))
    vi.mocked(tempWindowTurnstileFetch).mockResolvedValue({
      success: true,
      status: 200,
      data: {
        code: 0,
        message: "success",
        data: { reward_amount: 0.29, checkin_type: "normal" },
      },
      turnstile: { status: "token_obtained", hasTurnstile: true },
    })
    await expect(run()).resolves.toMatchObject({
      kind: "executed",
      result: { status: "success", reward: { quota: 145000 } },
    })
    expect(tempWindowTurnstileFetch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        pageUrl: "https://api.daigua.icu/checkin",
        fetchUrl: "https://api.daigua.icu/api/v1/checkin",
        turnstileTokenPlacement: "json-body",
        turnstileParamName: "turnstile_token",
        turnstilePreTrigger: {
          kind: "clickSelector",
          selector: '[data-testid="header-normal-checkin"]',
          throttle: { maxAttempts: 1 },
        },
        fetchOptions: expect.objectContaining({
          method: "POST",
          body: "{}",
          credentials: "omit",
          headers: {
            Authorization: "Bearer example-token",
            "Content-Type": "application/json",
          },
        }),
      }),
    )
  })

  it("preserves the USD award through registered execution", async () => {
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response(statusData()))
      .mockResolvedValueOnce(
        response({ reward_amount: 0.29, checkin_type: "normal" }),
      )
    await expect(run()).resolves.toMatchObject({
      kind: "executed",
      result: { status: "success", reward: { quota: 145000 } },
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(3)
  })

  it.each([
    statusData(true),
    { ...statusData(), enabled: false },
    {
      ...statusData(),
      can_checkin: false,
      unavailable_reason: "admin_disabled",
    },
  ])(
    "does not claim a completed, disabled or blocked day (%j)",
    async (data) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(response(data))
      await run()
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
      expect(
        vi.mocked(fetchApiResponse).mock.calls[0]?.[1]?.options?.method,
      ).toBe("GET")
    },
  )

  it.each([true, false])(
    "reads back an uncertain grant without queuing another mutation (checked=%s)",
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
      await expect(run()).resolves.toMatchObject({
        kind: "executed",
        retryable: false,
      })
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.filter(
            ([, options]) => options?.options?.method === "POST",
          ),
      ).toHaveLength(1)
    },
  )

  it("requires an authoritative eligible status before invoking the provider write", async () => {
    await expect(
      daiguaProvider.checkIn(account(), {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      }),
    ).resolves.toMatchObject({
      status: "failed",
      reasonCode: "status_unavailable",
    })
    expect(fetchApiResponse).not.toHaveBeenCalled()
  })

  it("does not submit when fresh status is unavailable", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(run()).resolves.toMatchObject({ kind: "blocked" })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })

  it("does not invoke verification assistance on an uncertain mutation", async () => {
    vi.mocked(fetchApiResponse).mockImplementation(async (request, options) => {
      if (options?.options?.method === "POST") {
        request.observer?.onDispatch()
        throw new TypeError("Failed to fetch")
      }
      return response(statusData())
    })
    await run()
    expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
  })

  it("skips browser assistance after selection or account intent changed", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue({
      ok: false,
      status: 400,
      headers: {},
      body: {
        code: 400,
        message: "turnstile verification failed",
        reason: "TURNSTILE_VERIFICATION_FAILED",
      },
    })
    await expect(
      daiguaProvider.checkIn(account(), {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
        statusProof: {
          outcome: "known",
          availability: "enabled",
          today: "not_checked",
          evidence: { source: "probe", observedAt: 100 },
        },
        beforeRecoveredMutation: async () => false,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      reasonCode: "account_unavailable",
    })
    expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
  })

  it("reports manual verification when the acquired token is rejected", async () => {
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response(statusData()))
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {},
        body: {
          code: 400,
          message: "turnstile verification failed",
          reason: "TURNSTILE_VERIFICATION_FAILED",
        },
      })
      .mockResolvedValueOnce(response(statusData()))
    vi.mocked(tempWindowTurnstileFetch).mockResolvedValue({
      success: false,
      status: 400,
      error: "turnstile verification failed",
      turnstile: { status: "token_obtained", hasTurnstile: true },
    })
    await expect(run()).resolves.toMatchObject({
      kind: "executed",
      retryable: false,
      result: { status: "failed", reasonCode: "manual_verification_required" },
    })
    expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
  })

  it.each([
    [statusData(true), "already_checked"],
    [{ ...statusData(), enabled: false }, "failed"],
  ])(
    "does not attempt verification after eligibility changes (%j)",
    async (freshStatus, expectedStatus) => {
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(response(statusData()))
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          headers: {},
          body: {
            code: 400,
            message: "verification failed",
            reason: "TURNSTILE_VERIFICATION_FAILED",
          },
        })
        .mockResolvedValue(response(freshStatus))
      await expect(run()).resolves.toMatchObject({
        kind: "executed",
        result: { status: expectedStatus },
        retryable: false,
      })
      expect(tempWindowTurnstileFetch).not.toHaveBeenCalled()
      expect(
        vi
          .mocked(fetchApiResponse)
          .mock.calls.filter(
            ([, options]) => options?.options?.method === "POST",
          ),
      ).toHaveLength(1)
    },
  )

  it("maps a browser assistance authentication failure without replaying the claim", async () => {
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response(statusData()))
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {},
        body: {
          code: 400,
          message: "verification failed",
          reason: "TURNSTILE_VERIFICATION_FAILED",
        },
      })
      .mockResolvedValue(response(statusData()))
    vi.mocked(tempWindowTurnstileFetch).mockRejectedValue(
      new ApiError("Unauthorized", 401),
    )
    await expect(run()).resolves.toMatchObject({
      kind: "executed",
      result: { status: "failed", reasonCode: "authentication_required" },
      retryable: false,
    })
    expect(tempWindowTurnstileFetch).toHaveBeenCalledTimes(1)
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.filter(
          ([, options]) => options?.options?.method === "POST",
        ),
    ).toHaveLength(1)
  })

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
