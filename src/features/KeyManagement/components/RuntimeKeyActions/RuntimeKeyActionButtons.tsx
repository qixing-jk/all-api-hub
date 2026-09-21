import { Copy, Pencil, Terminal, Trash2, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { DeeplinkExportTarget } from "~/components/DeeplinkExportDialog"
import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { IconButton } from "~/components/ui"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import {
  KeyResourceActionGroup,
  KeyResourceActionToolbar,
  type KeyResourceCredentialAssociation,
} from "~/features/KeyManagement/components/KeyResourceCard"
import type { KeyResourceActionPolicy } from "~/features/KeyManagement/presentation/keyResourceCard"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import type { DisplaySiteData } from "~/types"

import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"
import {
  hasRuntimeKeyIntegrationActionGroup,
  RuntimeKeyIntegrationActionGroup,
  RuntimeKeyIntegrationDialogs,
} from "./RuntimeKeyIntegrationActions"
import { useRuntimeKeyIntegrationActions } from "./useRuntimeKeyIntegrationActions"
import { useRuntimeKeyVerificationActions } from "./useRuntimeKeyVerificationActions"

export interface RuntimeKeyActionButtonsProps {
  association?: KeyResourceCredentialAssociation
  actionPolicy: KeyResourceActionPolicy
  runtimeKey: AccountRuntimeKey
  copyKey: (
    account: DisplaySiteData,
    runtimeKey: AccountRuntimeKey,
  ) => Promise<void>
  handleEditKey: (runtimeKey: AccountRuntimeKey) => void
  handleDeleteKey: (runtimeKey: AccountRuntimeKey) => void
  account: DisplaySiteData
  onOpenDeeplinkExport?: (target: DeeplinkExportTarget) => void
  managedSiteStatus?: ManagedSiteTokenChannelStatus
  onManagedSiteImportSuccess?: (
    runtimeKey: AccountRuntimeKey,
  ) => void | Promise<void>
  guidedManagedSiteImportRequest?: string
}

/**
 * Renders action buttons for a runtimeKey (copy, export, edit/delete).
 * @param props Component props container.
 * @param props.actionPolicy Provider capability policy controlling available runtimeKey actions.
 * @param props.association Current API credential-library relationship.
 * @param props.runtimeKey Token being acted upon.
 * @param props.copyKey Clipboard copy handler.
 * @param props.handleEditKey Edit action callback.
 * @param props.handleDeleteKey Delete action callback.
 * @param props.account Account context for integrations.
 * @param props.managedSiteStatus Current managed-site status used to reuse duplicate-review results when available.
 * @param props.onOpenDeeplinkExport Optional deeplink export opener for a target destination.
 * @param props.onManagedSiteImportSuccess Optional managed-site import success callback.
 * @param props.guidedManagedSiteImportRequest Request key that highlights the managed-site import action.
 */
export function RuntimeKeyActionButtons({
  actionPolicy,
  runtimeKey,
  copyKey,
  handleEditKey,
  handleDeleteKey,
  account,
  managedSiteStatus,
  onOpenDeeplinkExport,
  onManagedSiteImportSuccess,
  guidedManagedSiteImportRequest,
  association,
}: RuntimeKeyActionButtonsProps) {
  const { t } = useTranslation("keyManagement")
  const integrationActions = useRuntimeKeyIntegrationActions({
    account,
    enabled: actionPolicy.exportSecret,
    guidedManagedSiteImportRequest,
    managedSiteStatus,
    onManagedSiteImportSuccess,
    runtimeKey,
  })
  const {
    cliVerifyingProfile,
    closeCliVerification,
    closeVerification,
    handleVerifyApi,
    handleVerifyCliSupport,
    verifyingProfile,
  } = useRuntimeKeyVerificationActions({
    account,
    enabled: actionPolicy.verifySecret,
    runtimeKey,
  })

  const hasQuickActions = actionPolicy.copySecret
  const hasIntegrations = actionPolicy.exportSecret
  const hasIntegrationGroup = hasRuntimeKeyIntegrationActionGroup(
    actionPolicy,
    association,
  )
  const hasDiagnostics = actionPolicy.verifySecret

  return (
    <>
      <RuntimeKeyIntegrationDialogs
        account={account}
        controller={integrationActions}
        enabled={actionPolicy.exportSecret}
        runtimeKey={runtimeKey}
      />
      {actionPolicy.verifySecret ? (
        <>
          <VerifyApiCredentialProfileDialog
            isOpen={Boolean(verifyingProfile)}
            onClose={closeVerification}
            profile={verifyingProfile}
          />
          {cliVerifyingProfile ? (
            <VerifyCliSupportDialog
              isOpen={true}
              onClose={closeCliVerification}
              profile={cliVerifyingProfile}
            />
          ) : null}
        </>
      ) : null}
      <KeyResourceActionToolbar
        label={t("keyManagement:actionToolbar.label")}
        testId={KEY_MANAGEMENT_TEST_IDS.tokenRowActions}
      >
        {hasQuickActions ? (
          <KeyResourceActionGroup
            label={t("keyManagement:actionToolbar.quickActions")}
          >
            {actionPolicy.copySecret ? (
              <IconButton
                aria-label={t("common:actions.copyKey")}
                size="sm"
                variant="ghost"
                onClick={() => void copyKey(account, runtimeKey)}
              >
                <Copy className="text-muted-foreground h-4 w-4" />
              </IconButton>
            ) : null}
          </KeyResourceActionGroup>
        ) : null}
        <RuntimeKeyIntegrationActionGroup
          account={account}
          actionPolicy={actionPolicy}
          association={association}
          controller={integrationActions}
          onOpenDeeplinkExport={onOpenDeeplinkExport}
          runtimeKey={runtimeKey}
        />
        {actionPolicy.verifySecret ? (
          <KeyResourceActionGroup
            label={t("keyManagement:actionToolbar.diagnostics")}
            separated={hasQuickActions || hasIntegrationGroup}
          >
            <IconButton
              aria-label={t("keyManagement:actions.verifyApi")}
              size="sm"
              variant="ghost"
              data-testid={KEY_MANAGEMENT_TEST_IDS.verifyTokenApiButton}
              onClick={() => void handleVerifyApi()}
            >
              <Wrench className="text-link h-4 w-4" />
            </IconButton>
            <IconButton
              aria-label={t("keyManagement:actions.verifyCliSupport")}
              size="sm"
              variant="ghost"
              data-testid={KEY_MANAGEMENT_TEST_IDS.verifyTokenCliSupportButton}
              onClick={() => void handleVerifyCliSupport()}
            >
              <Terminal className="text-link h-4 w-4" />
            </IconButton>
          </KeyResourceActionGroup>
        ) : null}
        {actionPolicy.edit || actionPolicy.delete ? (
          <KeyResourceActionGroup
            label={t("keyManagement:actionToolbar.management")}
            separated={hasQuickActions || hasIntegrations || hasDiagnostics}
          >
            {actionPolicy.edit ? (
              <IconButton
                aria-label={t("actions.editKey")}
                size="sm"
                variant="ghost"
                onClick={() => handleEditKey(runtimeKey)}
              >
                <Pencil className="text-theme-500 dark:text-theme-400 h-4 w-4" />
              </IconButton>
            ) : null}
            {actionPolicy.delete ? (
              <IconButton
                aria-label={t("actions.deleteKey")}
                size="sm"
                variant="destructiveGhost"
                onClick={() => handleDeleteKey(runtimeKey)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            ) : null}
          </KeyResourceActionGroup>
        ) : null}
      </KeyResourceActionToolbar>
    </>
  )
}
