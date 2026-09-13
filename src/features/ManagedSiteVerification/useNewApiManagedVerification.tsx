import type { TFunction } from "i18next"
import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import { cleanupNewApiOwnedSession } from "~/services/managedSites/newApiOwnedSession/client"
import {
  ensureNewApiManagedSession,
  NEW_API_MANAGED_SESSION_STATUSES,
  submitNewApiLoginTwoFactorCode,
  submitNewApiSecureVerificationCode,
  type EnsureNewApiManagedSessionResult,
} from "~/services/managedSites/providers/newApiSession"
import type { NewApiConfig } from "~/types/newApiConfig"
import { createTab } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"
import { t } from "~/utils/i18n/core"

import {
  getNewApiManagedVerificationErrorMessage,
  getNewApiManagedVerificationFailure,
  presentNewApiManagedVerificationFailure,
  type NewApiManagedVerificationFailure,
} from "./errorMessages"

const logger = createLogger("NewApiManagedVerification")

export const NEW_API_MANAGED_VERIFICATION_STEPS = {
  LOGGING_IN: "logging-in",
  CREDENTIALS_MISSING: "credentials-missing",
  LOGIN_2FA: "login-2fa",
  SECURE_VERIFICATION: "secure-verification",
  PASSKEY_MANUAL: "passkey-manual",
  SESSION_ACTIVE_LIMIT: "session-active-limit",
  SESSION_ACTIVE_LIMIT_CLEANUP: "session-active-limit-cleanup",
  SESSION_ISSUANCE_LIMIT: "session-issuance-limit",
  SUCCESS: "success",
  FAILURE: "failure",
} as const

export const NEW_API_MANAGED_VERIFICATION_CLOSE_MODES = {
  CLOSE_AFTER_CALLBACK: "close-after-callback",
  CLOSE_AFTER_VERIFICATION: "close-after-verification",
} as const

export type NewApiManagedVerificationStep =
  (typeof NEW_API_MANAGED_VERIFICATION_STEPS)[keyof typeof NEW_API_MANAGED_VERIFICATION_STEPS]

export type NewApiManagedVerificationCloseMode =
  (typeof NEW_API_MANAGED_VERIFICATION_CLOSE_MODES)[keyof typeof NEW_API_MANAGED_VERIFICATION_CLOSE_MODES]

export interface OpenNewApiManagedVerificationParams {
  kind: "settings" | "token" | "channel"
  config: Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  > & { channelId?: number }
  label?: string
  onVerified?: () => Promise<void> | void
  closeMode?: NewApiManagedVerificationCloseMode
  initialSessionResult?: EnsureNewApiManagedSessionResult
  initialFailure?: NewApiManagedVerificationFailure
}

export type NewApiManagedVerificationConfigUpdate = Partial<
  Pick<NewApiConfig, "baseUrl" | "username" | "password" | "totpSecret">
>

type StoredNewApiManagedVerificationRequest = Omit<
  OpenNewApiManagedVerificationParams,
  "initialFailure" | "initialSessionResult"
>

type VerificationBusyPhase =
  | "starting"
  | "submitting"
  | "cleanup"
  | "refreshing-token"
  | "refreshing-channel"
  | "finishing"
type VerificationFailure =
  | NewApiManagedVerificationFailure
  | { kind: "missing-base-url" | "missing-code" | "cleanup-failed" }

/** Renders the current operation phase without affecting the verification lifecycle. */
function presentBusyPhase(
  phase: VerificationBusyPhase | undefined,
  t: TFunction,
) {
  switch (phase) {
    case "starting":
      return t("newApiManagedVerification:dialog.messages.starting")
    case "submitting":
      return t("newApiManagedVerification:dialog.messages.submitting")
    case "cleanup":
      return t("newApiManagedVerification:dialog.messages.cleaningOwnedSession")
    case "refreshing-token":
      return t("newApiManagedVerification:dialog.messages.refreshingToken")
    case "refreshing-channel":
      return t("newApiManagedVerification:dialog.messages.refreshingChannel")
    case "finishing":
      return t("newApiManagedVerification:dialog.messages.finishing")
    default:
      return undefined
  }
}

