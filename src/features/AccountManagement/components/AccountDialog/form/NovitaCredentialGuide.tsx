import { Download, KeyRound } from "lucide-react"
import { useId, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, FormField, IconButton, Input } from "~/components/ui"
import type { AccessTokenContinuationAction } from "~/features/AccountManagement/components/AccountDialog/form/AccessTokenVerificationGuide"
import {
  encodeNovitaCredentials,
  parseNovitaCredentials,
} from "~/services/apiService/novita/constants"
import { createTab } from "~/utils/browser/tabs"

export interface NovitaCredentialActions {
  onAcquireConsole: () => void
  onVerify: () => void
  isVerifying: boolean
  operation?: "console" | "api-key" | "account"
  verification?: {
    status: "success" | "error"
    message?: string
    accountLabel?: string
  }
  continuation?: AccessTokenContinuationAction
}

/** Plain credential fields preserve one another as the user edits them. */
export function NovitaCredentialGuide({
  credential,
  onCredentialChange,
  actions,
  onPrepareInput,
  children,
}: {
  credential: string
  onCredentialChange: (credential: string) => void
  actions: NovitaCredentialActions
  onPrepareInput: () => void
  children: (keyManagementLink: ReactNode) => ReactNode
}) {
  const { t } = useTranslation("accountDialog")
  const consoleInputId = useId()
  const consoleHintId = useId()
  const consoleFeedbackId = useId()
  const [openFailed, setOpenFailed] = useState(false)
  const credentials = parseNovitaCredentials(credential)
  const isConsoleOperation = actions.operation === "console"
  const isAcquiring = actions.isVerifying && isConsoleOperation
  const verification = isConsoleOperation ? actions.verification : undefined
  const consoleError =
    verification?.status === "error" ? verification.message : undefined
  const consoleFeedback =
    consoleError ||
    (verification?.status === "success"
      ? t("novitaCredentials.consoleVerified", {
          account: verification.accountLabel,
        })
      : undefined)
  const openKeys = async () => {
    setOpenFailed(false)
    onPrepareInput()
    try {
      await createTab("https://novita.ai/settings/key-management", true)
    } catch {
      setOpenFailed(true)
    }
  }
  return (
    <div className="space-y-density-4 col-span-full">
      <FormField
        label={t("novitaCredentials.console")}
        htmlFor={consoleInputId}
        required={!credentials.apiKey}
      >
        <Input
          id={consoleInputId}
          type="password"
          revealable
          revealLabels={{
            show: t("novitaCredentials.showConsoleToken"),
            hide: t("novitaCredentials.hideConsoleToken"),
          }}
          value={credentials.consoleToken}
          onChange={(event) =>
            onCredentialChange(
              encodeNovitaCredentials({
                ...credentials,
                consoleToken: event.target.value,
              }),
            )
          }
          placeholder={t("novitaCredentials.console")}
          leftIcon={<KeyRound className="h-5 w-5" />}
          rightIcon={
            <IconButton
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t("novitaCredentials.detectSession")}
              onClick={actions.onAcquireConsole}
              loading={isAcquiring}
              disabled={actions.isVerifying}
            >
              <Download className="h-4 w-4" />
            </IconButton>
          }
          aria-busy={isAcquiring || undefined}
          aria-invalid={Boolean(consoleError) || undefined}
          variant={
            consoleError
              ? "error"
              : verification?.status === "success"
                ? "success"
                : undefined
          }
          aria-describedby={consoleFeedback ? consoleFeedbackId : consoleHintId}
          required={!credentials.apiKey}
        />
        {consoleFeedback && (
          <p
            id={consoleFeedbackId}
            role="status"
            className={
              consoleError
                ? "text-destructive-text text-xs"
                : "text-success-text text-xs"
            }
          >
            {consoleFeedback}
          </p>
        )}
        <p id={consoleHintId} className="text-muted-foreground text-xs">
          {t("novitaCredentials.consoleScope")}
        </p>
      </FormField>
      <div className="space-y-density-2">
        {children(
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-muted-foreground hover:text-foreground min-h-0 shrink-0 gap-1 p-0 text-xs font-normal has-[>svg]:px-0"
            aria-label={t("novitaCredentials.openKeys")}
            onClick={() => void openKeys()}
          >
            {t("novitaCredentials.openKeysShort")}
            <WorkflowTransitionIcon className="size-3" aria-hidden="true" />
          </Button>,
        )}
        <p className="text-muted-foreground text-xs">
          {t("novitaCredentials.apiKeyScope")}
        </p>
      </div>
      {actions.continuation && (
        <div className="gap-density-2 flex flex-wrap">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={actions.continuation.onContinue}
            disabled={
              actions.continuation.disabled || actions.continuation.isPending
            }
          >
            {actions.continuation.sidePanelSupported
              ? t("accessTokenVerification.continueInSidePanel")
              : t("accessTokenVerification.continueInFullPage")}
          </Button>
        </div>
      )}
      {(openFailed || actions.continuation?.errorMessage) && (
        <p role="alert">
          {actions.continuation?.errorMessage ||
            t("accessTokenVerification.novita.openPageFailed")}
        </p>
      )}
    </div>
  )
}
