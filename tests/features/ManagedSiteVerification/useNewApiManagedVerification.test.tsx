import { act, renderHook, waitFor } from "@testing-library/react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  NEW_API_MANAGED_VERIFICATION_CLOSE_MODES,
  NEW_API_MANAGED_VERIFICATION_STEPS,
  useNewApiManagedVerification,
} from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { NEW_API_MANAGED_SESSION_STATUSES } from "~/services/managedSites/providers/newApiSession"

const {
  ensureNewApiManagedSessionMock,
  submitNewApiLoginTwoFactorCodeMock,
  submitNewApiSecureVerificationCodeMock,
  createTabMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  ensureNewApiManagedSessionMock: vi.fn(),
  submitNewApiLoginTwoFactorCodeMock: vi.fn(),
  submitNewApiSecureVerificationCodeMock: vi.fn(),
  createTabMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}))

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/services/managedSites/providers/newApiSession", async () => {
  return {
    NEW_API_MANAGED_SESSION_STATUSES: {
      VERIFIED: "verified",
      CREDENTIALS_MISSING: "credentials-missing",
      LOGIN_2FA_REQUIRED: "login-2fa-required",
      SECURE_VERIFICATION_REQUIRED: "secure-verification-required",
      PASSKEY_MANUAL_REQUIRED: "passkey-manual-required",
    },
    ensureNewApiManagedSession: (...args: unknown[]) =>
      ensureNewApiManagedSessionMock(...args),
    submitNewApiLoginTwoFactorCode: (...args: unknown[]) =>
      submitNewApiLoginTwoFactorCodeMock(...args),
    submitNewApiSecureVerificationCode: (...args: unknown[]) =>
      submitNewApiSecureVerificationCodeMock(...args),
  }
})

vi.mock("~/utils/browser/browserApi", () => ({
  createTab: (...args: unknown[]) => createTabMock(...args),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}))

const BASE_REQUEST = {
  kind: "token" as const,
  label: "Token A",
  config: {
    baseUrl: "https://managed.example",
    userId: "1",
    username: "admin",
    password: "  secret  ",
    totpSecret: "",
  },
}