/** Renders local validation or a sanitized provider failure. */
function presentFailure(
  failure: VerificationFailure | undefined,
  t: TFunction,
) {
  if (!failure) return undefined
  switch (failure.kind) {
    case "missing-base-url":
      return t("newApiManagedVerification:dialog.messages.missingBaseUrl")
    case "missing-code":
      return t("newApiManagedVerification:dialog.messages.missingCode")
    case "cleanup-failed":
      return t(
        "newApiManagedVerification:dialog.messages.ownedSessionCleanupFailed",
      )
    default:
      return presentNewApiManagedVerificationFailure(failure, t)
  }
}

interface NewApiManagedVerificationState {
  isOpen: boolean
  step: NewApiManagedVerificationStep
  isBusy: boolean
  busyPhase?: VerificationBusyPhase
  code: string
  failure?: VerificationFailure
  request: StoredNewApiManagedVerificationRequest | null
}

const INITIAL_STATE: NewApiManagedVerificationState = {
  isOpen: false,
  step: NEW_API_MANAGED_VERIFICATION_STEPS.LOGGING_IN,
  isBusy: false,
  busyPhase: undefined,
  code: "",
  failure: undefined,
  request: null,
}

const normalizeConfig = (
  config: Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  > & { channelId?: number },
) => ({
  ...(config.channelId ? { channelId: config.channelId } : {}),
  baseUrl: config.baseUrl.trim(),
  userId: config.userId?.trim() ?? "",
  username: config.username?.trim() ?? "",
  password: config.password ?? "",
  totpSecret: config.totpSecret?.trim() ?? "",
})

const createStoredRequest = (
  request: OpenNewApiManagedVerificationParams,
): StoredNewApiManagedVerificationRequest => ({
  kind: request.kind,
  label: request.label,
  onVerified: request.onVerified,
  closeMode:
    request.closeMode ??
    NEW_API_MANAGED_VERIFICATION_CLOSE_MODES.CLOSE_AFTER_VERIFICATION,
  config: normalizeConfig(request.config),
})

const mapSessionResultToStep = (
  result: EnsureNewApiManagedSessionResult,
): NewApiManagedVerificationStep => {
  switch (result.status) {
    case NEW_API_MANAGED_SESSION_STATUSES.CREDENTIALS_MISSING:
      return NEW_API_MANAGED_VERIFICATION_STEPS.CREDENTIALS_MISSING
    case NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED:
      return NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA
    case NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED:
      return NEW_API_MANAGED_VERIFICATION_STEPS.SECURE_VERIFICATION
    case NEW_API_MANAGED_SESSION_STATUSES.PASSKEY_MANUAL_REQUIRED:
      return NEW_API_MANAGED_VERIFICATION_STEPS.PASSKEY_MANUAL
    case NEW_API_MANAGED_SESSION_STATUSES.SESSION_ACTIVE_LIMIT:
      return result.cleanupAvailable
        ? NEW_API_MANAGED_VERIFICATION_STEPS.SESSION_ACTIVE_LIMIT_CLEANUP
        : NEW_API_MANAGED_VERIFICATION_STEPS.SESSION_ACTIVE_LIMIT
    case NEW_API_MANAGED_SESSION_STATUSES.SESSION_ISSUANCE_LIMIT:
      return NEW_API_MANAGED_VERIFICATION_STEPS.SESSION_ISSUANCE_LIMIT
    case NEW_API_MANAGED_SESSION_STATUSES.VERIFIED:
    default:
      return NEW_API_MANAGED_VERIFICATION_STEPS.SUCCESS
  }
}

const shouldRetryInitialSessionWithAutomaticTotp = (
  result: EnsureNewApiManagedSessionResult | undefined,
  config: Pick<NewApiConfig, "totpSecret">,
) => {
  if (!result || !config.totpSecret?.trim()) {
    return false
  }

  if (
    result.status === NEW_API_MANAGED_SESSION_STATUSES.LOGIN_2FA_REQUIRED &&
    !result.automaticAttempted
  ) {
    return true
  }

  return (
    result.status ===
      NEW_API_MANAGED_SESSION_STATUSES.SECURE_VERIFICATION_REQUIRED &&
    result.methods.twoFactorEnabled &&
    !result.automaticAttempted
  )
}

