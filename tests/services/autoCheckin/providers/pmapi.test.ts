import i18n from "i18next"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import autoCheckin from "~/locales/en/autoCheckin.json"
import { canAutomaticallyRetryCheckinResult } from "~/services/checkin/autoCheckin/execution/resultPolicy"
import { pmApiProvider } from "~/services/checkin/autoCheckin/providers/pmapi"
import { clickNativeCheckInPage } from "~/services/checkin/autoCheckin/providers/pmapiNativePageClick"
import { userPreferences } from "~/services/preferences/userPreferences"
import { AuthTypeEnum } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { tempWindowTriggerCheckinPageAction } from "~/utils/browser/tempWindowFetch"
import { server } from "~~/tests/msw/server"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()),
  tempWindowTriggerCheckinPageAction: vi.fn(),
}))

const origin = "https://pmcat.top"
const envelope = (data: unknown) => ({ data, message: "", success: true })

const identity = (checkedInToday: boolean) => ({
  id: 10171,
  username: "pm-test-user",
  quota: 0,
  used_quota: 0,
  checked_in_today: checkedInToday,
})

const account = buildSiteAccount({
  site_type: SITE_TYPES.PMAPI,
  site_url: origin,
  authType: AuthTypeEnum.AccessToken,
  account_info: {
    id: "10171",
    username: "pm-test-user",
    access_token: "pm-console-token",
    quota: 0,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
})

const readContext = () => ({
  request: {
    baseUrl: origin,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      userId: "10171",
      accessToken: "pm-console-token",
    },
  },
  observedAt: Date.now(),
})

