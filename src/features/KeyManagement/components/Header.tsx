import { KeyRound, Plus, RefreshCw, Wrench } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"

interface HeaderProps {
  selectedAccount: string
  onAddToken: () => void
  onRepairMissingKeys: () => void
  onRefresh: () => void
  onRefreshManagedSiteStatus?: () => void
  managedSiteStatusHint?: string
  isLoading: boolean
  isManagedSiteStatusRefreshing?: boolean
  isAddTokenDisabled: boolean
  isRepairDisabled: boolean
  isManagedSiteStatusRefreshDisabled?: boolean
}

/**
 * Page header summarizing the key management section with actions.
 */
export function Header({
  onAddToken,
  onRepairMissingKeys,
  onRefresh,
  onRefreshManagedSiteStatus,
  managedSiteStatusHint,
  isLoading,
  isManagedSiteStatusRefreshing = false,
  selectedAccount,
  isAddTokenDisabled,
  isRepairDisabled,
  isManagedSiteStatusRefreshDisabled = false,
}: HeaderProps) {
  const { t } = useTranslation("keyManagement")
  let description: ReactNode = t("description")

  if (managedSiteStatusHint) {
    description = (
      <>
        <span className="block">{t("description")}</span>
        <span className="mt-1 block font-medium text-amber-700 dark:text-amber-300">
          {managedSiteStatusHint}
        </span>
      </>
    )
  }

  return (
    <div className="mb-8">
      <PageHeader
        icon={KeyRound}
        title={t("title")}
        description={description}
        actions={
          <>
            <Button
              onClick={onAddToken}
              disabled={isAddTokenDisabled}
              size="sm"
              variant="success"
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t("dialog.addToken")}
            </Button>
            <Button
              onClick={onRepairMissingKeys}
              disabled={isRepairDisabled}
              size="sm"
              variant="outline"
              leftIcon={<Wrench className="h-4 w-4" />}
            >
              {t("repairMissingKeys.action")}
            </Button>
            {onRefreshManagedSiteStatus ? (
              <Button
                onClick={onRefreshManagedSiteStatus}
                disabled={isManagedSiteStatusRefreshDisabled}
                size="sm"
                variant="outline"
                loading={isManagedSiteStatusRefreshing}
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                {isManagedSiteStatusRefreshing
                  ? t("managedSiteStatus.actions.refreshing")
                  : t("managedSiteStatus.actions.refresh")}
              </Button>
            ) : null}
            <Button onClick={onRefresh} disabled={isLoading} size="sm">
              {isLoading && selectedAccount
                ? t("common:status.refreshing")
                : t("refreshTokenList")}
            </Button>
          </>
        }
      />
    </div>
  )
}
