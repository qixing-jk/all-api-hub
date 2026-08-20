import { beforeEach, describe, expect, it, vi } from "vitest"

import { useNewApiNativeSecretVerification } from "~/features/ManagedSiteChannels/hooks/useNewApiNativeSecretVerification"
import {
  MANAGED_RESOURCE_FAILURE_CODES,
  MANAGED_RESOURCE_FAILURE_RECOVERY_HINTS,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { act, renderHook, waitFor } from "~~/tests/test-utils/render"

const mocks = vi.hoisted(() => ({
  closeDialog: vi.fn(),
  openNewApiManagedVerification: vi.fn(),
}))

vi.mock(
  "~/features/ManagedSiteVerification/useNewApiManagedVerification",
  () => ({
    NEW_API_MANAGED_VERIFICATION_CLOSE_MODES: {
      CLOSE_AFTER_CALLBACK: "close-after-callback",
    },
    useNewApiManagedVerification: () => ({
      dialogState: {
        isOpen: false,
        request: null,
        code: "",
        isBusy: false,
      },
      closeDialog: mocks.closeDialog,
      openNewApiManagedVerification: mocks.openNewApiManagedVerification,
      setCode: vi.fn(),
      openBaseUrl: vi.fn(),
      submitCode: vi.fn(),
      retryVerification: vi.fn(),
      patchRequestConfig: vi.fn(),
    }),
  }),
)

const config = {
  baseUrl: "https://new-api.example.invalid",
  adminToken: "admin-token",
  userId: "42",
  username: "admin",
  password: "password",
  totpSecret: "",
}

const permissionFailure = () =>
  new ManagedResourceError({
    code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
  })

const verificationRequiredFailure = () =>
  new ManagedResourceError({
    code: MANAGED_RESOURCE_FAILURE_CODES.PermissionDenied,
    recoveryHint:
      MANAGED_RESOURCE_FAILURE_RECOVERY_HINTS.InteractiveVerification,
  })

const renderOptions = {
  withUserPreferencesProvider: false,
  withThemeProvider: false,
}

describe("useNewApiNativeSecretVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("retries a provider secret read after interactive verification", async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(verificationRequiredFailure())
      .mockResolvedValueOnce("saved-secret")
    const { result } = renderHook(
      () => useNewApiNativeSecretVerification({ enabled: true, config }),
      renderOptions,
    )

    const pending = result.current.runVerifiedRead(read, "Example channel")
    await waitFor(() =>
      expect(mocks.openNewApiManagedVerification).toHaveBeenCalledOnce(),
    )
    const request = mocks.openNewApiManagedVerification.mock.calls[0][0]

    await act(async () => {
      await request.onVerified()
    })

    await expect(pending).resolves.toBe("saved-secret")
    expect(read).toHaveBeenCalledTimes(2)
    expect(request).toMatchObject({
      kind: "channel",
      label: "Example channel",
      config,
      closeMode: "close-after-callback",
    })
  })

  it("does not open provider verification for unrelated failures", async () => {
    const failure = new Error("upstream unavailable")
    const { result } = renderHook(
      () => useNewApiNativeSecretVerification({ enabled: true, config }),
      renderOptions,
    )

    await expect(
      result.current.runVerifiedRead(async () => {
        throw failure
      }, "Example channel"),
    ).rejects.toBe(failure)
    expect(mocks.openNewApiManagedVerification).not.toHaveBeenCalled()
  })

  it("does not interpret ordinary permission denial as interactive verification", async () => {
    const failure = permissionFailure()
    const { result } = renderHook(
      () => useNewApiNativeSecretVerification({ enabled: true, config }),
      renderOptions,
    )

    await expect(
      result.current.runVerifiedRead(async () => {
        throw failure
      }, "Example channel"),
    ).rejects.toBe(failure)
    expect(mocks.openNewApiManagedVerification).not.toHaveBeenCalled()
  })

  it("rejects an already-aborted read without opening verification", async () => {
    const controller = new AbortController()
    const abortReason = new DOMException("Request cancelled", "AbortError")
    controller.abort(abortReason)
    const { result } = renderHook(
      () => useNewApiNativeSecretVerification({ enabled: true, config }),
      renderOptions,
    )

    await expect(
      result.current.runVerifiedRead(
        async () => {
          throw verificationRequiredFailure()
        },
        "Example channel",
        controller.signal,
      ),
    ).rejects.toBe(abortReason)
    expect(mocks.openNewApiManagedVerification).not.toHaveBeenCalled()
  })

  it("rejects a pending read when its signal is aborted", async () => {
    const controller = new AbortController()
    const abortReason = new DOMException("Request cancelled", "AbortError")
    const { result } = renderHook(
      () => useNewApiNativeSecretVerification({ enabled: true, config }),
      renderOptions,
    )
    const pending = result.current.runVerifiedRead(
      async () => {
        throw verificationRequiredFailure()
      },
      "Example channel",
      controller.signal,
    )
    await waitFor(() =>
      expect(mocks.openNewApiManagedVerification).toHaveBeenCalledOnce(),
    )

    act(() => controller.abort(abortReason))

    await expect(pending).rejects.toBe(abortReason)
  })

  it("supersedes an older pending verification read", async () => {
    const { result } = renderHook(
      () => useNewApiNativeSecretVerification({ enabled: true, config }),
      renderOptions,
    )
    const firstPending = result.current.runVerifiedRead(async () => {
      throw verificationRequiredFailure()
    }, "First channel")
    await waitFor(() =>
      expect(mocks.openNewApiManagedVerification).toHaveBeenCalledOnce(),
    )

    const secondPending = result.current.runVerifiedRead(async () => {
      throw verificationRequiredFailure()
    }, "Second channel")

    await expect(firstPending).rejects.toMatchObject({
      name: "AbortError",
      message: "Superseded",
    })
    await waitFor(() =>
      expect(mocks.openNewApiManagedVerification).toHaveBeenCalledTimes(2),
    )
    expect(mocks.closeDialog).toHaveBeenCalledOnce()

    act(() => result.current.closeVerification())
    await expect(secondPending).rejects.toMatchObject({ name: "AbortError" })
  })

  it("rejects a pending verification read when the hook unmounts", async () => {
    const { result, unmount } = renderHook(
      () => useNewApiNativeSecretVerification({ enabled: true, config }),
      renderOptions,
    )
    const pending = result.current.runVerifiedRead(async () => {
      throw verificationRequiredFailure()
    }, "Example channel")
    await waitFor(() =>
      expect(mocks.openNewApiManagedVerification).toHaveBeenCalledOnce(),
    )

    unmount()

    await expect(pending).rejects.toMatchObject({
      name: "AbortError",
      message: "Unmounted",
    })
  })

  it("propagates a failed retry to the verification callback and pending read", async () => {
    const retryFailure = new Error("secret still unavailable")
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(verificationRequiredFailure())
      .mockRejectedValueOnce(retryFailure)
    const { result } = renderHook(
      () => useNewApiNativeSecretVerification({ enabled: true, config }),
      renderOptions,
    )
    const pending = result.current.runVerifiedRead(read, "Example channel")
    await waitFor(() =>
      expect(mocks.openNewApiManagedVerification).toHaveBeenCalledOnce(),
    )
    const request = mocks.openNewApiManagedVerification.mock.calls[0][0]
    const pendingRejection = expect(pending).rejects.toBe(retryFailure)

    await expect(request.onVerified()).rejects.toBe(retryFailure)
    await pendingRejection
    expect(read).toHaveBeenCalledTimes(2)
  })

  it("rejects the pending read when the verification dialog is cancelled", async () => {
    const { result } = renderHook(
      () => useNewApiNativeSecretVerification({ enabled: true, config }),
      renderOptions,
    )
    const pending = result.current.runVerifiedRead(async () => {
      throw verificationRequiredFailure()
    }, "Example channel")
    await waitFor(() =>
      expect(mocks.openNewApiManagedVerification).toHaveBeenCalledOnce(),
    )

    act(() => result.current.closeVerification())

    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(mocks.closeDialog).toHaveBeenCalledOnce()
  })
})
