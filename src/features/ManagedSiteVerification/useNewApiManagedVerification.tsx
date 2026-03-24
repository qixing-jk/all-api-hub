import { useCallback, useRef, useState } from "react"
import toast from "react-hot-toast"

import {
  ensureNewApiManagedSession,
  NEW_API_MANAGED_SESSION_STATUSES,
  submitNewApiLoginTwoFactorCode,
  submitNewApiSecureVerificationCode,
  type EnsureNewApiManagedSessionResult,
} from "~/services/managedSites/providers/newApiSession"
import type { NewApiConfig } from "~/types/newApiConfig"
import { createTab } from "~/utils/browser/browserApi"
import { t } from "~/utils/i18n/core"

import { getNewApiManagedVerificationErrorMessage } from "./errorMessages"

export const NEW_API_MANAGED_VERIFICATION_STEPS = {
  LOGGING_IN: "logging-in",
  CREDENTIALS_MISSING: "credentials-missing",
  LOGIN_2FA: "login-2fa",
  SECURE_VERIFICATION: "secure-verification",
  PASSKEY_MANUAL: "passkey-manual",
  SUCCESS: "success",
  FAILURE: "failure",
} as const

export type NewApiManagedVerificationStep =
  (typeof NEW_API_MANAGED_VERIFICATION_STEPS)[keyof typeof NEW_API_MANAGED_VERIFICATION_STEPS]

export interface OpenNewApiManagedVerificationParams {
  kind: "settings" | "token" | "channel"
  config: Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  >
  label?: string
  onVerified?: () => Promise<void> | void
  initialSessionResult?: EnsureNewApiManagedSessionResult
  initialFailureMessage?: string
}

type StoredNewApiManagedVerificationRequest = Omit<
  OpenNewApiManagedVerificationParams,
  "initialFailureMessage" | "initialSessionResult"
>

interface NewApiManagedVerificationState {
  isOpen: boolean
  step: NewApiManagedVerificationStep
  isBusy: boolean
  busyMessage?: string
  code: string
  errorMessage?: string
  request: StoredNewApiManagedVerificationRequest | null
}

const INITIAL_STATE: NewApiManagedVerificationState = {
  isOpen: false,
  step: NEW_API_MANAGED_VERIFICATION_STEPS.LOGGING_IN,
  isBusy: false,
  busyMessage: undefined,
  code: "",
  errorMessage: undefined,
  request: null,
}

const normalizeConfig = (
  config: Pick<
    NewApiConfig,
    "baseUrl" | "userId" | "username" | "password" | "totpSecret"
  >,
) => ({
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
    case NEW_API_MANAGED_SESSION_STATUSES.VERIFIED:
    default:
      return NEW_API_MANAGED_VERIFICATION_STEPS.SUCCESS
  }
}

/**
 * Controls the reusable New API verification dialog state and wires it to the
 * provider-local session helper used by Settings and Key Management.
 */
export function useNewApiManagedVerification() {
  const [state, setState] =
    useState<NewApiManagedVerificationState>(INITIAL_STATE)
  const activeRequestScopeRef = useRef<string | null>(null)

  const closeDialog = useCallback(() => {
    activeRequestScopeRef.current = null
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
      if (request.onVerified) {
        setState((prev) => ({
          ...prev,
          isBusy: true,
          busyMessage:
            request.kind === "token"
              ? t("newApiManagedVerification:dialog.messages.refreshingToken")
              : request.kind === "channel"
                ? t(
                    "newApiManagedVerification:dialog.messages.refreshingChannel",
                  )
                : t("newApiManagedVerification:dialog.messages.finishing"),
        }))

        await Promise.resolve(request.onVerified())
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
        busyMessage: undefined,
        errorMessage:
          "errorMessage" in result ? result.errorMessage : undefined,
        code: "",
      }))
    },
    [finishVerifiedFlow],
  )

  const runInitialFlow = useCallback(
    async (request: OpenNewApiManagedVerificationParams) => {
      const normalizedRequest = createStoredRequest(request)
      const initialSessionResult = request.initialSessionResult

      if (!normalizedRequest.config.baseUrl) {
        setState({
          isOpen: true,
          step: NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
          isBusy: false,
          busyMessage: undefined,
          code: "",
          errorMessage: t(
            "newApiManagedVerification:dialog.messages.missingBaseUrl",
          ),
          request: normalizedRequest,
        })
        return
      }

      if (request.initialFailureMessage) {
        setState({
          isOpen: true,
          step: NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
          isBusy: false,
          busyMessage: undefined,
          code: "",
          errorMessage: request.initialFailureMessage,
          request: normalizedRequest,
        })
        return
      }

      setState({
        isOpen: true,
        step: NEW_API_MANAGED_VERIFICATION_STEPS.LOGGING_IN,
        isBusy: true,
        busyMessage: t("newApiManagedVerification:dialog.messages.starting"),
        code: "",
        errorMessage: undefined,
        request: normalizedRequest,
      })

      try {
        const result =
          initialSessionResult ??
          (await ensureNewApiManagedSession(normalizedRequest.config))
        await applySessionResult(normalizedRequest, result)
      } catch (error) {
        setState((prev) => ({
          ...prev,
          step: NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE,
          isBusy: false,
          busyMessage: undefined,
          errorMessage: getNewApiManagedVerificationErrorMessage(error),
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
        errorMessage: t(
          "newApiManagedVerification:dialog.messages.missingCode",
        ),
      }))
      return
    }

    setState((prev) => ({
      ...prev,
      isBusy: true,
      busyMessage: t("newApiManagedVerification:dialog.messages.submitting"),
      errorMessage: undefined,
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
        busyMessage: undefined,
        code: "",
        errorMessage: getNewApiManagedVerificationErrorMessage(error),
      }))
    }
  }, [applySessionResult, state.code, state.request, state.step])

  const retryVerification = useCallback(async () => {
    if (!state.request) return
    await runInitialFlow(state.request)
  }, [runInitialFlow, state.request])

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
    dialogState: state,
    setCode,
    closeDialog,
    openBaseUrl,
    openNewApiManagedVerification,
    submitCode,
    retryVerification,
  }
}
