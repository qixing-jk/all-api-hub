import { beforeEach, expect, it, vi } from "vitest"

import {
  ACCOUNT_COOKIE_VALIDATION_REASONS,
  ACCOUNT_COOKIE_VALIDATION_STATUS,
} from "~/constants/accountCookieValidation"
import { SITE_TYPES } from "~/constants/siteType"
import {
  cancelAccountCookieRecovery,
  recoverAccountCookieForDialog,
} from "~/services/accountCredentialRecovery/manual"
import { AuthTypeEnum } from "~/types"

const login = vi.hoisted(() => vi.fn())
const verify = vi.hoisted(() => vi.fn())
vi.mock("~/services/accounts/cookieValidation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/accounts/cookieValidation")
  >()),
  validateAccountCookie: verify,
}))
vi.mock("~/services/accountLogin", () => ({ loginAccount: login }))
const request = {
  requestId: "manual-recovery-test",
  account: {
    site_type: SITE_TYPES.ANYROUTER,
    site_url: "https://anyrouter.top",
    account_info: { id: "17" },
    login: {
      methodId: "password",
      credentials: { username: "user", password: "secret" },
      automaticRecovery: false,
    },
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  verify.mockResolvedValue({ status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid })
})
it("rejects a manual Cookie recovery request for known Token authentication before login", async () => {
  login.mockResolvedValue({
    status: "authenticated",
    identity: "17",
    credential: { cookie: "session=captured" },
  })
  await expect(
    recoverAccountCookieForDialog({
      ...request,
      account: { ...request.account, authType: AuthTypeEnum.AccessToken },
    }),
  ).resolves.toMatchObject({ status: "unsupported" })
  expect(login).not.toHaveBeenCalled()
  expect(verify).not.toHaveBeenCalled()
})
it("rejects an exported Cookie even when browser login verified the expected identity", async () => {
  login.mockResolvedValue({
    status: "authenticated",
    identity: "17",
    credential: { cookie: "session=unusable" },
  })
  verify.mockResolvedValue({ status: ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid })
  await expect(recoverAccountCookieForDialog(request)).resolves.toMatchObject({
    status: "failed",
  })
})
it.each([
  [{ status: "identity_mismatch" }, "identity_mismatch"],
  [
    {
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Verification,
    },
    "uncertain",
  ],
  [
    {
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Permission,
    },
    "uncertain",
  ],
] as const)(
  "preserves independent verification outcome %j",
  async (verification, status) => {
    login.mockResolvedValue({
      status: "authenticated",
      identity: "17",
      credential: { cookie: "session=captured" },
    })
    verify.mockResolvedValue(verification)
    await expect(recoverAccountCookieForDialog(request)).resolves.toMatchObject(
      { status, verification },
    )
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        cookieAuth: { sessionCookie: "session=captured" },
        account_info: { id: "17" },
      }),
    )
  },
)
it("cancels only the named editor login and releases its request ownership", async () => {
  login.mockImplementation(
    ({ abortSignal }) =>
      new Promise((resolve) => {
        abortSignal.addEventListener(
          "abort",
          () => resolve({ status: "cancelled" }),
          { once: true },
        )
      }),
  )
  const first = recoverAccountCookieForDialog(request)
  const secondId = "another-editor"
  const second = recoverAccountCookieForDialog({
    ...request,
    requestId: secondId,
  })
  expect(cancelAccountCookieRecovery(request.requestId)).toBe(true)
  await expect(first).resolves.toMatchObject({ status: "cancelled" })
  expect(login.mock.calls[1]![0].abortSignal.aborted).toBe(false)
  expect(cancelAccountCookieRecovery(request.requestId)).toBe(false)
  cancelAccountCookieRecovery(secondId)
  await second
  expect(verify).not.toHaveBeenCalled()
})
it("does not accept a late verification after its editor cancels", async () => {
  login.mockResolvedValue({
    status: "authenticated",
    identity: "17",
    credential: { cookie: "session=captured" },
  })
  verify.mockImplementation(async ({ abortSignal }) => {
    cancelAccountCookieRecovery(request.requestId)
    expect(abortSignal.aborted).toBe(true)
    return { status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid }
  })
  await expect(recoverAccountCookieForDialog(request)).resolves.toMatchObject({
    status: "cancelled",
  })
})
it("captures a confirmed session with the configured login without requiring automatic recovery", async () => {
  login.mockResolvedValue({
    status: "authenticated",
    identity: "17",
    credential: { cookie: "session=new" },
  })
  expect(await recoverAccountCookieForDialog(request)).toEqual({
    status: "authenticated",
    identity: "17",
    credential: { cookie: "session=new" },
  })
  expect(login).toHaveBeenCalledWith(
    expect.objectContaining({
      account: request.account,
      attended: true,
      captureCredential: true,
    }),
  )
})

it("rejects a credential that the login engine associates with a different identity", async () => {
  login.mockResolvedValue({
    status: "authenticated",
    identity: "18",
    credential: { cookie: "session=other" },
  })
  expect(await recoverAccountCookieForDialog(request)).toEqual({
    status: "identity_mismatch",
  })
})
it("does not start login for a non-HTTP origin", async () => {
  expect(
    await recoverAccountCookieForDialog({
      ...request,
      account: { ...request.account, site_url: "javascript:alert(1)" },
    }),
  ).toEqual({ status: "unsupported" })
  expect(login).not.toHaveBeenCalled()
})

it.each([
  { ...request.account, site_type: SITE_TYPES.NEW_API },
  {
    ...request.account,
    login: {
      methodId: "password",
      credentials: { username: "user", password: "" },
    },
  },
  { ...request.account, account_info: { id: "" } },
  { ...request.account, account_info: { id: Number.NaN } },
])(
  "rejects unsupported or incomplete recovery targets before login",
  async (account) => {
    await recoverAccountCookieForDialog({ ...request, account })
    expect(login).not.toHaveBeenCalled()
  },
)

it("does not export an authenticated response without a captured Cookie", async () => {
  login.mockResolvedValue({ status: "authenticated", identity: "17" })
  expect(await recoverAccountCookieForDialog(request)).toEqual({
    status: "failed",
  })
})
