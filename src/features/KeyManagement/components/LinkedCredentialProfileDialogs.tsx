import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CursorPlusExportDialog } from "~/components/CursorPlusExportDialog"
import {
  createProfileDeeplinkExportRequest,
  DEEPLINK_EXPORT_TARGETS,
  DeeplinkExportDialog,
} from "~/components/DeeplinkExportDialog"
import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { KelivoExportDialog } from "~/components/KelivoExportDialog"
import { KiloCodeProfileExportDialog } from "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import { type LinkedCredentialProfileActionsController } from "./useLinkedCredentialProfileActions"

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
