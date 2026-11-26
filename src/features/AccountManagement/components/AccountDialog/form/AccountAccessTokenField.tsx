import { BadgeCheck, KeyRound } from "lucide-react"
import { useId, type ReactNode, type Ref } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { FormField, IconButton, Input } from "~/components/ui"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  encodeNanoGptCredentials,
  parseNanoGptCredentials,
} from "~/services/apiService/nanogpt/credentials"
import { NEW_API_TOKEN_VALIDATION_STATUSES as VALIDATION_STATUSES } from "~/services/apiService/newApiFamily/accessTokens/protocol"
import {
  encodeNovitaCredentials,
  parseNovitaCredentials,
} from "~/services/apiService/novita/constants"

import {
  TOKEN_VERIFICATION_CHECKING,
  type NewApiAccessTokenVerificationStatus,
} from "../newApiToken/useNewApiAccessTokenVerification"
import type { NovitaCredentialActions } from "./NovitaCredentialGuide"
import type { AccountDialogSitePolicy } from "./sitePolicy"
import type { AccountFormFieldAttributes } from "./useAccountFormFeedback"

export interface AccountAccessTokenVerificationAction {
  status?: NewApiAccessTokenVerificationStatus
  onVerify: () => void
  disabled: boolean
}

/** Provides the editable key while preserving any companion credential. */
export function getAccountAccessTokenInput(
  siteType: AccountSiteType,
  accessToken: string,
) {
  if (siteType === SITE_TYPES.NOVITA) {
    const credentials = parseNovitaCredentials(accessToken)
    return {
      value: credentials.apiKey,
      required: !credentials.consoleToken,
      replaceValue: (apiKey: string) =>
        encodeNovitaCredentials({ ...credentials, apiKey }),
    }
  }
  if (siteType === SITE_TYPES.NANOGPT) {
    const credentials = parseNanoGptCredentials(accessToken)
    return {
      value: credentials.apiKey,
      required: !credentials.managementToken,
      replaceValue: (apiKey: string) =>
        encodeNanoGptCredentials({ ...credentials, apiKey }),
    }
  }
  return {
    value: accessToken,
    required: true,
    replaceValue: (value: string) => value,
  }
}