/**
 * Controls the reusable New API verification dialog state and wires it to the
 * provider-local session helper used by Settings and Key Management.
 */
export function useNewApiManagedVerification() {
  const { t: translate } = useTranslation([
    "newApiManagedVerification",
    "messages",
  ])
  const [state, setState] =
    useState<NewApiManagedVerificationState>(INITIAL_STATE)
  const activeRequestScopeRef = useRef<string | null>(null)
  const requestRef = useRef<StoredNewApiManagedVerificationRequest | null>(null)

  const closeDialog = useCallback(() => {
    activeRequestScopeRef.current = null
    requestRef.current = null
    setState(INITIAL_STATE)
  }, [])

  const openBaseUrl = useCallback(async () => {
    const baseUrl = state.request?.config.baseUrl?.trim()
    if (!baseUrl) return

    try {
      await createTab(baseUrl, true)
    } catch {
      window.open(baseUrl, "_blank", "noopener,noreferrer")
    }
  }, [state.request?.config.baseUrl])

  const showSuccessToast = useCallback(
    (request: StoredNewApiManagedVerificationRequest) => {
      const message =
        request.kind === "token"
          ? t("newApiManagedVerification:dialog.body.successToken", {
              label: request.label ?? "",
            })
          : request.kind === "channel"
            ? t("newApiManagedVerification:dialog.body.successChannel", {
                label: request.label ?? "",
              })
            : t("newApiManagedVerification:dialog.body.successSettings")

      toast.success(message)
    },
    [],
  )

  const finishVerifiedFlow = useCallback(
    async (request: StoredNewApiManagedVerificationRequest) => {
      const shouldWaitForVerifiedCallback =
        request.closeMode !==
        NEW_API_MANAGED_VERIFICATION_CLOSE_MODES.CLOSE_AFTER_VERIFICATION

      if (request.onVerified && shouldWaitForVerifiedCallback) {
        setState((prev) => ({
          ...prev,
          isBusy: true,
          busyPhase:
            request.kind === "token"
              ? "refreshing-token"
              : request.kind === "channel"
                ? "refreshing-channel"
                : "finishing",
        }))

        await Promise.resolve(request.onVerified())
      } else if (request.onVerified) {
        void Promise.resolve(request.onVerified()).catch((error) => {
          logger.warn("New API managed verification onVerified failed", {
            kind: request.kind,
            error,
          })
          toast.error(getNewApiManagedVerificationErrorMessage(error))
        })
      }

      showSuccessToast(request)
      closeDialog()
    },
    [closeDialog, showSuccessToast],
  )

  const applySessionResult = useCallback(
    async (
      request: StoredNewApiManagedVerificationRequest,
      result: EnsureNewApiManagedSessionResult,
    ) => {
      if (result.status === NEW_API_MANAGED_SESSION_STATUSES.VERIFIED) {
        await finishVerifiedFlow(request)
        return
      }

      setState((prev) => ({
        ...prev,
        step: mapSessionResultToStep(result),
        isBusy: false,
        busyPhase: undefined,
        failure:
          "errorMessage" in result && result.errorMessage
            ? { kind: "message", message: result.errorMessage }
            : undefined,
        code: "",
      }))
    },
    [finishVerifiedFlow],
  )

  const runInitialFlow = useCallback(
    async (request: OpenNewApiManagedVerificationParams) => {
      const normalizedRequest = createStoredRequest(request)
      const initialSessionResult = request.initialSessionResult
      requestRef.current = normalizedRequest

      if (!normalizedRequest.config.baseUrl) {
        setState({
          isOpen: true,
          step: NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
          isBusy: false,
          busyPhase: undefined,
          code: "",
          failure: { kind: "missing-base-url" },
          request: normalizedRequest,
        })
        return
      }

      if (request.initialFailure) {
        setState({
          isOpen: true,
          step: NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
          isBusy: false,
          busyPhase: undefined,
          code: "",
          failure: request.initialFailure,
          request: normalizedRequest,
        })
        return
      }

      setState({
        isOpen: true,
        step: NEW_API_MANAGED_VERIFICATION_STEPS.LOGGING_IN,
        isBusy: true,
        busyPhase: "starting",
        code: "",
        failure: undefined,
        request: normalizedRequest,
      })

      try {
        const result =
          !initialSessionResult ||
          shouldRetryInitialSessionWithAutomaticTotp(
            initialSessionResult,
            normalizedRequest.config,
          )
            ? await ensureNewApiManagedSession(normalizedRequest.config)
            : initialSessionResult
        await applySessionResult(normalizedRequest, result)
      } catch (error) {
        setState((prev) => ({
          ...prev,
          step: NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
          isBusy: false,
          busyPhase: undefined,
          failure: getNewApiManagedVerificationFailure(error),
        }))
      }
    },
    [applySessionResult],
  )

  const submitCode = useCallback(async () => {
    const request = state.request
    const trimmedCode = state.code.trim()

    if (!request) return

    if (!trimmedCode) {
      setState((prev) => ({
        ...prev,
        failure: { kind: "missing-code" },
      }))
      return
    }

    setState((prev) => ({
      ...prev,
      isBusy: true,
      busyPhase: "submitting",
      failure: undefined,
    }))

    try {
      const result =
        state.step === NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA
          ? await submitNewApiLoginTwoFactorCode(request.config, trimmedCode)
          : await submitNewApiSecureVerificationCode(
              request.config,
              trimmedCode,
            )

      await applySessionResult(request, result)
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isBusy: false,
        busyPhase: undefined,
        code: "",
        failure: getNewApiManagedVerificationFailure(error),
      }))
    }
  }, [applySessionResult, state.code, state.request, state.step])

  const retryVerification = useCallback(async () => {
    const request = requestRef.current ?? state.request
    if (!request) return

    if (
      state.step ===
      NEW_API_MANAGED_VERIFICATION_STEPS.SESSION_ACTIVE_LIMIT_CLEANUP
    ) {
      setState((prev) => ({
        ...prev,
        isBusy: true,
        busyPhase: "cleanup",
        failure: undefined,
      }))
      let cleanupSucceeded = false
      try {
        cleanupSucceeded =
          (await cleanupNewApiOwnedSession(request.config.baseUrl)).status ===
          "cleaned"
      } catch {
        // Use the same local recovery state for transport and result failures.
      }
      if (!cleanupSucceeded) {
        setState((prev) => ({
          ...prev,
          isBusy: false,
          busyPhase: undefined,
          failure: { kind: "cleanup-failed" },
        }))
        return
      }
    }

    await runInitialFlow(request)
  }, [runInitialFlow, state.request, state.step])

  const patchRequestConfig = useCallback(
    (updates: NewApiManagedVerificationConfigUpdate) => {
      const currentRequest = requestRef.current ?? state.request
      if (!currentRequest) {
        return
      }

      const nextRequest = {
        ...currentRequest,
        config: normalizeConfig({
          ...currentRequest.config,
          ...updates,
        }),
      }
      requestRef.current = nextRequest

      setState((prev) => {
        if (!prev.request) {
          return prev
        }

        return {
          ...prev,
          request: nextRequest,
        }
      })
    },
    [state.request],
  )

  const setCode = useCallback((code: string) => {
    setState((prev) => ({
      ...prev,
      code,
    }))
  }, [])

  const openNewApiManagedVerification = useCallback(
    (request: OpenNewApiManagedVerificationParams) => {
      const requestScope = request.config.baseUrl.trim()
      if (
        requestScope &&
        activeRequestScopeRef.current &&
        activeRequestScopeRef.current === requestScope
      ) {
        return
      }

      activeRequestScopeRef.current = requestScope
      void runInitialFlow(request)
    },
    [runInitialFlow],
  )

  return {
    dialogState: {
      ...state,
      busyMessage: presentBusyPhase(state.busyPhase, translate),
      errorMessage: presentFailure(state.failure, translate),
    },
    setCode,
    closeDialog,
    openBaseUrl,
    openNewApiManagedVerification,
    submitCode,
    retryVerification,
    patchRequestConfig,
  }
}
