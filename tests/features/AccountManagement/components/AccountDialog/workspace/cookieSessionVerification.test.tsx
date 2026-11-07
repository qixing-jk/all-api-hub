import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

import {
  ACCOUNT_COOKIE_VALIDATION_REASONS,
  ACCOUNT_COOKIE_VALIDATION_STATUS,
} from "~/constants/accountCookieValidation"
import { DIALOG_MODES } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { useAccountCookieSession } from "~/features/AccountManagement/components/AccountDialog/form/useAccountCookieSession"
import { AuthTypeEnum } from "~/types"

const deps = vi.hoisted(() => ({
  send: vi.fn(),
  verify: vi.fn(),
  error: vi.fn(),
}))
vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendRuntimeMessage: deps.send,
}))
vi.mock("~/services/accounts/cookieValidation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/accounts/cookieValidation")
  >()),
  validateAccountCookie: deps.verify,
}))
vi.mock("~/lib/notify", () => ({
  default: { error: deps.error, success: vi.fn() },
}))
vi.mock("~/services/permissions/permissionManager", () => ({
  OPTIONAL_PERMISSIONS: [],
  OPTIONAL_PERMISSION_IDS: {},
  hasPermissions: vi.fn().mockResolvedValue(true),
  onOptionalPermissionsChanged: vi.fn(() => vi.fn()),
  ensurePermissionsDetailed: vi.fn(),
}))
const target = {
  site_type: SITE_TYPES.ANYROUTER,
  site_url: "https://anyrouter.top",
  account_info: { id: "17" },
}
beforeEach(() => vi.clearAllMocks())

it.each([false, true])(
  "keeps the draft after automatic import validation rejects (closed: %s)",
  async (closed) => {
    deps.send.mockResolvedValue({ success: true, data: "session=browser" })
    let fail!: (error: Error) => void
    deps.verify.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject
        }),
    )
    const apply = vi.fn()
    const { result, unmount } = renderHook(() =>
      useAccountCookieSession({
        isOpen: true,
        mode: DIALOG_MODES.ADD,
        url: target.site_url,
        authType: AuthTypeEnum.Cookie,
        getContext: () => ({}),
        applyCookie: apply,
        validationTarget: target,
      }),
    )
    let pending!: Promise<boolean>
    act(() => {
      pending = result.current.importAutomatically(() => true)
    })
    await waitFor(() => expect(fail).toBeTypeOf("function"))
    if (closed) unmount()
    await act(async () => {
      fail(new Error("validation failed"))
      await pending
    })
    expect(apply).not.toHaveBeenCalled()
    if (closed) expect(deps.error).not.toHaveBeenCalled()
    else {
      expect(deps.error).toHaveBeenCalledExactlyOnceWith(
        "accountDialog:cookieValidation.importUnconfirmed",
      )
      expect(result.current.state.isImportingCookies).toBe(false)
    }
  },
)

it.each([
  ACCOUNT_COOKIE_VALIDATION_STATUS.Valid,
  ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch,
])(
  "validates automatic import against the newly detected identity: %s",
  async (status) => {
    deps.send.mockResolvedValue({
      success: true,
      data: "session=browser",
      cookieStoreId: "detected-store",
    })
    deps.verify.mockResolvedValue({ status })
    const apply = vi.fn()
    const detected = { ...target, account_info: { id: "new-identity" } }
    const { result } = renderHook(() =>
      useAccountCookieSession({
        isOpen: true,
        mode: DIALOG_MODES.ADD,
        url: target.site_url,
        authType: AuthTypeEnum.Cookie,
        getContext: () => ({ sourceTabIncognito: true }),
        applyCookie: apply,
        validationTarget: target,
      }),
    )
    await act(async () => {
      await result.current.importAutomatically(() => true, detected)
    })
    expect(deps.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        account_info: detected.account_info,
        cookieAuth: { sessionCookie: "session=browser" },
        fetchContext: {
          kind: "browser-context",
          cookieStoreId: "detected-store",
          incognito: true,
        },
      }),
    )
    if (status === ACCOUNT_COOKIE_VALIDATION_STATUS.Valid)
      expect(apply).toHaveBeenCalledExactlyOnceWith("session=browser")
    else expect(apply).not.toHaveBeenCalled()
  },
)

