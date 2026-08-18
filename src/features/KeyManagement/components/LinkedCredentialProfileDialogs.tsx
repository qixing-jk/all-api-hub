import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import { CursorPlusExportDialog } from "~/components/CursorPlusExportDialog"
import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { KelivoExportDialog } from "~/components/KelivoExportDialog"
import { KiloCodeProfileExportDialog } from "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import {
  LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
  type LinkedCredentialProfileActionsController,
} from "./useLinkedCredentialProfileActions"

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
    cliProxyPayload,
    closeDialog,
    exportAccount,
    exportRuntimeKey,
    exportToken,
  } = controller

  switch (activeDialog) {
    case "cc-switch":
      return (
        <CCSwitchExportDialog
          isOpen
          onClose={closeDialog}
          account={exportAccount}
          token={exportToken}
          analyticsContext={{
            ...LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToCCSwitch,
          }}
        />
      )
    case "cursor-plus":
      return (
        <CursorPlusExportDialog
          isOpen
          onClose={closeDialog}
          account={exportAccount}
          runtimeKey={exportRuntimeKey}
          analyticsContext={{
            ...LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
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
            ...LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileKelivoImportCode,
          }}
        />
      )
    case "cli-proxy":
      return (
        <CliProxyExportDialog
          isOpen
          onClose={closeDialog}
          account={cliProxyPayload.account}
          token={cliProxyPayload.token}
          apiTypeHint={cliProxyPayload.apiTypeHint}
          analyticsContext={{
            ...LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.ImportApiCredentialProfileToCliProxy,
          }}
        />
      )
    case "claude-code-router":
      return (
        <ClaudeCodeRouterImportDialog
          isOpen
          onClose={closeDialog}
          account={exportAccount}
          token={exportToken}
          routerBaseUrl={claudeCodeRouterBaseUrl ?? ""}
          routerApiKey={claudeCodeRouterApiKey}
          analyticsContext={{
            ...LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
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
