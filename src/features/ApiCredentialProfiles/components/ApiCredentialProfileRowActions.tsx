import { Copy, Cpu, Pencil, Terminal, Trash2, Wrench } from "lucide-react"
import type { RefObject } from "react"
import { useTranslation } from "react-i18next"

import { ExportActionsMenu } from "~/components/ExportActionsMenu"
import { ManagedSiteImportButton } from "~/components/ManagedSiteImportButton"
import { IconButton } from "~/components/ui"
import type { ManagedSiteType } from "~/constants/siteType"
import {
  KeyResourceActionGroup,
  KeyResourceActionToolbar,
} from "~/features/KeyManagement/components/KeyResourceCard"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import {
  API_CREDENTIAL_PROFILE_EXPORT_ACTIONS,
  type ApiCredentialProfileExportAction,
} from "../contracts"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "../testIds"

interface ApiCredentialProfileRowActionsProps {
  profile: ApiCredentialProfile
  managedSiteImportButtonRef: RefObject<HTMLButtonElement | null>
  managedSiteType: ManagedSiteType
  managedSiteLabel: string
  isImportEntryHighlighted: boolean
  onCopyBundle: (profile: ApiCredentialProfile) => void
  onExport: (
    profile: ApiCredentialProfile,
    action: ApiCredentialProfileExportAction,
  ) => void
  onVerify: (profile: ApiCredentialProfile) => void
  onVerifyCliSupport: (profile: ApiCredentialProfile) => void
  onOpenModelManagement: (profile: ApiCredentialProfile) => void
  onEdit: (profile: ApiCredentialProfile) => void
  onDelete: (profile: ApiCredentialProfile) => void
}

