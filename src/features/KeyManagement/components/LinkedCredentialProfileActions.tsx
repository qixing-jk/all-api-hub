import { Terminal, Wrench } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
  EXPORT_ACTION_TARGETS,
  ExportActionsMenu,
} from "~/components/ExportActionsMenu"
import { ManagedSiteImportButton } from "~/components/ManagedSiteImportButton"
import { IconButton } from "~/components/ui"
import {
  KeyResourceActionGroup,
  KeyResourceActionToolbar,
} from "~/features/KeyManagement/components/KeyResourceCard"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import { LinkedCredentialProfileDialogs } from "./LinkedCredentialProfileDialogs"
import {
  LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
  useLinkedCredentialProfileActions,
} from "./useLinkedCredentialProfileActions"

/** Renders integrations and diagnostics that require a complete linked profile key. */
export function LinkedCredentialProfileActions({
  managementActions,
  profile,
}: {
  managementActions?: ReactNode
  profile: ApiCredentialProfile
}) {
  const { t } = useTranslation("keyManagement")
  const controller = useLinkedCredentialProfileActions(profile)

  return (
    <>
      <LinkedCredentialProfileDialogs
        controller={controller}
        profile={profile}
      />
      <KeyResourceActionToolbar label={t("keyManagement:actionToolbar.label")}>
        <KeyResourceActionGroup
          label={t("keyManagement:actionToolbar.integrationsAndExport")}
        >
          <ManagedSiteImportButton
            managedSiteType={controller.managedSiteType}
            managedSiteLabel={controller.managedSiteLabel}
            onImport={controller.handleManagedSiteImport}
            testId={KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton}
          />
          <ExportActionsMenu
            triggerTestId={
              KEY_MANAGEMENT_TEST_IDS.linkedProfileExportMenuButton
            }
            triggerAnalyticsAction={{
              ...LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
              actionId:
                PRODUCT_ANALYTICS_ACTION_IDS.OpenApiCredentialExportMenu,
            }}
            actions={{
              [EXPORT_ACTION_TARGETS.CherryStudio]: {
                onSelect: controller.handleCherryStudio,
              },
              [EXPORT_ACTION_TARGETS.Kelivo]: {
                onSelect: () => controller.openDialog("kelivo"),
              },
              [EXPORT_ACTION_TARGETS.CCSwitch]: {
                onSelect: () => controller.openDialog("cc-switch"),
              },
              [EXPORT_ACTION_TARGETS.CursorPlus]: {
                onSelect: () => controller.openDialog("cursor-plus"),
              },
              [EXPORT_ACTION_TARGETS.KiloCode]: {
                onSelect: () => controller.openDialog("kilo-code"),
              },
              [EXPORT_ACTION_TARGETS.CliProxy]: {
                onSelect: controller.handleCliProxy,
              },
              [EXPORT_ACTION_TARGETS.ClaudeCodeRouter]: {
                onSelect: controller.handleClaudeCodeRouter,
              },
            }}
          />
        </KeyResourceActionGroup>
        <KeyResourceActionGroup
          label={t("keyManagement:actionToolbar.diagnostics")}
          separated
        >
          <IconButton
            aria-label={t("keyManagement:actions.verifyApi")}
            size="sm"
            variant="ghost"
            onClick={() => controller.openDialog("verify-api")}
            analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.VerifyApiCredential}
          >
            <Wrench className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </IconButton>
          <IconButton
            aria-label={t("keyManagement:actions.verifyCliSupport")}
            size="sm"
            variant="ghost"
            onClick={() => controller.openDialog("verify-cli")}
            analyticsAction={
              PRODUCT_ANALYTICS_ACTION_IDS.VerifyApiCredentialCliSupport
            }
          >
            <Terminal className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </IconButton>
        </KeyResourceActionGroup>
        {managementActions ? (
          <KeyResourceActionGroup
            label={t("keyManagement:actionToolbar.management")}
            separated
          >
            {managementActions}
          </KeyResourceActionGroup>
        ) : null}
      </KeyResourceActionToolbar>
    </>
  )
}
