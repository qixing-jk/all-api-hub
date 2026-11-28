import { Check } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { formatLocaleDateTime } from "~/utils/core/formatters"

import {
  getSub2ApiSessionHandoffHelp,
  Sub2ApiSessionAction,
  Sub2ApiSessionContinuationError,
  type Sub2ApiSessionActionState,
} from "../login/Sub2ApiSessionAction"
import { Sub2ApiManualSessionFields } from "./Sub2ApiManualSessionFields"
import type { AccountFormFieldAttributes } from "./useAccountFormFeedback"

/** Sub2API refresh-token mode, session import and token expiry. */
export function Sub2ApiRefreshTokenFields({
  enabled,
  refreshToken,
  expiresAt,
  isImporting,
  onEnabledChange,
  onRefreshTokenChange,
  onImportSession,
  acquireSession,
  loginSetup,
  isAcquiring,
  validation,
  isWebsiteSessionBound,
}: {
  enabled: boolean
  refreshToken: string
  expiresAt: number | null
  isImporting: boolean
  onEnabledChange: (value: boolean) => void
  onRefreshTokenChange: (value: string) => void
  onImportSession: () => void
  acquireSession?: Sub2ApiSessionActionState
  loginSetup?: {
    hasUserId: boolean
    loginConfigured: boolean
    onConfigure: () => void
  }
  isAcquiring: boolean
  validation: AccountFormFieldAttributes
  isWebsiteSessionBound?: boolean
}) {
  const { t } = useTranslation(["accountDialog", "common"])
  const helpId = useId()
  const loginHelpId = `${helpId}-login`
  const [manualOpen, setManualOpen] = useState(false)
  const hasToken = Boolean(refreshToken.trim())
  const continuation = acquireSession?.continuation
  const canConfigure =
    !hasToken && !acquireSession && loginSetup && !loginSetup.loginConfigured
  const canAcquire =
    acquireSession &&
    !isImporting &&
    !isAcquiring &&
    !continuation?.disabled &&
    !continuation?.isPending
  const feedbackId = validation["aria-describedby"]
  const primaryValidation = manualOpen
    ? undefined
    : {
        "data-account-validation-field":
          validation["data-account-validation-field"],
        "aria-describedby": feedbackId,
      }
  const feedbackClassName = validation["aria-invalid"]
    ? "text-xs text-destructive-text"
    : "text-xs text-warning-text"
  const loginHelp = continuation
    ? getSub2ApiSessionHandoffHelp(t, continuation)
    : t("form.sub2apiLoginSessionHelp")
  const setupHelp = loginSetup?.hasUserId
    ? t("form.sub2apiLoginNeedsSetup")
    : loginSetup?.loginConfigured
      ? t("form.sub2apiLoginNeedsUserId")
      : t("form.sub2apiLoginNeedsUserIdAndSetup")
  const sessionModes = [
    {
      independent: false,
      label: t("form.sub2apiBrowserSession"),
      description: t("form.sub2apiBrowserSessionDescription"),
      testId: ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiBrowserSessionOption,
    },
    {
      independent: true,
      label: t("form.sub2apiIndependentSession"),
      description: t("form.sub2apiIndependentSessionDescription"),
      testId: ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiIndependentSessionOption,
    },
  ]

  return (
    <fieldset className="col-span-full min-w-0">
      <legend className="text-sm font-medium text-foreground">
        {t("form.sub2apiSessionMode")}
      </legend>
      <div className="mt-density-2 overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-1 divide-y divide-border-subtle sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-border">
          {sessionModes.map(({ independent, label, description, testId }) => {
            const modeId = `${helpId}-${independent ? "independent" : "browser"}`
            return (
              <label
                key={testId}
                data-testid={testId}
                className="relative flex min-w-0 cursor-pointer items-start gap-2.5 px-3.5 py-density-3 transition-colors hover:bg-surface-subtle has-checked:bg-primary/5 has-focus-visible:z-10 has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-inset"
              >
                <input
                  type="radio"
                  name={`${helpId}-session-mode`}
                  className="peer sr-only"
                  checked={enabled === independent}
                  aria-labelledby={`${modeId}-label`}
                  aria-describedby={`${modeId}-description`}
                  onChange={() => {
                    setManualOpen(false)
                    onEnabledChange(independent)
                  }}
                />
                <span
                  aria-hidden="true"
                  className="mt-1 size-3.5 shrink-0 rounded-full border border-border-strong peer-checked:border-4 peer-checked:border-primary"
                />
                <span className="min-w-0 space-y-density-1">
                  <span
                    id={`${modeId}-label`}
                    className="block text-sm font-medium text-foreground"
                  >
                    {label}
                  </span>
                  <span
                    id={`${modeId}-description`}
                    className="block text-xs text-pretty text-muted-foreground"
                  >
                    {description}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        {enabled && (
          <div className="space-y-density-3 border-t border-border-subtle bg-surface-subtle px-3.5 py-density-3 dark:border-border">
            {(hasToken || acquireSession || loginSetup) && (
              <div className="space-y-density-1">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-density-1-5">
                  {hasToken ? (
                    <div
                      role="status"
                      className="flex min-w-0 items-start gap-2"
                    >
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-success-text"
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {t("form.sub2apiSessionConfigured")}
                        </p>
                        {typeof expiresAt === "number" && (
                          <p className="text-xs text-muted-foreground">
                            {t("form.sub2apiTokenExpiresAt")} ·{" "}
                            {formatLocaleDateTime(
                              expiresAt,
                              t("common:labels.notAvailable"),
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-[min(100%,10rem)] flex-1 space-y-density-1">
                      {acquireSession && (
                        <p className="text-sm font-medium text-foreground">
                          {t("form.sub2apiNoSession")}
                        </p>
                      )}
                      <p
                        id={acquireSession ? loginHelpId : undefined}
                        className="text-xs text-muted-foreground"
                      >
                        {acquireSession ? loginHelp : setupHelp}
                      </p>
                    </div>
                  )}
                  {acquireSession ? (
                    <Sub2ApiSessionAction
                      action={acquireSession}
                      reacquire={hasToken}
                      inline
                      {...(canAcquire ? primaryValidation : undefined)}
                      aria-describedby={
                        [
                          (!hasToken || continuation) && loginHelpId,
                          canAcquire && primaryValidation?.["aria-describedby"],
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      testId={
                        ACCOUNT_MANAGEMENT_TEST_IDS.sub2apiLoginSessionButton
                      }
                    />
                  ) : (
                    canConfigure && (
                      <Button
                        type="button"
                        size="sm"
                        variant="link"
                        className="min-h-0 shrink-0 px-0 py-0.5"
                        onClick={loginSetup.onConfigure}
                        {...primaryValidation}
                      >
                        {t("form.sub2apiLoginSetupAction")}
                      </Button>
                    )
                  )}
                </div>
                {hasToken && continuation && (
                  <p id={loginHelpId} className="text-xs text-muted-foreground">
                    {loginHelp}
                  </p>
                )}
              </div>
            )}
            <Sub2ApiSessionContinuationError
              continuation={continuation}
              announce
            />
            {!manualOpen && feedbackId && (
              <p id={feedbackId} className={feedbackClassName}>
                {canAcquire
                  ? t("form.sub2apiValidationAcquire")
                  : canConfigure
                    ? t("form.sub2apiValidationSetup")
                    : loginSetup?.loginConfigured && !loginSetup.hasUserId
                      ? t("form.sub2apiValidationUserId")
                      : t("form.sub2apiValidationManual")}
              </p>
            )}
            <Sub2ApiManualSessionFields
              manualOpen={manualOpen}
              setManualOpen={setManualOpen}
              hasToken={hasToken}
              refreshToken={refreshToken}
              onRefreshTokenChange={onRefreshTokenChange}
              onImportSession={onImportSession}
              isImporting={isImporting}
              isAcquiring={isAcquiring}
              isWebsiteSessionBound={isWebsiteSessionBound}
              hasAcquireAction={Boolean(acquireSession)}
              hasGuidedSessionSetup={Boolean(acquireSession || loginSetup)}
              validation={validation}
              triggerFeedback={
                !canAcquire && !canConfigure ? primaryValidation : undefined
              }
              feedbackClassName={feedbackClassName}
            />
            <p className="text-xs text-muted-foreground">
              {t("form.sub2apiSessionStorage")}
            </p>
          </div>
        )}
      </div>
    </fieldset>
  )
}
