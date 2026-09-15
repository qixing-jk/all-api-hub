import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CursorPlusExportDialog } from "~/components/CursorPlusExportDialog"
import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { KelivoExportDialog } from "~/components/KelivoExportDialog"
import { ConfirmDialog } from "~/components/ui"
import { createProfileCredentialExportSource } from "~/services/apiCredentialProfiles/credentialExport"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"

import type { ApiCredentialProfilesController } from "../hooks/useApiCredentialProfilesController"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "../testIds"
import { ApiCredentialProfileDialog } from "./ApiCredentialProfileDialog"
import { KiloCodeProfileExportDialog } from "./KiloCodeProfileExportDialog"
import { VerifyApiCredentialProfileDialog } from "./VerifyApiCredentialProfileDialog"

interface ApiCredentialProfilesDialogsProps {
  controller: ApiCredentialProfilesController
}

const apiCredentialProfileThirdPartyExportContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

/**
 * Dialog layer for API credential profile actions (edit, verify, export, delete).
 */
export function ApiCredentialProfilesDialogs({
  controller,
}: ApiCredentialProfilesDialogsProps) {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
  ])
  const ccSwitchSource = useMemo(
    () =>
      controller.ccSwitchProfile
        ? createProfileCredentialExportSource(controller.ccSwitchProfile)
        : null,
    [controller.ccSwitchProfile],
  )
  const cursorPlusSource = useMemo(
    () =>
      controller.cursorPlusProfile
        ? createProfileCredentialExportSource(controller.cursorPlusProfile)
        : null,
    [controller.cursorPlusProfile],
  )
  const claudeCodeRouterSource = useMemo(
    () =>
      controller.claudeCodeRouterProfile
        ? createProfileCredentialExportSource(
            controller.claudeCodeRouterProfile,
          )
        : null,
    [controller.claudeCodeRouterProfile],
  )

  return (
    <>
      <ApiCredentialProfileDialog
        isOpen={controller.isEditorOpen}
        onClose={() => controller.setIsEditorOpen(false)}
        profile={controller.editingProfile}
        addPrefill={controller.addPrefill}
        tags={controller.tags}
        createTag={controller.createTag}
        renameTag={controller.renameTag}
        deleteTag={controller.deleteTag}
        onSave={controller.handleSave}
      />

      <VerifyApiCredentialProfileDialog
        isOpen={Boolean(controller.verifyingProfile)}
        onClose={() => controller.setVerifyingProfile(null)}
        profile={controller.verifyingProfile}
      />

      {controller.cliVerifyingProfile ? (
        // Reuse the shared profile-backed CLI dialog so stored profiles skip token selection.
        <VerifyCliSupportDialog
          isOpen={true}
          onClose={() => controller.setCliVerifyingProfile(null)}
          profile={controller.cliVerifyingProfile}
        />
      ) : null}

      {ccSwitchSource ? (
        <CCSwitchExportDialog
          isOpen={true}
          onClose={() => controller.setCCSwitchProfile(null)}
          source={ccSwitchSource}
          analyticsContext={{
            ...apiCredentialProfileThirdPartyExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToCCSwitch,
          }}
        />
      ) : null}

      {cursorPlusSource ? (
        <CursorPlusExportDialog
          isOpen={true}
          onClose={() => controller.setCursorPlusProfile(null)}
          source={cursorPlusSource}
          analyticsContext={{
            ...apiCredentialProfileThirdPartyExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileCursorPlusProviderConfig,
          }}
        />
      ) : null}

      {controller.kiloCodeProfile ? (
        <KiloCodeProfileExportDialog
          isOpen={true}
          onClose={() => controller.setKiloCodeProfile(null)}
          profile={controller.kiloCodeProfile}
        />
      ) : null}

      {controller.kelivoProfile ? (
        <KelivoExportDialog
          isOpen={true}
          onClose={() => controller.setKelivoProfile(null)}
          initialValue={controller.kelivoProfile}
          analyticsContext={{
            ...apiCredentialProfileThirdPartyExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileKelivoImportCode,
          }}
        />
      ) : null}

      {claudeCodeRouterSource ? (
        <ClaudeCodeRouterImportDialog
          isOpen={true}
          onClose={() => controller.setClaudeCodeRouterProfile(null)}
          source={claudeCodeRouterSource}
          routerBaseUrl={controller.claudeCodeRouterBaseUrl}
          routerApiKey={controller.claudeCodeRouterApiKey}
          analyticsContext={{
            ...apiCredentialProfileThirdPartyExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.ImportApiCredentialProfileToClaudeCodeRouter,
          }}
        />
      ) : null}

      <ConfirmDialog
        intent="destructive"
        isOpen={Boolean(controller.deletingProfile)}
        onClose={() =>
          controller.isDeleting ? null : controller.closeDeleteDialog()
        }
        title={t("apiCredentialProfiles:delete.title")}
        description={t("apiCredentialProfiles:delete.description")}
        confirmLabel={t("common:actions.delete")}
        workingLabel={t("common:status.deleting")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={controller.handleConfirmDelete}
        isWorking={controller.isDeleting}
        confirmButtonTestId={
          API_CREDENTIAL_PROFILES_TEST_IDS.deleteConfirmButton
        }
        details={
          controller.deletingProfile ? (
            <div className="space-y-density-1 text-sm">
              <div className="dark:text-secondary-foreground text-muted-foreground">
                {controller.deletingProfile.name}
              </div>
              <div className="text-muted-foreground text-xs">
                {getApiVerificationApiTypeLabel(
                  t,
                  controller.deletingProfile.apiType,
                )}{" "}
                · {controller.deletingProfile.baseUrl}
              </div>
            </div>
          ) : null
        }
      />
    </>
  )
}
