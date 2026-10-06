import { useTranslation } from "react-i18next"

import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { ConfirmDialog } from "~/components/ui"
import { getApiVerificationApiTypeLabel } from "~/services/verification/aiApiVerification/i18n"

import type { ApiCredentialProfilesController } from "../hooks/useApiCredentialProfilesController"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "../testIds"
import { ApiCredentialProfileDialog } from "./ApiCredentialProfileDialog"
import { ApiCredentialProfileExportDialogs } from "./ApiCredentialProfileExportDialogs"
import { VerifyApiCredentialProfileDialog } from "./VerifyApiCredentialProfileDialog"

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

      <ApiCredentialProfileExportDialogs controller={controller} />

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
