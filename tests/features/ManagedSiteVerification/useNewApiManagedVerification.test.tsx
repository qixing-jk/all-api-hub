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
        kind: "token",
        label: "Token A",
        config: {
          baseUrl: "https://managed.example",
          userId: "1",
          username: "admin",
          password: "secret",
          totpSecret: "",
        },
        onVerified,
      })
    })

    await waitFor(() => {
      expect(onVerified).toHaveBeenCalledTimes(1)
      expect(toast.success).toHaveBeenCalledTimes(1)
      expect(result.current.dialogState.isOpen).toBe(false)
      expect(result.current.dialogState.step).toBe(
        NEW_API_MANAGED_VERIFICATION_STEPS.LOGGING_IN,
      )
    })
  })
})
