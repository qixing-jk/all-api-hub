import { ChevronDown, Download, KeyRound } from "lucide-react"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Button, FormField, Input } from "~/components/ui"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

import type { AccountFormFieldAttributes } from "./useAccountFormFeedback"

/** Manual entry and website import share the same disclosure and validation. */
export function Sub2ApiManualSessionFields({
  manualOpen,
  setManualOpen,
  hasToken,
  refreshToken,
  onRefreshTokenChange,
  onImportSession,
  isImporting,
  isAcquiring,
  isWebsiteSessionBound,
  hasAcquireAction,
  hasGuidedSessionSetup,
  validation,
  triggerFeedback,
  feedbackClassName,
}: {
  manualOpen: boolean
  setManualOpen: (open: boolean) => void
  hasToken: boolean
  refreshToken: string
  onRefreshTokenChange: (value: string) => void
  onImportSession: () => void
  isImporting: boolean
  isAcquiring: boolean
  isWebsiteSessionBound?: boolean
  hasAcquireAction: boolean
  hasGuidedSessionSetup: boolean
  validation: AccountFormFieldAttributes
  triggerFeedback?: Pick<
    AccountFormFieldAttributes,
    "data-account-validation-field" | "aria-describedby"
  >
  feedbackClassName: string
}) {
  const { t } = useTranslation("accountDialog")
  const refreshTokenId = useId()
  const importHelpId = refreshTokenId + "-import"
  const feedbackId = validation["aria-describedby"]
  return (
    <Collapsible
      open={manualOpen}
      onOpenChange={setManualOpen}
      className="border-t border-border-subtle pt-density-1-5 dark:border-border"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiManualDisclosure}
          {...triggerFeedback}
          className="group flex items-center gap-1.5 rounded-sm py-density-1-5 text-left text-xs font-medium text-secondary-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180"
          />
          {hasToken
            ? t("form.sub2apiManualEdit")
            : t("form.sub2apiManualImport")}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-density-2">
        <FormField
          label={t("form.sub2apiRefreshToken")}
          htmlFor={refreshTokenId}
          labelAction={
            !isWebsiteSessionBound && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={onImportSession}
                loading={isImporting && !isAcquiring}
                disabled={isImporting}
                className="min-h-0 shrink-0 px-0 py-0.5 has-[>svg]:px-0"
                aria-describedby={importHelpId}
                data-testid={
                  ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiImportSessionButton
                }
                leftIcon={<Download className="size-3.5" />}
              >
                {isImporting && !isAcquiring
                  ? t("form.sub2apiImporting")
                  : t("form.sub2apiImportRefreshToken")}
              </Button>
            )
          }
        >
          <Input
            id={refreshTokenId}
            type="password"
            className="bg-card"
            revealable
            revealLabels={{
              show: t("form.showRefreshToken"),
              hide: t("form.hideRefreshToken"),
            }}
            {...validation}
            aria-describedby={
              [feedbackId, isWebsiteSessionBound ? importHelpId : undefined]
                .filter(Boolean)
                .join(" ") || undefined
            }
            value={refreshToken}
            onChange={(e) => onRefreshTokenChange(e.target.value)}
            placeholder={t("form.sub2apiRefreshTokenPlaceholder")}
            leftIcon={<KeyRound className="size-4" />}
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiRefreshTokenInput}
          />
          {feedbackId && (
            <p id={feedbackId} className={feedbackClassName}>
              {hasGuidedSessionSetup
                ? t("form.sub2apiValidationPaste")
                : t("validation.requiredField")}
            </p>
          )}
          <p id={importHelpId} className="text-xs text-muted-foreground">
            {isWebsiteSessionBound
              ? hasAcquireAction
                ? t("form.sub2apiImportBoundHelp", {
                    action: hasToken
                      ? t("form.sub2apiReacquire")
                      : t("form.sub2apiLoginForSession"),
                  })
                : t("form.sub2apiImportBoundUnavailable")
              : t("form.sub2apiImportSessionHelp")}
          </p>
        </FormField>
      </CollapsibleContent>
    </Collapsible>
  )
}
