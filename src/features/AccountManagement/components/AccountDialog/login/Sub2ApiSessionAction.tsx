import type { TFunction } from "i18next"
import { LogIn } from "lucide-react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, InlineMessage, NoticeActionButton } from "~/components/ui"
import { cn } from "~/lib/utils"

import type { AccountRecoveryContinuation } from "../recovery/useAccountDialogRecoveryHandoff"

export interface Sub2ApiSessionActionState {
  onAcquire: () => void
  isAcquiring: boolean
  isImporting: boolean
  continuation?: AccountRecoveryContinuation
}

/** Describes the destination shared by both Popup acquisition entry points. */
export function getSub2ApiSessionHandoffHelp(
  t: TFunction<"accountDialog">,
  continuation: Pick<AccountRecoveryContinuation, "sidePanelSupported">,
) {
  return continuation.sidePanelSupported
    ? t("form.sub2apiLoginSidePanelHelp")
    : t("form.sub2apiLoginFullPageHelp")
}

/** Shares acquisition and Popup handoff behavior between both form sections. */
export function Sub2ApiSessionAction({
  action,
  reacquire,
  inline,
  testId,
  ...feedback
}: {
  action: Sub2ApiSessionActionState
  reacquire?: boolean
  inline?: boolean
  testId: string
  "aria-describedby"?: string
  "data-account-validation-field"?: string
}) {
  const { t } = useTranslation(["accountDialog", "common"])
  const { continuation, isAcquiring, isImporting, onAcquire } = action
  const borderless = Boolean(reacquire || inline)

  return (
    <Button
      type="button"
      variant={borderless ? "link" : "outline"}
      size="sm"
      className={cn(
        "shrink-0",
        borderless && "min-h-0 px-0 py-0.5 has-[>svg]:px-0",
      )}
      onClick={continuation ? () => continuation.onContinue() : onAcquire}
      loading={isAcquiring || continuation?.isPending}
      disabled={isImporting || continuation?.disabled}
      leftIcon={<LogIn className="size-3.5" />}
      rightIcon={
        continuation && <WorkflowTransitionIcon className="size-3.5" />
      }
      data-testid={testId}
      {...feedback}
    >
      {continuation?.isPending
        ? t("common:status.loading")
        : isAcquiring
          ? t("form.sub2apiLoggingIn")
          : reacquire
            ? t("form.sub2apiReacquire")
            : t("form.sub2apiLoginForSession")}
    </Button>
  )
}

/** Displays the same preparation error beside either acquisition action. */
export function Sub2ApiSessionContinuationError({
  continuation,
  announce,
}: {
  continuation?: AccountRecoveryContinuation
  announce?: boolean
}) {
  const { t } = useTranslation("common")
  if (!continuation?.errorMessage) return null

  return (
    <InlineMessage
      role={announce ? "alert" : "note"}
      tone="destructive"
      size="sm"
    >
      {continuation.errorMessage}{" "}
      {continuation.onRetry && (
        <NoticeActionButton onClick={continuation.onRetry}>
          {t("actions.retry")}
        </NoticeActionButton>
      )}
    </InlineMessage>
  )
}