describe("pmApiProvider", () => {
  beforeEach(() => {
    i18n.addResourceBundle("en", "autoCheckin", autoCheckin, true, true)
    vi.restoreAllMocks()
    vi.mocked(tempWindowTriggerCheckinPageAction).mockReset()
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      autoCheckin: { continueWhenVerificationRequired: false },
    } as never)
  })

  it.each(["identity_mismatch", "identity_missing"] as const)(
    "reports %s without a second click",
    async (reason) => {
      vi.mocked(userPreferences.getPreferences).mockResolvedValue({
        autoCheckin: { continueWhenVerificationRequired: true },
      } as never)
      vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue({
        success: false,
        reason,
      })
      mockVerificationRefusal()
      await expect(
        pmApiProvider.checkIn(account, executionContext()),
      ).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
      })
      expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledOnce()
    },
  )

  it("does not replay a page action whose response was lost", async () => {
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      autoCheckin: { continueWhenVerificationRequired: true },
    } as never)
    vi.mocked(tempWindowTriggerCheckinPageAction).mockRejectedValue(
      new Error("response lost"),
    )
    mockVerificationRefusal()
    const result = await pmApiProvider.checkIn(account, executionContext())
    expect(result).toMatchObject({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
    })
    expect(canAutomaticallyRetryCheckinResult(result)).toBe(false)
    expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledOnce()
  })

  it("keeps an unconfirmed page click as manual verification rather than success", async () => {
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      autoCheckin: { continueWhenVerificationRequired: true },
    } as never)
    vi.mocked(tempWindowTriggerCheckinPageAction).mockResolvedValue({
      success: true,
      reason: "clicked",
    })
    mockVerificationRefusal()
    await expect(
      pmApiProvider.checkIn(account, executionContext()),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
      messageParams: { checkInUrl: `${origin}/#/console/wallet` },
    })
    expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledOnce()
  })

  it("clicks the site action when an account opts in over a global preference that is off", async () => {
    let clicked = false
    vi.mocked(tempWindowTriggerCheckinPageAction).mockImplementation(
      async () => {
        clicked = true
        return { success: true, reason: "clicked" }
      },
    )
    server.use(
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(clicked))),
      ),
      http.post(`${origin}/api/me/checkin`, () =>
        HttpResponse.json(
          { success: false, data: null, message: "请先完成人机验证" },
          { status: 400 },
        ),
      ),
    )
    await expect(
      pmApiProvider.checkIn(
        {
          ...account,
          checkIn: {
            ...account.checkIn,
            continueWhenVerificationRequired: true,
          },
        },
        executionContext(),
      ),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.SUCCESS })
    expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledOnce()
  })

  it("honors an account opting out while the global preference is on", async () => {
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      autoCheckin: { continueWhenVerificationRequired: true },
    } as never)
    mockVerificationRefusal()
    await expect(
      pmApiProvider.checkIn(
        {
          ...account,
          checkIn: {
            ...account.checkIn,
            continueWhenVerificationRequired: false,
          },
        },
        executionContext(),
      ),
    ).resolves.toMatchObject({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
    })
    expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
  })

  it("leaves native clicking off when saved preferences cannot be read", async () => {
    vi.mocked(userPreferences.getPreferences).mockRejectedValue(
      new Error("storage unavailable"),
    )
    mockVerificationRefusal()
    await expect(
      pmApiProvider.checkIn(account, executionContext()),
    ).resolves.toMatchObject({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
    })
    expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
  })

  it("uses the opted-in identity-checked page action and confirms the grant", async () => {
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      autoCheckin: { continueWhenVerificationRequired: true },
    } as never)
    let checked = false
    vi.mocked(tempWindowTriggerCheckinPageAction).mockImplementation(
      async () => {
        checked = true
        return { success: true, reason: "clicked" }
      },
    )
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(envelope({ checkin_enabled: true })),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(checked))),
      ),
      http.post(`${origin}/api/me/checkin`, () =>
        HttpResponse.json(
          { success: false, message: "请先完成人机验证" },
          { status: 400 },
        ),
      ),
    )
    const context = {
      tempWindowRequestSource: { source: "test" } as never,
      protectionBypassExecution: { kind: "user_command" } as never,
    }
    await expect(
      pmApiProvider.checkIn(account, context),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
    })
    expect(tempWindowTriggerCheckinPageAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        originUrl: origin,
        pageUrl: `${origin}/#/console/wallet`,
        siteType: SITE_TYPES.PMAPI,
        expectedUserId: "10171",
        accountId: account.id,
        trigger: {
          kind: "clickSelector",
          selector: "#ckBtn:not(:disabled)",
          targetWaitMs: 10_000,
          throttle: { maxAttempts: 1 },
        },
        ...context,
      }),
    )
  })

  it("reads the tool's own readiness from the stored console token", () => {
    expect(pmApiProvider.getReadiness(account)).toEqual({ ready: true })
    expect(
      pmApiProvider.getReadiness({
        ...account,
        account_info: { ...account.account_info, access_token: "" },
      }),
    ).toMatchObject({ ready: false })
  })

  it("reports a disabled deployment as a known disabled grant", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(envelope({ checkin_enabled: false })),
      ),
    )
    await expect(
      pmApiProvider.getStatus!(readContext()),
    ).resolves.toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Disabled,
    })
  })

  it("reads today's state from the identity's own checked_in_today flag", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(
          envelope({
            checkin_enabled: true,
            captcha: { enabled: true, scenes: ["login"] },
          }),
        ),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(true))),
      ),
    )
    await expect(
      pmApiProvider.getStatus!(readContext()),
    ).resolves.toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
    })
  })

  it("records the deployment's checkin captcha as manual-verification metadata", async () => {
    // The operator needs the reason in the account UI, and new accounts need it
    // as the default for automatic execution — so it is part of the status.
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(
          envelope({
            checkin_enabled: true,
            captcha: { enabled: true, scenes: ["login", "checkin"] },
          }),
        ),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(false))),
      ),
    )
    await expect(
      pmApiProvider.getStatus!(readContext()),
    ).resolves.toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
      requiresManualVerification: true,
    })
  })

  it("does not mark a deployment without the checkin scene as verification-gated", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(
          envelope({
            checkin_enabled: true,
            captcha: { enabled: true, scenes: ["login"] },
          }),
        ),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(false))),
      ),
    )
    await expect(
      pmApiProvider.getStatus!(readContext()),
    ).resolves.toMatchObject({
      requiresManualVerification: false,
    })
  })

  it("still detects the method when the deployment enforces a checkin captcha", async () => {
    // The grant exists; only execution needs the site's own slider, which is
    // reported as manual verification rather than hiding the method.
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(
          envelope({
            checkin_enabled: true,
            captcha: { enabled: true, scenes: ["login", "checkin"] },
          }),
        ),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(false))),
      ),
    )
    await expect(pmApiProvider.detect!(readContext())).resolves.toMatchObject({
      detection: { outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched },
    })
  })

  it("detects the method through the status readback when automation is allowed", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(envelope({ checkin_enabled: true })),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(false))),
      ),
    )
    await expect(pmApiProvider.detect!(readContext())).resolves.toMatchObject({
      detection: {
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
      },
      status: {
        availability: CHECK_IN_METHOD_AVAILABILITIES.Enabled,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      },
    })
  })

  it("claims the daily grant once and reports the console's own reward", async () => {
    const claim = vi.fn(() => HttpResponse.json(envelope({ quota: 50_000 })))
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(envelope({ checkin_enabled: true })),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(false))),
      ),
      http.post(`${origin}/api/me/checkin`, claim),
    )
    await expect(
      pmApiProvider.checkIn(account, {
        tempWindowRequestSource: {} as never,
        protectionBypassExecution: {} as never,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      reward: { quota: 50_000 },
    })
    expect(claim).toHaveBeenCalledOnce()
  })

  it("does not mutate when the account already claimed today", async () => {
    const claim = vi.fn(() => HttpResponse.json(envelope({ quota: 1 })))
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(envelope({ checkin_enabled: true })),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(true))),
      ),
      http.post(`${origin}/api/me/checkin`, claim),
    )
    await expect(
      pmApiProvider.checkIn(account, {
        tempWindowRequestSource: {} as never,
        protectionBypassExecution: {} as never,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED })
    expect(claim).not.toHaveBeenCalled()
  })

  it("classifies the site's captcha refusal as manual verification required", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(envelope({ checkin_enabled: true })),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(false))),
      ),
      http.post(`${origin}/api/me/checkin`, () =>
        HttpResponse.json(
          { success: false, message: "请先完成人机验证", data: null },
          { status: 400 },
        ),
      ),
    )
    await expect(
      pmApiProvider.checkIn(account, {
        tempWindowRequestSource: {} as never,
        protectionBypassExecution: {} as never,
        mutationLifecycle: {
          dispatched: true,
          responseReceived: true,
        } as never,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
    })
    expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
  })

  it.each([
    "Please verify your account",
    "Account disabled",
    "Account not enabled",
  ])(
    "keeps unrelated account refusals in the shared error policy: %s",
    async (message) => {
      server.use(
        http.get(`${origin}/api/me`, () =>
          HttpResponse.json(envelope(identity(false))),
        ),
        http.post(`${origin}/api/me/checkin`, () =>
          HttpResponse.json(
            { success: false, message, data: null },
            { status: 400 },
          ),
        ),
      )
      await expect(
        pmApiProvider.checkIn(account, executionContext()),
      ).resolves.toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
        rawMessage: message,
      })
      expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
    },
  )

  it("classifies the site's disabled refusal as a disabled method", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(envelope({ checkin_enabled: true })),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(false))),
      ),
      http.post(`${origin}/api/me/checkin`, () =>
        HttpResponse.json(
          { success: false, message: "签到功能未开启", data: null },
          { status: 400 },
        ),
      ),
    )
    await expect(
      pmApiProvider.checkIn(account, {
        tempWindowRequestSource: {} as never,
        protectionBypassExecution: {} as never,
      }),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
    })
  })
  it("does not dispatch a native click without an account identity", async () => {
    expect(
      await clickNativeCheckInPage(
        { ...account, account_info: { ...account.account_info, id: "" } },
        executionContext(),
      ),
    ).toMatchObject({
      reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    })
    expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
  })
  it("rechecks admission before dispatching the native action", async () => {
    expect(
      await clickNativeCheckInPage(account, {
        ...executionContext(),
        beforeRecoveredMutation: async () => false,
      }),
    ).toMatchObject({
      status: CHECKIN_RESULT_STATUS.SKIPPED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    })
    expect(tempWindowTriggerCheckinPageAction).not.toHaveBeenCalled()
  })
  it("reads status using the stored account when no explicit request was supplied", async () => {
    server.use(
      http.get(`${origin}/api/status`, () =>
        HttpResponse.json(envelope({ checkin_enabled: true })),
      ),
      http.get(`${origin}/api/me`, () =>
        HttpResponse.json(envelope(identity(false))),
      ),
    )
    expect(
      await pmApiProvider.getStatus!({ account, observedAt: 1 }),
    ).toMatchObject({
      outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
      today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
    })
  })
  it("does not probe without either account or request", async () => {
    expect(await pmApiProvider.getStatus!({ observedAt: 1 })).toBeUndefined()
  })
})

function executionContext() {
  return {
    tempWindowRequestSource: {} as never,
    protectionBypassExecution: {} as never,
  }
}

function mockVerificationRefusal() {
  server.use(
    http.get(`${origin}/api/me`, () =>
      HttpResponse.json(envelope(identity(false))),
    ),
    http.post(`${origin}/api/me/checkin`, () =>
      HttpResponse.json(
        { success: false, data: null, message: "请先完成人机验证" },
        { status: 400 },
      ),
    ),
  )
}
