import { KeyRound, Plus, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"

interface HeaderProps {
  selectedAccount: string
  onAddToken: () => void
  onRepairMissingKeys: () => void
  onRefresh: () => void
  isLoading: boolean
  isAddTokenDisabled: boolean
  isRepairDisabled: boolean
}

/**
 * Page header summarizing the key management section with actions.
 * @param props Component props container.
 * @param props.selectedAccount Currently selected account identifier.
 * @param props.onAddToken Handler for invoking the add-token dialog.
 * @param props.onRefresh Handler for refreshing the token list.
 * @param props.isLoading Indicates whether tokens are currently refreshing.
 * @param props.isAddTokenDisabled Disables add button when lacking permissions.
 */
export function Header({
  onAddToken,
  onRepairMissingKeys,
  onRefresh,
  isLoading,
  selectedAccount,
  isAddTokenDisabled,
  isRepairDisabled,
}: HeaderProps) {
  const { t } = useTranslation("keyManagement")
  return (
    <div className="mb-8">
      <PageHeader
        icon={KeyRound}
        title={t("title")}
        description={t("description")}
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