it("uses the resolved source store returned by the background importer", async () => {
  deps.send.mockResolvedValue({
    success: true,
    data: "session=browser",
    cookieStoreId: "private-store",
  })
  deps.verify.mockResolvedValue({
    status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid,
  })
  const { result } = renderHook(() =>
    useAccountCookieSession({
      isOpen: true,
      mode: DIALOG_MODES.EDIT,
      url: target.site_url,
      authType: AuthTypeEnum.Cookie,
      getContext: () => ({ sourceTabId: 42, sourceTabIncognito: true }),
      applyCookie: vi.fn(),
      validationTarget: target,
    }),
  )
  await act(async () => {
    await result.current.importManually()
  })
  expect(deps.verify).toHaveBeenCalledWith(
    expect.objectContaining({
      fetchContext: {
        kind: "browser-context",
        cookieStoreId: "private-store",
        incognito: true,
      },
    }),
  )
})

it("verifies an imported Cookie in its source browser partition", async () => {
  deps.send.mockResolvedValue({ success: true, data: "session=browser" })
  deps.verify.mockResolvedValue({
    status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid,
  })
  const { result } = renderHook(() =>
    useAccountCookieSession({
      isOpen: true,
      mode: DIALOG_MODES.EDIT,
      url: target.site_url,
      authType: AuthTypeEnum.Cookie,
      getContext: () => ({
        cookieStoreId: "firefox-container-1",
        sourceTabIncognito: true,
      }),
      applyCookie: vi.fn(),
      validationTarget: target,
    }),
  )
  await act(async () => {
    await result.current.importManually()
  })
  expect(deps.verify).toHaveBeenCalledWith(
    expect.objectContaining({
      fetchContext: {
        kind: "browser-context",
        cookieStoreId: "firefox-container-1",
        incognito: true,
      },
    }),
  )
})

it.each([
  ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid,
  ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
])("keeps the old Cookie when import validation is %s", async (status) => {
  deps.send.mockResolvedValue({ success: true, data: "session=browser" })
  deps.verify.mockResolvedValue({
    status,
    reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Verification,
  })
  const apply = vi.fn()
  const { result } = renderHook(() =>
    useAccountCookieSession({
      isOpen: true,
      mode: DIALOG_MODES.EDIT,
      url: target.site_url,
      authType: AuthTypeEnum.Cookie,
      getContext: () => ({}),
      applyCookie: apply,
      validationTarget: target,
    }),
  )
  await act(async () => {
    await result.current.importManually()
  })
  expect(apply).not.toHaveBeenCalled()
  expect(deps.error).toHaveBeenCalledWith(
    `accountDialog:cookieValidation.${status === ACCOUNT_COOKIE_VALIDATION_STATUS.Invalid ? "importInvalid" : "importUnconfirmed"}`,
  )
})

it("confirms a matching import and retains existing other-provider import behavior", async () => {
  deps.send.mockResolvedValue({ success: true, data: "session=browser" })
  deps.verify.mockResolvedValue({
    status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid,
  })
  const apply = vi.fn()
  const { result, rerender } = renderHook(
    ({ siteType }) =>
      useAccountCookieSession({
        isOpen: true,
        mode: DIALOG_MODES.EDIT,
        url: target.site_url,
        authType: AuthTypeEnum.Cookie,
        getContext: () => ({}),
        applyCookie: apply,
        validationTarget: { ...target, site_type: siteType },
      }),
    {
      initialProps: {
        siteType: SITE_TYPES.ANYROUTER as
          | typeof SITE_TYPES.ANYROUTER
          | typeof SITE_TYPES.NEW_API,
      },
    },
  )
  await act(async () => {
    await result.current.importManually()
  })
  expect(result.current.state.verifiedCookie?.cookie).toBe("session=browser")
  expect(apply).toHaveBeenCalledExactlyOnceWith("session=browser")
  deps.verify.mockClear()
  rerender({ siteType: SITE_TYPES.NEW_API })
  await act(async () => {
    await result.current.importManually()
  })
  expect(deps.verify).not.toHaveBeenCalled()
  expect(apply).toHaveBeenCalledTimes(2)
})