/** Maps one API credential profile to its row-level action groups. */
export function ApiCredentialProfileRowActions({
  profile,
  managedSiteImportButtonRef,
  managedSiteType,
  managedSiteLabel,
  isImportEntryHighlighted,
  onCopyBundle,
  onExport,
  onVerify,
  onVerifyCliSupport,
  onOpenModelManagement,
  onEdit,
  onDelete,
}: ApiCredentialProfileRowActionsProps) {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "keyManagement",
    "common",
  ])
  const optionsEntrypoint = PRODUCT_ANALYTICS_ENTRYPOINTS.Options
  const rowActionsSurface =
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions

  return (
    <KeyResourceActionToolbar
      label={t("keyManagement:actionToolbar.label")}
      testId={API_CREDENTIAL_PROFILES_TEST_IDS.toolbar}
    >
      <KeyResourceActionGroup
        label={t("keyManagement:actionToolbar.quickActions")}
      >
        <IconButton
          aria-label={t("apiCredentialProfiles:actions.copyBundle")}
          size="sm"
          variant="ghost"
          onClick={() => onCopyBundle(profile)}
          data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.copyBundleButton}
          analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialBundle}
        >
          <Copy className="h-4 w-4" />
        </IconButton>
      </KeyResourceActionGroup>
      <KeyResourceActionGroup
        label={t("keyManagement:actionToolbar.integrationsAndExport")}
        separated
      >
        <ManagedSiteImportButton
          buttonRef={managedSiteImportButtonRef}
          managedSiteType={managedSiteType}
          managedSiteLabel={managedSiteLabel}
          onImport={() =>
            onExport(profile, API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ManagedSite)
          }
          testId={API_CREDENTIAL_PROFILES_TEST_IDS.importToManagedSiteButton}
          highlighted={isImportEntryHighlighted}
        />
        <ExportActionsMenu
          triggerTestId={API_CREDENTIAL_PROFILES_TEST_IDS.exportMenuButton}
          triggerAnalyticsAction={
            PRODUCT_ANALYTICS_ACTION_IDS.OpenApiCredentialExportMenu
          }
          actions={{
            [API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CherryStudio]: {
              onSelect: () =>
                onExport(
                  profile,
                  API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CherryStudio,
                ),
            },
            [API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.Kelivo]: {
              testId:
                API_CREDENTIAL_PROFILES_TEST_IDS.copyKelivoImportCodeMenuItem,
              onSelect: () =>
                onExport(profile, API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.Kelivo),
            },
            [API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CCSwitch]: {
              testId: API_CREDENTIAL_PROFILES_TEST_IDS.exportToCCSwitchMenuItem,
              onSelect: () =>
                onExport(
                  profile,
                  API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CCSwitch,
                ),
            },
            [API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CursorPlus]: {
              testId:
                API_CREDENTIAL_PROFILES_TEST_IDS.exportToCursorPlusMenuItem,
              onSelect: () =>
                onExport(
                  profile,
                  API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CursorPlus,
                ),
            },
            [API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.KiloCode]: {
              testId: API_CREDENTIAL_PROFILES_TEST_IDS.exportToKiloCodeMenuItem,
              onSelect: () =>
                onExport(
                  profile,
                  API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.KiloCode,
                ),
            },
            [API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CliProxy]: {
              testId: API_CREDENTIAL_PROFILES_TEST_IDS.exportToCliProxyMenuItem,
              onSelect: () =>
                onExport(
                  profile,
                  API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.CliProxy,
                ),
            },
            [API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ClaudeCodeRouter]: {
              testId:
                API_CREDENTIAL_PROFILES_TEST_IDS.exportToClaudeCodeRouterMenuItem,
              onSelect: () =>
                onExport(
                  profile,
                  API_CREDENTIAL_PROFILE_EXPORT_ACTIONS.ClaudeCodeRouter,
                ),
            },
          }}
        />
      </KeyResourceActionGroup>
      <KeyResourceActionGroup
        label={t("keyManagement:actionToolbar.diagnostics")}
        separated
      >
        <IconButton
          aria-label={t("apiCredentialProfiles:actions.verifyApi")}
          size="sm"
          variant="ghost"
          onClick={() => onVerify(profile)}
          data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.verifyButton}
          analyticsAction={PRODUCT_ANALYTICS_ACTION_IDS.VerifyApiCredential}
        >
          <Wrench className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </IconButton>
        <IconButton
          aria-label={t("apiCredentialProfiles:actions.verifyCliSupport")}
          size="sm"
          variant="ghost"
          onClick={() => onVerifyCliSupport(profile)}
          analyticsAction={
            PRODUCT_ANALYTICS_ACTION_IDS.VerifyApiCredentialCliSupport
          }
        >
          <Terminal className="h-4 w-4 text-sky-600 dark:text-sky-400" />
        </IconButton>
      </KeyResourceActionGroup>
      <KeyResourceActionGroup
        label={t("keyManagement:actionToolbar.management")}
        separated
      >
        <IconButton
          aria-label={t("apiCredentialProfiles:actions.openModelManagement")}
          size="sm"
          variant="ghost"
          onClick={() => onOpenModelManagement(profile)}
          data-testid={
            API_CREDENTIAL_PROFILES_TEST_IDS.openModelManagementButton
          }
          analyticsAction={{
            featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.OpenApiCredentialModelManagement,
            surfaceId: rowActionsSurface,
            entrypoint: optionsEntrypoint,
          }}
        >
          <Cpu className="h-4 w-4" />
        </IconButton>
        <IconButton
          aria-label={t("common:actions.edit")}
          size="sm"
          variant="ghost"
          onClick={() => onEdit(profile)}
          data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.editButton}
          analyticsAction={
            PRODUCT_ANALYTICS_ACTION_IDS.OpenUpdateApiCredentialProfileDialog
          }
        >
          <Pencil className="h-4 w-4 text-blue-500 dark:text-blue-400" />
        </IconButton>
        <IconButton
          aria-label={t("common:actions.delete")}
          size="sm"
          variant="destructiveGhost"
          onClick={() => onDelete(profile)}
          data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.deleteTriggerButton}
          analyticsAction={
            PRODUCT_ANALYTICS_ACTION_IDS.DeleteApiCredentialProfile
          }
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </KeyResourceActionGroup>
    </KeyResourceActionToolbar>
  )
}
