import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { Button, Input, Modal } from "~/components/ui"
import {
  NEW_API_MANAGED_VERIFICATION_STEPS,
  type NewApiManagedVerificationStep,
  type OpenNewApiManagedVerificationParams,
} from "~/features/ManagedSiteVerification/useNewApiManagedVerification"

const getDialogTitle = (
  t: TFunction,
  request: OpenNewApiManagedVerificationParams | null,
) =>
  request?.kind === "token"
    ? t("newApiManagedVerification:dialog.title.token")
    : request?.kind === "channel"
      ? t("newApiManagedVerification:dialog.title.channel")
      : t("newApiManagedVerification:dialog.title.settings")

const getStepBodyCopy = (
  t: TFunction,
  request: OpenNewApiManagedVerificationParams | null,
  step: NewApiManagedVerificationStep,
) => {
  switch (step) {
    case NEW_API_MANAGED_VERIFICATION_STEPS.CREDENTIALS_MISSING:
      return t("newApiManagedVerification:dialog.body.credentialsMissing")
    case NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA:
      return t("newApiManagedVerification:dialog.body.loginTwoFactor")
    case NEW_API_MANAGED_VERIFICATION_STEPS.SECURE_VERIFICATION:
      return t("newApiManagedVerification:dialog.body.secureVerification")
    case NEW_API_MANAGED_VERIFICATION_STEPS.PASSKEY_MANUAL:
      return t("newApiManagedVerification:dialog.body.passkeyManual")
    case NEW_API_MANAGED_VERIFICATION_STEPS.SUCCESS:
      return request?.kind === "token"
        ? t("newApiManagedVerification:dialog.body.successToken", {
            label: request.label ?? "",
          })
        : request?.kind === "channel"
          ? t("newApiManagedVerification:dialog.body.successChannel", {
              label: request.label ?? "",
            })
          : t("newApiManagedVerification:dialog.body.successSettings")
    case NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE:
      return t("newApiManagedVerification:dialog.body.failure")
    case NEW_API_MANAGED_VERIFICATION_STEPS.LOGGING_IN:
    default:
      return t("newApiManagedVerification:dialog.body.loggingIn")
  }
}

export interface NewApiManagedVerificationDialogProps {
  isOpen: boolean
  step: NewApiManagedVerificationStep
  request: OpenNewApiManagedVerificationParams | null
  code: string
  errorMessage?: string
  isBusy?: boolean
  busyMessage?: string
  onCodeChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  onRetry: () => void
  onOpenSite: () => void
}

/**
 * Reusable modal that renders the New API login/session verification states and
 * delegates the actual actions to the shared controller hook.
 */
export function NewApiManagedVerificationDialog(
  props: NewApiManagedVerificationDialogProps,
) {
  const { t } = useTranslation("newApiManagedVerification")

  const header = (
    <div className="flex flex-col gap-1 pr-8">
      <div className="text-lg font-semibold text-gray-900 dark:text-white">
        {getDialogTitle(t, props.request)}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {getStepBodyCopy(t, props.request, props.step)}
      </p>
    </div>
  )

  const isCodeEntryStep =
    props.step === NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA ||
    props.step === NEW_API_MANAGED_VERIFICATION_STEPS.SECURE_VERIFICATION

  const footer = (
    <div className="flex flex-wrap justify-end gap-2">
      {props.step === NEW_API_MANAGED_VERIFICATION_STEPS.PASSKEY_MANUAL ? (
        <>
          <Button
            variant="outline"
            onClick={props.onOpenSite}
            disabled={props.isBusy}
          >
            {t("dialog.actions.openSite")}
          </Button>
          <Button onClick={props.onRetry} disabled={props.isBusy}>
            {t("dialog.actions.retryAfterPasskey")}
          </Button>
        </>
      ) : null}

      {props.step === NEW_API_MANAGED_VERIFICATION_STEPS.FAILURE ? (
        <Button onClick={props.onRetry} disabled={props.isBusy}>
          {t("dialog.actions.retry")}
        </Button>
      ) : null}

      {isCodeEntryStep ? (
        <Button onClick={props.onSubmit} disabled={props.isBusy}>
          {props.step === NEW_API_MANAGED_VERIFICATION_STEPS.LOGIN_2FA
            ? t("dialog.actions.submitLoginCode")
            : t("dialog.actions.submitVerificationCode")}
        </Button>
      ) : null}

      <Button
        variant={isCodeEntryStep ? "outline" : "secondary"}
        onClick={props.onClose}
        disabled={props.isBusy}
      >
        {t("dialog.actions.close")}
      </Button>
    </div>
  )

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      header={header}
      footer={footer}
      closeOnBackdropClick={!props.isBusy}
      closeOnEsc={!props.isBusy}
    >
      <div className="space-y-4">
        {props.isBusy ? (
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200"
          >
            {props.busyMessage || t("dialog.messages.starting")}
          </div>
        ) : null}

        {props.errorMessage ? (
          <div
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            {props.errorMessage}
          </div>
        ) : null}

        {isCodeEntryStep ? (
          <div className="space-y-2">
            <label
              htmlFor="new-api-verification-code"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200"
            >
              {t("dialog.fields.codeLabel")}
            </label>
            <Input
              id="new-api-verification-code"
              type="text"
              value={props.code}
              onChange={(event) => props.onCodeChange(event.target.value)}
              placeholder={t("dialog.fields.codePlaceholder")}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("dialog.hints.manualFallback")}
            </p>
          </div>
        ) : null}

        {props.step === NEW_API_MANAGED_VERIFICATION_STEPS.PASSKEY_MANUAL ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("dialog.hints.passkey")}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
