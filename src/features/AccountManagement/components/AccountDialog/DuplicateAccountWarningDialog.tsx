import { TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ActionGroup } from "~/components/ui/ActionGroup"
import { Alert } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"
import { Modal } from "~/components/ui/Dialog/Modal"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"

export interface DuplicateAccountWarningDialogProps {
  isOpen: boolean
  siteUrl: string
  existingAccountsCount: number
  existingUsername?: string | null
  existingUserId?: string | number | null
  onCancel: () => void
  onContinue: () => void
  onDisableWarningAndContinue: () => void
}

/**
 * DuplicateAccountWarningDialog prompts users when they are about to add an
 * account with a saved site identity or an identical OpenRouter Management Key.
 */
export function DuplicateAccountWarningDialog({
  isOpen,
  siteUrl,
  existingAccountsCount,
  existingUsername,
  existingUserId,
  onCancel,
  onContinue,
  onDisableWarningAndContinue,
}: DuplicateAccountWarningDialogProps) {
  const { t } = useTranslation(["accountDialog", "common"])

  const hasExactUserMatch =
    typeof existingUserId === "number" ||
    (typeof existingUserId === "string" && existingUserId.trim() !== "")

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={t("accountDialog:warnings.duplicateAccount.title")}
      size="sm"
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <TriangleAlert className="text-warning-text h-5 w-5" />
            <h2 className="text-foreground text-lg font-semibold">
              {t("accountDialog:warnings.duplicateAccount.title")}
            </h2>
          </div>
        </div>
      }
      footer={
        <div className="space-y-density-2">
          <ActionGroup
            layout="stack-on-narrow"
            className="gap-y-density-3 gap-x-3"
          >
            <Button
              type="button"
              onClick={onCancel}
              variant="secondary"
              className="flex-1"
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="button"
              onClick={onContinue}
              variant="warning"
              className="flex-1"
              data-testid={
                ACCOUNT_MANAGEMENT_TEST_IDS.duplicateWarningContinueButton
              }
            >
              {t("accountDialog:warnings.duplicateAccount.actions.continue")}
            </Button>
          </ActionGroup>
          <Button
            type="button"
            onClick={onDisableWarningAndContinue}
            variant="link"
            size="sm"
            className="w-full text-xs"
          >
            {t(
              "accountDialog:warnings.duplicateAccount.actions.disableAndContinue",
            )}
          </Button>
        </div>
      }
    >
      <Alert
        variant="warning"
        title={t("accountDialog:warnings.duplicateAccount.warningTitle")}
        description={
          hasExactUserMatch
            ? t("accountDialog:warnings.duplicateAccount.descriptionExact", {
                siteUrl,
                userId: String(existingUserId ?? ""),
                username: existingUsername ?? "",
              })
            : t("accountDialog:warnings.duplicateAccount.description", {
                siteUrl,
                count: existingAccountsCount,
              })
        }
      />
    </Modal>
  )
}
