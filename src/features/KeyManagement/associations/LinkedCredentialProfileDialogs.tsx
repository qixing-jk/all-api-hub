import { KiloCodeProfileExportDialog } from "~/features/ApiCredentialProfiles/export/KiloCodeProfileExportDialog"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/verification/VerifyApiCredentialProfileDialog"
import { ClaudeCodeRouterImportDialog } from "~/features/CredentialExport/ClaudeCodeRouterImportDialog"
import { CursorPlusExportDialog } from "~/features/CredentialExport/CursorPlusExportDialog"
import {
  createProfileDeeplinkExportRequest,
  DEEPLINK_EXPORT_TARGETS,
  DeeplinkExportDialog,
} from "~/features/CredentialExport/DeeplinkExportDialog"
import { KelivoExportDialog } from "~/features/CredentialExport/KelivoExportDialog"
import { type LinkedCredentialProfileActionsController } from "~/features/KeyManagement/associations/useLinkedCredentialProfileActions"
import { VerifyCliSupportDialog } from "~/features/Verification/cli"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

interface LinkedCredentialProfileDialogsProps {
  controller: LinkedCredentialProfileActionsController
  profile: ApiCredentialProfile
}

/** Renders complete-key dialogs outside the linked profile action toolbar. */
export function LinkedCredentialProfileDialogs({
  controller,
  profile,
}: LinkedCredentialProfileDialogsProps) {
  const {
    activeDialog,
    claudeCodeRouterApiKey,
    claudeCodeRouterBaseUrl,

    closeDialog,
    exportSource,
  } = controller

  switch (activeDialog) {
    case "cc-switch":
      return (
        <DeeplinkExportDialog
          request={createProfileDeeplinkExportRequest({
            target: DEEPLINK_EXPORT_TARGETS.CCSwitch,
            source: exportSource,
            baseContext: controller.analyticsContext,
          })}
          onClose={closeDialog}
        />
      )
    case "ai-toolbox":
      return (
        <DeeplinkExportDialog
          request={createProfileDeeplinkExportRequest({
            target: DEEPLINK_EXPORT_TARGETS.AiToolbox,
            source: exportSource,
            baseContext: controller.analyticsContext,
          })}
          onClose={closeDialog}
        />
      )
    case "cursor-plus":
      return (
        <CursorPlusExportDialog
          isOpen
          onClose={closeDialog}
          source={exportSource}
          analyticsContext={{
            ...controller.analyticsContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileCursorPlusProviderConfig,
          }}
        />
      )
    case "kilo-code":
      return (
        <KiloCodeProfileExportDialog
          isOpen
          onClose={closeDialog}
          profile={profile}
        />
      )
    case "kelivo":
      return (
        <KelivoExportDialog
          isOpen
          onClose={closeDialog}
          initialValue={profile}
          analyticsContext={{
            ...controller.analyticsContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileKelivoImportCode,
          }}
        />
      )
    case "claude-code-router":
      return (
        <ClaudeCodeRouterImportDialog
          isOpen
          onClose={closeDialog}
          source={exportSource}
          routerBaseUrl={claudeCodeRouterBaseUrl ?? ""}
          routerApiKey={claudeCodeRouterApiKey}
          analyticsContext={{
            ...controller.analyticsContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.ImportApiCredentialProfileToClaudeCodeRouter,
          }}
        />
      )
    case "verify-api":
      return (
        <VerifyApiCredentialProfileDialog
          isOpen
          onClose={closeDialog}
          profile={profile}
        />
      )
    case "verify-cli":
      return (
        <VerifyCliSupportDialog
          isOpen
          onClose={closeDialog}
          profile={profile}
        />
      )
    case null:
      return null
  }
}