it.each([
  { status: "failed" },
  { status: "cancelled" },
  {
    status: "uncertain",
    verification: {
      status: ACCOUNT_COOKIE_VALIDATION_STATUS.Unavailable,
      reason: ACCOUNT_COOKIE_VALIDATION_REASONS.Permission,
    },
  },
  {
    status: "authenticated",
    identity: "18",
    credential: { cookie: "session=other" },
  },
  { status: "authenticated", identity: "17" },
])(
  "never fills a failed or incomplete login result: $status",
  async (response) => {
    deps.send.mockResolvedValue(response)
    const apply = vi.fn()
    const { result } = renderHook(() =>
      useAccountCookieSession({
        isOpen: true,
        mode: DIALOG_MODES.EDIT,
        url: target.site_url,
        authType: AuthTypeEnum.Cookie,
        getContext: () => ({}),
        applyCookie: apply,
        validationTarget: {
          ...target,
          login: {
            methodId: "password",
            credentials: { username: "user", password: "secret" },
          },
        },
      }),
    )
    await act(async () => {
      await result.current.recoverManually()
    })
    expect(apply).not.toHaveBeenCalled()
    expect(deps.send).toHaveBeenCalledTimes(1)
    expect(deps.send.mock.calls[0]?.[1]).toEqual({ maxAttempts: 1 })
    if ("verification" in response)
      expect(deps.error).toHaveBeenCalledWith(
        "accountDialog:cookieValidation.permissionRequired",
      )
  },
)

it("preserves the draft Cookie when an imported session belongs to another account", async () => {
  deps.send.mockResolvedValue({ success: true, data: "session=other" })
  deps.verify.mockResolvedValue({
    status: ACCOUNT_COOKIE_VALIDATION_STATUS.IdentityMismatch,
  })
  const apply = vi.fn()
  const { result } = renderHook(() =>
    useAccountCookieSession({
      isOpen: true,
      mode: DIALOG_MODES.EDIT,
      url: target.site_url,
      authType: AuthTypeEnum.Cookie,
      getContext: () => ({}),
      applyCookie: apply,
      validationTarget: target,
    }),
  )
  await act(async () => {
    await result.current.importManually()
  })
  expect(apply).not.toHaveBeenCalled()
  expect(deps.error).toHaveBeenCalledWith(
    "accountDialog:cookieValidation.importIdentityMismatch",
  )
})

it("fills a recovered matching session into the draft without another verification request", async () => {
  deps.send.mockResolvedValue({
    status: "authenticated",
    identity: "17",
    credential: { cookie: "session=new" },
  })
  const apply = vi.fn()
  const { result } = renderHook(() =>
    useAccountCookieSession({
      isOpen: true,
      mode: DIALOG_MODES.EDIT,
      url: target.site_url,
      authType: AuthTypeEnum.Cookie,
      getContext: () => ({}),
      applyCookie: apply,
      validationTarget: {
        ...target,
        login: {
          methodId: "password",
          credentials: { username: "user", password: "secret" },
        },
      },
    }),
  )
  await act(async () => {
    await result.current.recoverManually()
  })
  expect(apply).toHaveBeenCalledExactlyOnceWith("session=new")
  expect(deps.verify).not.toHaveBeenCalled()
  expect(result.current.state.verifiedCookie?.cookie).toBe("session=new")
})

it("does not replace a Cookie edited while login recovery is pending", async () => {
  let finish!: (response: unknown) => void
  deps.send.mockImplementation((message) =>
    message.action === RuntimeActionIds.AccountDialogCancelCookieRecovery
      ? Promise.resolve(true)
      : new Promise((resolve) => {
          finish = resolve
        }),
  )
  const apply = vi.fn()
  const { result, rerender } = renderHook(
    ({ cookie }) =>
      useAccountCookieSession({
        isOpen: true,
        mode: DIALOG_MODES.EDIT,
        url: target.site_url,
        authType: AuthTypeEnum.Cookie,
        getContext: () => ({}),
        applyCookie: apply,
        validationTarget: {
          ...target,
          cookieAuth: { sessionCookie: cookie },
          login: {
            methodId: "password",
            credentials: { username: "user", password: "secret" },
          },
        },
      }),
    { initialProps: { cookie: "session=old" } },
  )
  let recovery!: Promise<void>
  act(() => {
    recovery = result.current.recoverManually()
  })
  rerender({ cookie: "session=edited" })
  await act(async () => {
    finish({
      status: "authenticated",
      identity: "17",
      credential: { cookie: "session=new" },
    })
    await recovery
  })
  expect(apply).not.toHaveBeenCalled()
})

