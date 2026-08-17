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

  return (
    <>
      <CCSwitchExportDialog
        isOpen={activeDialog === "cc-switch"}
        onClose={closeDialog}
        account={exportAccount}
        token={exportToken}
        analyticsContext={{
          ...LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToCCSwitch,
        }}
      />
      <CursorPlusExportDialog
        isOpen={activeDialog === "cursor-plus"}
        onClose={closeDialog}
        account={exportAccount}
        runtimeKey={exportRuntimeKey}
        analyticsContext={{
          ...LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileCursorPlusProviderConfig,
        }}
      />
      <KiloCodeProfileExportDialog
        isOpen={activeDialog === "kilo-code"}
        onClose={closeDialog}
        profile={profile}
      />
      <KelivoExportDialog
        isOpen={activeDialog === "kelivo"}
        onClose={closeDialog}
        initialValue={profile}
        analyticsContext={{
          ...LINKED_CREDENTIAL_PROFILE_ANALYTICS_CONTEXT,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileKelivoImportCode,
        }}
      />
      <CliProxyExportDialog
        isOpen={activeDialog === "cli-proxy"}
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
      <ClaudeCodeRouterImportDialog
        isOpen={activeDialog === "claude-code-router"}
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
      <VerifyApiCredentialProfileDialog
        isOpen={activeDialog === "verify-api"}
        onClose={closeDialog}
        profile={profile}
      />
      <VerifyCliSupportDialog
        isOpen={activeDialog === "verify-cli"}
        onClose={closeDialog}
        profile={profile}
      />
    </>
  )
}
