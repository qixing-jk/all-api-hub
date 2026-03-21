import { act, renderHook, waitFor } from "@testing-library/react"
import toast from "react-hot-toast"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  NEW_API_MANAGED_VERIFICATION_STEPS,
  useNewApiManagedVerification,
} from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { NEW_API_MANAGED_SESSION_STATUSES } from "~/services/managedSites/providers/newApiSession"

const {
  ensureNewApiManagedSessionMock,
  submitNewApiLoginTwoFactorCodeMock,
  submitNewApiSecureVerificationCodeMock,
} = vi.hoisted(() => ({
  ensureNewApiManagedSessionMock: vi.fn(),
  submitNewApiLoginTwoFactorCodeMock: vi.fn(),
  submitNewApiSecureVerificationCodeMock: vi.fn(),
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
