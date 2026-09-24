import { Info } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ManagedSiteDeploymentLink } from "~/components/ManagedSiteDeploymentLink"
import { ActionGroup } from "~/components/ui/ActionGroup"
import { Alert } from "~/components/ui/Alert"
import { Button } from "~/components/ui/button"
import { Modal } from "~/components/ui/Dialog/Modal"
import type { ManagedSiteType } from "~/constants/siteType"

export interface ManagedSiteConfigPromptDialogProps {
  isOpen: boolean
  managedSiteLabel: string
  /** Resolves the provider deployment docs shown to users who host none yet. */
  managedSiteType: ManagedSiteType | null
  missingMessage: string
  onClose: () => void
  onOpenSettings: () => void
}

/**
 * Explains the managed-site prerequisite before the account-to-channel shortcut
 * can run: the selected provider is a gateway the user deploys themselves, so a
 * fresh install is expected to lack it rather than broken.
 */
export function ManagedSiteConfigPromptDialog({
  isOpen,
  managedSiteLabel,
  managedSiteType,
  missingMessage,
  onClose,
  onOpenSettings,
}: ManagedSiteConfigPromptDialogProps) {
  const { t } = useTranslation(["accountDialog", "common"])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("accountDialog:warnings.managedSiteConfig.title", {
        managedSite: managedSiteLabel,
      })}
      size="sm"
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Info className="text-info-indicator h-5 w-5" />
            <h2 className="text-foreground text-lg font-semibold">
              {t("accountDialog:warnings.managedSiteConfig.title", {
                managedSite: managedSiteLabel,
              })}
            </h2>
          </div>
        </div>
      }
      footer={
        <ActionGroup
          layout="stack-on-narrow"
          className="gap-y-density-3 gap-x-3"
        >
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="flex-1"
          >
            {t("accountDialog:warnings.managedSiteConfig.actions.later")}
          </Button>
          <Button
            type="button"
            onClick={onOpenSettings}
            variant="default"
            className="flex-1"
          >
            {t("accountDialog:warnings.managedSiteConfig.actions.openSettings")}
          </Button>
        </ActionGroup>
      }
    >
      <div className="space-y-density-3">
        <Alert
          variant="info"
          title={t("accountDialog:warnings.managedSiteConfig.alertTitle", {
            managedSite: managedSiteLabel,
          })}
          description={t(
            "accountDialog:warnings.managedSiteConfig.description",
            {
              message: missingMessage,
            },
          )}
        />
        <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
          {t("accountDialog:warnings.managedSiteConfig.benefit", {
            managedSite: managedSiteLabel,
          })}
        </p>
        <p className="dark:text-secondary-foreground text-muted-foreground text-sm">
          {t("accountDialog:warnings.managedSiteConfig.nextSteps", {
            managedSite: managedSiteLabel,
          })}
        </p>
        {managedSiteType ? (
          <ManagedSiteDeploymentLink
            siteType={managedSiteType}
            withSettingsAnchor={false}
          />
        ) : null}
      </div>
    </Modal>
  )
}
