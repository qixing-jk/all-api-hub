import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { DestructiveConfirmDialog } from "~/components/ui"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"

import type { ApiCredentialProfilesController } from "../hooks/useApiCredentialProfilesController"
import {
  createCliProxyExportPayload,
  createExportAccount,
  createExportToken,
} from "../utils/exportShims"
import { ApiCredentialProfileDialog } from "./ApiCredentialProfileDialog"
import { KiloCodeProfileExportDialog } from "./KiloCodeProfileExportDialog"
import { VerifyApiCredentialProfileDialog } from "./VerifyApiCredentialProfileDialog"

/**
 * Maps apiType values to the i18n key segment used by `aiApiVerification` labels.
 */
function apiTypeLabelKey(apiType: ApiVerificationApiType) {
  return apiType === API_TYPES.OPENAI_COMPATIBLE ? "openaiCompatible" : apiType
}

interface ApiCredentialProfilesDialogsProps {
  controller: ApiCredentialProfilesController
}

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
  const cliProxyPayload = controller.cliProxyProfile
    ? createCliProxyExportPayload(controller.cliProxyProfile)
    : null

  return (
    <>
      <ApiCredentialProfileDialog
        isOpen={controller.isEditorOpen}
        onClose={() => controller.setIsEditorOpen(false)}
        profile={controller.editingProfile}
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

      {controller.ccSwitchProfile ? (
        <CCSwitchExportDialog
          isOpen={true}
          onClose={() => controller.setCCSwitchProfile(null)}
          account={createExportAccount(controller.ccSwitchProfile)}
          token={createExportToken(controller.ccSwitchProfile)}
        />
      ) : null}

      {controller.kiloCodeProfile ? (
        <KiloCodeProfileExportDialog
          isOpen={true}
          onClose={() => controller.setKiloCodeProfile(null)}
          profile={controller.kiloCodeProfile}
        />
      ) : null}

      {cliProxyPayload ? (
        <CliProxyExportDialog
          isOpen={true}
          onClose={() => controller.setCliProxyProfile(null)}
          account={cliProxyPayload.account}
          token={cliProxyPayload.token}
          apiTypeHint={cliProxyPayload.apiTypeHint}
        />
      ) : null}

      {controller.claudeCodeRouterProfile ? (
        <ClaudeCodeRouterImportDialog
          isOpen={true}
          onClose={() => controller.setClaudeCodeRouterProfile(null)}
          account={createExportAccount(controller.claudeCodeRouterProfile)}
          token={createExportToken(controller.claudeCodeRouterProfile)}
          routerBaseUrl={controller.claudeCodeRouterBaseUrl}
          routerApiKey={controller.claudeCodeRouterApiKey}
        />
      ) : null}

      <DestructiveConfirmDialog
        isOpen={Boolean(controller.deletingProfile)}
        onClose={() =>
          controller.isDeleting ? null : controller.closeDeleteDialog()
        }
        title={t("apiCredentialProfiles:delete.title")}
        description={t("apiCredentialProfiles:delete.description")}
        confirmLabel={t("common:actions.delete")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={controller.handleConfirmDelete}
        isWorking={controller.isDeleting}
        details={
          controller.deletingProfile ? (
            <div className="space-y-1 text-sm">
              <div className="dark:text-dark-text-secondary text-gray-600">
                {controller.deletingProfile.name}
              </div>
              <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
                {t(
                  `aiApiVerification:verifyDialog.apiTypes.${apiTypeLabelKey(controller.deletingProfile.apiType)}`,
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