describe("useNewApiManagedVerification", () => {
  beforeEach(() => {
    ensureNewApiManagedSessionMock.mockReset()
    submitNewApiLoginTwoFactorCodeMock.mockReset()
    submitNewApiSecureVerificationCodeMock.mockReset()
    createTabMock.mockReset()
    loggerWarnMock.mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it("shows a success toast and closes the dialog after a verified token retry", async () => {
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
    })
    const onVerified = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        onVerified,
      })
    })

    await waitFor(() => {
      expect(ensureNewApiManagedSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          password: "  secret  ",
        }),
      )
      expect(onVerified).toHaveBeenCalledTimes(1)
      expect(toast.success).toHaveBeenCalledTimes(1)
      expect(result.current.dialogState.isOpen).toBe(false)
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.LOGGING_IN,
      )
    })
  })

  it("opens the credentials-missing step without calling onVerified", async () => {
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING,
    })

    const onVerified = vi.fn()
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        onVerified,
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.isOpen).toBe(true)
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.CREDENTIALS_MISSING,
      )
      expect(onVerified).not.toHaveBeenCalled()
    })
  })

  it("opens the login-2fa step when the session requires a login code", async () => {
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
      automaticAttempted: false,
    })

    const onVerified = vi.fn()
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        onVerified,
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.isOpen).toBe(true)
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA,
      )
      expect(onVerified).not.toHaveBeenCalled()
    })
  })

  it("uses configured TOTP before showing a prefetched login-2fa step", async () => {
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
    })

    const onVerified = vi.fn()
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        config: {
          ...BASE_REQUEST.config,
          totpSecret: "JBSWY3DPEHPK3PXP",
        },
        onVerified,
        initialSessionResult: {
          status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
          automaticAttempted: false,
        },
      })
    })

    await waitFor(() => {
      expect(ensureNewApiManagedSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          totpSecret: "JBSWY3DPEHPK3PXP",
        }),
      )
      expect(onVerified).toHaveBeenCalledTimes(1)
      expect(result.current.dialogState.isOpen).toBe(false)
    })
  })

  it("uses configured TOTP before showing a prefetched secure-verification step", async () => {
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
    })

    const onVerified = vi.fn()
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        config: {
          ...BASE_REQUEST.config,
          totpSecret: "JBSWY3DPEHPK3PXP",
        },
        onVerified,
        initialSessionResult: {
          status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
          methods: {
            twoFactorEnabled: true,
            passkeyEnabled: false,
          },
          automaticAttempted: false,
        },
      })
    })

    await waitFor(() => {
      expect(ensureNewApiManagedSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          totpSecret: "JBSWY3DPEHPK3PXP",
        }),
      )
      expect(onVerified).toHaveBeenCalledTimes(1)
      expect(result.current.dialogState.isOpen).toBe(false)
    })
  })

  it("retries with patched request config after inline quick updates", async () => {
    ensureNewApiManagedSessionMock
      .mockResolvedValueOnce({
        status: NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING,
      })
      .mockResolvedValueOnce({
        status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
        automaticAttempted: false,
      })

    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification(BASE_REQUEST)
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.CREDENTIALS_MISSING,
      )
    })

    act(() => {
      result.current.patchRequestConfig({
        username: "updated-user",
        password: "updated-pass",
      })
    })

    act(() => {
      void result.current.retryVerification()
    })

    await waitFor(() => {
      expect(ensureNewApiManagedSessionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          username: "updated-user",
          password: "updated-pass",
        }),
      )
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA,
      )
    })
  })

  it("uses the patched config even when retry starts in the same act", async () => {
    ensureNewApiManagedSessionMock
      .mockResolvedValueOnce({
        status: NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING,
      })
      .mockResolvedValueOnce({
        status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
        automaticAttempted: false,
      })

    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification(BASE_REQUEST)
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.CREDENTIALS_MISSING,
      )
    })

    act(() => {
      result.current.patchRequestConfig({
        username: "same-act-user",
        password: "same-act-pass",
      })
      void result.current.retryVerification()
    })

    await waitFor(() => {
      expect(ensureNewApiManagedSessionMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          username: "same-act-user",
          password: "same-act-pass",
        }),
      )
    })
  })

  it("opens the secure-verification step when login succeeded but verification is still required", async () => {
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
      automaticAttempted: false,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
    })

    const onVerified = vi.fn()
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        onVerified,
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.isOpen).toBe(true)
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.SECURE_VERIFICATION,
      )
      expect(onVerified).not.toHaveBeenCalled()
    })
  })

  it("reuses a prefetched session result instead of re-running the initial session check", async () => {
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        initialSessionResult: {
          status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
          automaticAttempted: false,
          methods: {
            twoFactorEnabled: true,
            passkeyEnabled: false,
          },
        },
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.SECURE_VERIFICATION,
      )
    })

    expect(ensureNewApiManagedSessionMock).not.toHaveBeenCalled()
  })

  it("keeps the open trigger stable across verification state changes", async () => {
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
      automaticAttempted: false,
    })

    const { result } = renderHook(() => useNewApiManagedVerification())
    const initialOpen = result.current.openNewApiManagedVerification

    act(() => {
      result.current.openNewApiManagedVerification(BASE_REQUEST)
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA,
      )
    })

    expect(result.current.openNewApiManagedVerification).toBe(initialOpen)
  })

  it("deduplicates repeated opens for the same managed-site origin while verification is active", async () => {
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
      automaticAttempted: false,
    })

    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification(BASE_REQUEST)
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        label: "Token B",
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA,
      )
    })

    expect(ensureNewApiManagedSessionMock).toHaveBeenCalledTimes(1)
  })

  it("opens the passkey-manual step when passkey verification is required", async () => {
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.PASSKEY_MANUAL_REQUIRED,
      methods: {
        twoFactorEnabled: false,
        passkeyEnabled: true,
      },
    })

    const onVerified = vi.fn()
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        onVerified,
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.isOpen).toBe(true)
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.PASSKEY_MANUAL,
      )
      expect(onVerified).not.toHaveBeenCalled()
    })
  })

  it("opens the failure step immediately when a localized failure message is prefetched", async () => {
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        initialFailureMessage: "messages:background.windowCreationUnavailable",
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
      )
      expect(result.current.dialogState.errorMessage).toBe(
        "messages:background.windowCreationUnavailable",
      )
    })

    expect(ensureNewApiManagedSessionMock).not.toHaveBeenCalled()
  })

  it("fails immediately when the managed base URL is missing and does not attempt to open it", async () => {
    const windowOpenSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null as any)

    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        config: {
          ...BASE_REQUEST.config,
          baseUrl: "   ",
        },
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
      )
      expect(result.current.dialogState.errorMessage).toBe(
        "newApiManagedVerification:dialog.messages.missingBaseUrl",
      )
    })

    await act(async () => {
      await result.current.openBaseUrl()
    })

    expect(ensureNewApiManagedSessionMock).not.toHaveBeenCalled()
    expect(createTabMock).not.toHaveBeenCalled()
    expect(windowOpenSpy).not.toHaveBeenCalled()

    windowOpenSpy.mockRestore()
  })

  it("falls back to window.open when opening the managed base URL in a browser tab fails", async () => {
    createTabMock.mockRejectedValueOnce(new Error("popup blocked"))

    const windowOpenSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null as any)

    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        initialFailureMessage: "messages:background.windowCreationUnavailable",
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
      )
    })

    await act(async () => {
      await result.current.openBaseUrl()
    })

    expect(createTabMock).toHaveBeenCalledWith("https://managed.example", true)
    expect(windowOpenSpy).toHaveBeenCalledWith(
      "https://managed.example",
      "_blank",
      "noopener,noreferrer",
    )

    windowOpenSpy.mockRestore()
  })

  it("submits secure verification codes and keeps returned inline guidance", async () => {
    submitNewApiSecureVerificationCodeMock.mockResolvedValueOnce({
      status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
      errorMessage: "verification code still pending",
      automaticAttempted: false,
      methods: {
        twoFactorEnabled: true,
        passkeyEnabled: false,
      },
    })

    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        initialSessionResult: {
          status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
          errorMessage: "check your inbox",
          automaticAttempted: false,
          methods: {
            twoFactorEnabled: true,
            passkeyEnabled: false,
          },
        },
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.SECURE_VERIFICATION,
      )
      expect(result.current.dialogState.errorMessage).toBe("check your inbox")
    })

    act(() => {
      result.current.setCode(" 654321 ")
    })

    act(() => {
      void result.current.submitCode()
    })

    await waitFor(() => {
      expect(submitNewApiSecureVerificationCodeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: "https://managed.example",
        }),
        "654321",
      )
      expect(result.current.dialogState.errorMessage).toBe(
        "verification code still pending",
      )
      expect(result.current.dialogState.code).toBe("")
    })
  })

  it("shows a missing-code error instead of submitting an empty secure verification code", async () => {
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        initialSessionResult: {
          status: NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED,
          automaticAttempted: false,
          methods: {
            twoFactorEnabled: true,
            passkeyEnabled: false,
          },
        },
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.SECURE_VERIFICATION,
      )
    })

    act(() => {
      void result.current.submitCode()
    })

    await waitFor(() => {
      expect(result.current.dialogState.errorMessage).toBe(
        "newApiManagedVerification:dialog.messages.missingCode",
      )
    })

    expect(submitNewApiSecureVerificationCodeMock).not.toHaveBeenCalled()
  })

  it("ignores submit, retry, and patch actions before a verification request exists", async () => {
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      void result.current.submitCode()
      void result.current.retryVerification()
      result.current.patchRequestConfig({
        username: "should-not-apply",
      })
    })

    await act(async () => {
      await result.current.openBaseUrl()
    })

    expect(ensureNewApiManagedSessionMock).not.toHaveBeenCalled()
    expect(submitNewApiLoginTwoFactorCodeMock).not.toHaveBeenCalled()
    expect(submitNewApiSecureVerificationCodeMock).not.toHaveBeenCalled()
    expect(createTabMock).not.toHaveBeenCalled()
    expect(result.current.dialogState).toMatchObject({
      isOpen: false,
      code: "",
      request: null,
    })
  })

  it("runs the channel onVerified flow before showing the success toast when configured to wait", async () => {
    const onVerified = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        kind: "channel",
        label: "Channel A",
        onVerified,
        closeMode:
          NEW_API_MANAGED_VERIFICATION_CLOSE_MODES.CLOSE_AFTER_CALLBACK,
        initialSessionResult: {
          status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
          methods: {
            twoFactorEnabled: true,
            passkeyEnabled: false,
          },
        },
      })
    })

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledTimes(1)
      expect(toast.success).toHaveBeenCalledTimes(1)
      expect(result.current.dialogState.isOpen).toBe(false)
    })
  })

  it("shows the finishing busy state while settings verification waits for onVerified", async () => {
    let resolveVerified: (() => void) | null = null
    const onVerified = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveVerified = resolve
        }),
    )

    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        kind: "settings",
        onVerified,
        closeMode:
          NEW_API_MANAGED_VERIFICATION_CLOSE_MODES.CLOSE_AFTER_CALLBACK,
        initialSessionResult: {
          status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
          methods: {
            twoFactorEnabled: true,
            passkeyEnabled: false,
          },
        },
      })
    })

    await waitFor(() => {
      expect(result.current.dialogState.isBusy).toBe(true)
      expect(result.current.dialogState.busyMessage).toBe(
        "newApiManagedVerification:dialog.messages.finishing",
      )
      expect(onVerified).toHaveBeenCalledTimes(1)
    })

    act(() => {
      resolveVerified?.()
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
      expect(result.current.dialogState.isOpen).toBe(false)
    })
  })

  it("closes immediately after verification by default while onVerified continues", async () => {
    let resolveVerified: (() => void) | null = null
    const onVerified = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveVerified = resolve
        }),
    )

    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        kind: "channel",
        onVerified,
        initialSessionResult: {
          status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
          methods: {
            twoFactorEnabled: true,
            passkeyEnabled: false,
          },
        },
      })
    })

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledTimes(1)
      expect(toast.success).toHaveBeenCalledTimes(1)
      expect(result.current.dialogState.isOpen).toBe(false)
    })

    act(() => {
      resolveVerified?.()
    })
  })

  it("logs background onVerified failures after closing immediately", async () => {
    const error = new Error("callback failed")
    const onVerified = vi.fn().mockRejectedValue(error)
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        kind: "channel",
        onVerified,
        initialSessionResult: {
          status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
          methods: {
            twoFactorEnabled: true,
            passkeyEnabled: false,
          },
        },
      })
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
      expect(result.current.dialogState.isOpen).toBe(false)
    })
    await waitFor(() => {
      expect(loggerWarnMock).toHaveBeenCalledWith(
        "New API managed verification onVerified failed",
        {
          kind: "channel",
          error,
        },
      )
      expect(toast.error).toHaveBeenCalledTimes(1)
    })
  })

  it("shows the settings success state without requiring a follow-up callback", async () => {
    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification({
        ...BASE_REQUEST,
        kind: "settings",
        initialSessionResult: {
          status: NEW_API_MANAGED_SESSION_STATUSES.VERIFIED,
          methods: {
            twoFactorEnabled: true,
            passkeyEnabled: false,
          },
        },
      })
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledTimes(1)
      expect(result.current.dialogState.isOpen).toBe(false)
    })
  })

  it("maps unsupported temp-window errors to localized verification guidance", async () => {
    ensureNewApiManagedSessionMock.mockRejectedValue(
      new ApiError(
        "raw browser window error",
        undefined,
        undefined,
        API_ERROR_CODES.TEMP_WINDOW_WINDOW_CREATION_UNAVAILABLE,
      ),
    )

    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification(BASE_REQUEST)
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
      )
      expect(result.current.dialogState.errorMessage).toBe(
        "messages:background.windowCreationUnavailable",
      )
    })
  })

  it("clears the one-time code after a failed submit", async () => {
    ensureNewApiManagedSessionMock.mockResolvedValue({
      status: NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED,
      automaticAttempted: false,
    })
    submitNewApiLoginTwoFactorCodeMock.mockRejectedValue(
      new Error("invalid code"),
    )

    const { result } = renderHook(() => useNewApiManagedVerification())

    act(() => {
      result.current.openNewApiManagedVerification(BASE_REQUEST)
    })

    await waitFor(() => {
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA,
      )
    })

    act(() => {
      result.current.setCode("123456")
    })

    act(() => {
      result.current.submitCode()
    })

    await waitFor(() => {
      expect(result.current.dialogState.errorMessage).toBe("invalid code")
      expect(result.current.dialogState.code).toBe("")
    })
  })
})