it("coalesces repeated recovery clicks and discards the result after the editor closes", async () => {
  let finish!: (response: unknown) => void
  deps.send.mockImplementation((message) =>
    message.action === RuntimeActionIds.AccountDialogCancelCookieRecovery
      ? Promise.resolve(true)
      : new Promise((resolve) => {
          finish = resolve
        }),
  )
  const apply = vi.fn()
  const { result, unmount } = renderHook(() =>
    useAccountCookieSession({
      isOpen: true,
      mode: DIALOG_MODES.EDIT,
      url: target.site_url,
      authType: AuthTypeEnum.Cookie,
      getContext: () => ({}),
      applyCookie: apply,
      validationTarget: {
        ...target,
        login: {
          methodId: "password",
          credentials: { username: "user", password: "secret" },
        },
      },
    }),
  )
  let first!: Promise<void>
  act(() => {
    first = result.current.recoverManually()
    void result.current.recoverManually()
  })
  expect(deps.send).toHaveBeenCalledOnce()
  unmount()
  expect(deps.send).toHaveBeenLastCalledWith(
    {
      action: RuntimeActionIds.AccountDialogCancelCookieRecovery,
      requestId: deps.send.mock.calls[0]![0].requestId,
    },
    { maxAttempts: 1 },
  )
  await act(async () => {
    finish({
      status: "authenticated",
      identity: "17",
      credential: { cookie: "session=new" },
    })
    await first
  })
  expect(apply).not.toHaveBeenCalled()
})

it("aborts pending import validation and keeps the draft after closing the editor", async () => {
  deps.send.mockResolvedValue({ success: true, data: "session=browser" })
  let finish!: (result: unknown) => void
  deps.verify.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const apply = vi.fn()
  const { result, unmount } = renderHook(() =>
    useAccountCookieSession({
      isOpen: true,
      mode: DIALOG_MODES.EDIT,
      url: target.site_url,
      authType: AuthTypeEnum.Cookie,
      getContext: () => ({}),
      applyCookie: apply,
      validationTarget: target,
    }),
  )
  let importing!: Promise<void>
  await act(async () => {
    importing = result.current.importManually()
    await Promise.resolve()
  })
  const signal = deps.verify.mock.calls[0]?.[0].abortSignal
  unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => {
    finish({ status: ACCOUNT_COOKIE_VALIDATION_STATUS.Valid })
    await importing
  })
  expect(apply).not.toHaveBeenCalled()
})

it.each([false, true])(
  "reports only current recovery failures (closed: %s)",
  async (closed) => {
    let fail!: (error: Error) => void
    deps.send.mockImplementation((message) =>
      message.action === RuntimeActionIds.AccountDialogCancelCookieRecovery
        ? Promise.resolve(true)
        : new Promise((_resolve, reject) => {
            fail = reject
          }),
    )
    const apply = vi.fn()
    const { result, unmount } = renderHook(() =>
      useAccountCookieSession({
        isOpen: true,
        mode: DIALOG_MODES.EDIT,
        url: target.site_url,
        authType: AuthTypeEnum.Cookie,
        getContext: () => ({}),
        applyCookie: apply,
        validationTarget: {
          ...target,
          login: {
            methodId: "password",
            credentials: { username: "user", password: "secret" },
          },
        },
      }),
    )
    let pending!: Promise<void>
    act(() => {
      pending = result.current.recoverManually()
    })
    if (closed) unmount()
    await act(async () => {
      fail(new Error("transport closed"))
      await pending
    })
    expect(apply).not.toHaveBeenCalled()
    if (closed) expect(deps.error).not.toHaveBeenCalled()
    else
      expect(deps.error).toHaveBeenCalledWith(
        "accountDialog:cookieValidation.recoveryFailed",
      )
  },
)

it("ignores an import validation rejection after the editor closes", async () => {
  deps.send.mockResolvedValue({ success: true, data: "session=browser" })
  let fail!: (error: Error) => void
  deps.verify.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      }),
  )
  const apply = vi.fn()
  const { result, unmount } = renderHook(() =>
    useAccountCookieSession({
      isOpen: true,
      mode: DIALOG_MODES.EDIT,
      url: target.site_url,
      authType: AuthTypeEnum.Cookie,
      getContext: () => ({}),
      applyCookie: apply,
      validationTarget: target,
    }),
  )
  let pending!: Promise<void>
  await act(async () => {
    pending = result.current.importManually()
    await Promise.resolve()
  })
  unmount()
  await act(async () => {
    fail(new Error("validation aborted"))
    await pending
  })
  expect(apply).not.toHaveBeenCalled()
  expect(deps.error).not.toHaveBeenCalled()
})
