import { useTranslation } from "react-i18next"

import { Button, Card } from "~/components/ui"

interface EmptyResultsProps {
  hasHistory: boolean
  setupState?: "ready" | "no_accounts" | "no_detection_accounts"
  onOpenAccounts?: () => void
}

/**
 * Shown when no auto-checkin runs or history exist yet.
 * @param props Props container for the component.
 * @param props.hasHistory Toggles messaging between past runs and first-time state.
 * @param props.setupState Current account prerequisite state for auto check-in.
 * @param props.onOpenAccounts Navigates to account management when setup is incomplete.
 */
export default function EmptyResults({
  hasHistory,
  setupState = "ready",
  onOpenAccounts,
}: EmptyResultsProps) {
  const { t } = useTranslation("autoCheckin")
  const needsAccountSetup = setupState !== "ready"
  const title = needsAccountSetup
    ? setupState === "no_accounts"
      ? t("execution.empty.noAccounts")
      : t("execution.empty.noDetectionAccounts")
    : hasHistory
      ? t("execution.empty.noResults")
      : t("execution.empty.noHistory")
  const description = needsAccountSetup
    ? setupState === "no_accounts"
      ? t("execution.empty.noAccountsDesc")
      : t("execution.empty.noDetectionAccountsDesc")
    : hasHistory
      ? t("execution.empty.noResultsDesc")
      : t("execution.empty.noHistoryDesc")

  return (
    <Card className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>
      {needsAccountSetup && onOpenAccounts ? (
        <Button type="button" onClick={onOpenAccounts}>
          {setupState === "no_accounts"
            ? t("execution.empty.addAccount")
            : t("execution.empty.openAccounts")}
        </Button>
      ) : null}
    </Card>
  )
}