/** Shared credential input for the compact and full account forms. */
export function AccountAccessTokenField({
  accessTokenInputRef,
  siteType,
  userId,
  labelKey,
  labelAction,
  value,
  required,
  showAccessToken,
  onShowAccessTokenChange,
  onValueChange,
  novitaCredentialActions,
  newApiTokenVerification,
  accessTokenFeedback,
  accessTokenFeedbackVariant,
  accessTokenSetup,
  compact,
  onCompleteCompactToken,
  containsFocusTarget,
  validationAttributes,
  validationFeedback,
}: {
  accessTokenInputRef: Ref<HTMLInputElement>
  siteType: AccountSiteType
  userId: string
  labelKey: AccountDialogSitePolicy["accessTokenPresentation"]["accessTokenLabelKey"]
  labelAction?: ReactNode
  value: string
  required: boolean
  showAccessToken: boolean
  onShowAccessTokenChange: (show: boolean) => void
  onValueChange: (value: string) => void
  novitaCredentialActions?: NovitaCredentialActions
  newApiTokenVerification?: AccountAccessTokenVerificationAction
  accessTokenFeedback?: ReactNode
  accessTokenFeedbackVariant?: "success" | "warning"
  accessTokenSetup?: ReactNode
  compact?: boolean
  onCompleteCompactToken?: (value: string, focusToken: boolean) => void
  containsFocusTarget?: (target: Node) => boolean
  validationAttributes: AccountFormFieldAttributes
  validationFeedback: ReactNode
}) {
  const { t } = useTranslation("accountDialog")
  const accessTokenLabel =
    siteType === SITE_TYPES.NOVITA
      ? t("novitaCredentials.apiKey")
      : t(labelKey ?? "form.accessToken")
  const accessTokenFieldHintId = useId()
  const accessTokenFeedbackId = useId()
  const showAccessTokenFieldHint = compact && Boolean(accessTokenSetup)
  const credentialFeedbackId = useId()
  const showApiKeyVerification =
    siteType === SITE_TYPES.NOVITA && Boolean(novitaCredentialActions)
  const isConsoleOperation = novitaCredentialActions?.operation === "console"
  const isAccountOperation = novitaCredentialActions?.operation === "account"
  const verificationStatus =
    showApiKeyVerification &&
    Boolean(value) &&
    !isConsoleOperation &&
    !isAccountOperation
      ? novitaCredentialActions?.verification?.status
      : undefined
  const isVerifyingApiKey =
    showApiKeyVerification &&
    Boolean(value) &&
    !isConsoleOperation &&
    !isAccountOperation &&
    novitaCredentialActions?.isVerifying
  const newApiTokenStatus = newApiTokenVerification?.status
  const isVerifyingNewApiToken =
    newApiTokenStatus === TOKEN_VERIFICATION_CHECKING
  const verifyTokenLabel = isVerifyingNewApiToken
    ? t("accessTokenValidation.checking")
    : newApiTokenStatus === VALIDATION_STATUSES.UNAVAILABLE
      ? t("accessTokenValidation.retry")
      : newApiTokenStatus === VALIDATION_STATUSES.INVALID ||
          newApiTokenStatus === VALIDATION_STATUSES.IDENTITY_MISMATCH
        ? t("accessTokenValidation.verifyAgain")
        : t("accessTokenValidation.verify")
  const credentialFeedback = isVerifyingApiKey
    ? t("novitaCredentials.verifying")
    : verificationStatus === "success"
      ? t("novitaCredentials.apiKeyVerified", {
          account:
            novitaCredentialActions?.verification?.accountLabel || userId,
        })
      : verificationStatus === "error"
        ? novitaCredentialActions?.verification?.message
        : undefined
  return (
    <FormField
      label={accessTokenLabel}
      labelAction={labelAction}
      required={required}
    >
      <Input
        ref={accessTokenInputRef}
        type="password"
        revealable
        revealed={showAccessToken}
        onRevealedChange={onShowAccessTokenChange}
        revealLabels={{
          show:
            siteType === SITE_TYPES.NOVITA
              ? t("novitaCredentials.showApiKey")
              : t("form.showAccessToken"),
          hide:
            siteType === SITE_TYPES.NOVITA
              ? t("novitaCredentials.hideApiKey")
              : t("form.hideAccessToken"),
        }}
        value={value}
        variant={
          verificationStatus === "error"
            ? "error"
            : verificationStatus === "success"
              ? "success"
              : accessTokenFeedbackVariant
        }
        {...validationAttributes}
        aria-invalid={
          verificationStatus === "error" || validationAttributes["aria-invalid"]
        }
        aria-busy={isVerifyingApiKey || isVerifyingNewApiToken || undefined}
        aria-describedby={
          [
            validationAttributes["aria-describedby"],
            showAccessTokenFieldHint ? accessTokenFieldHintId : undefined,
            credentialFeedback ? credentialFeedbackId : undefined,
            accessTokenFeedback ? accessTokenFeedbackId : undefined,
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        rightIcon={
          showApiKeyVerification && novitaCredentialActions ? (
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("novitaCredentials.verifyKey")}
              onClick={novitaCredentialActions.onVerify}
              loading={Boolean(isVerifyingApiKey)}
              disabled={novitaCredentialActions.isVerifying || !value.trim()}
            >
              <BadgeCheck className="h-4 w-4" />
            </IconButton>
          ) : newApiTokenVerification ? (
            <Tooltip
              anchorAsChild
              positionStrategy="fixed"
              content={verifyTokenLabel}
              includeAccessibleDescription={false}
            >
              <IconButton
                type="button"
                variant="ghost"
                size="sm"
                aria-label={verifyTokenLabel}
                onClick={newApiTokenVerification.onVerify}
                loading={isVerifyingNewApiToken}
                disabled={newApiTokenVerification.disabled || !value.trim()}
              >
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </Tooltip>
          ) : undefined
        }
        onChange={(event) => onValueChange(event.target.value)}
        onPaste={
          onCompleteCompactToken &&
          ((event) => {
            const pasted = event.clipboardData.getData("text")
            if (!pasted.trim()) return
            event.preventDefault()
            const { selectionStart, selectionEnd, value } = event.currentTarget
            const token =
              value.slice(0, selectionStart ?? value.length) +
              pasted.replace(/[\r\n]/gu, "") +
              value.slice(selectionEnd ?? value.length)
            onCompleteCompactToken(token, true)
          })
        }
        onBlur={
          onCompleteCompactToken &&
          ((event) => {
            // The compact field and its helper controls are removed together.
            const focusToken = Boolean(
              event.relatedTarget && containsFocusTarget?.(event.relatedTarget),
            )
            onCompleteCompactToken(event.currentTarget.value, focusToken)
          })
        }
        onKeyDown={
          onCompleteCompactToken &&
          ((event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return
            event.preventDefault()
            onCompleteCompactToken(event.currentTarget.value, true)
          })
        }
        aria-label={compact ? accessTokenLabel : undefined}
        placeholder={compact ? t("validation.pasteToken") : accessTokenLabel}
        leftIcon={<KeyRound className="h-5 w-5" />}
        data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accessTokenInput}
        required={required}
      />
      {showAccessTokenFieldHint && (
        <p
          id={accessTokenFieldHintId}
          data-slot="field-description"
          className="text-xs text-muted-foreground"
        >
          {t("validation.tokenFieldHint")}
        </p>
      )}
      {credentialFeedback && (
        <p
          id={credentialFeedbackId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={
            verificationStatus === "error"
              ? "text-xs text-destructive-text"
              : verificationStatus === "success"
                ? "text-xs text-success-text"
                : "text-xs text-muted-foreground"
          }
        >
          {credentialFeedback}
        </p>
      )}
      {validationFeedback}
      {accessTokenFeedback && (
        <div id={accessTokenFeedbackId}>{accessTokenFeedback}</div>
      )}
      {compact && accessTokenSetup}
    </FormField>
  )
}
