import { useTranslation } from "react-i18next"

import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import { CursorPlusExportDialog } from "~/components/CursorPlusExportDialog"
import {
  EXPORT_ACTION_TARGETS,
  ExportActionsMenu,
} from "~/components/ExportActionsMenu"
import { KelivoExportDialog } from "~/components/KelivoExportDialog"
import { KiloCodeExportDialog } from "~/components/KiloCodeExportDialog"
import { ManagedSiteImportButton } from "~/components/ManagedSiteImportButton"
import {
  KeyResourceActionGroup,
  type KeyResourceCredentialAssociation,
} from "~/features/KeyManagement/components/KeyResourceCard"
import type { KeyResourceActionPolicy } from "~/features/KeyManagement/presentation/keyResourceCard"
import { buildDisplayAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { AccountToken, DisplaySiteData } from "~/types"

import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"
import { TokenApiCredentialActions } from "./TokenApiCredentialActions"
import {
  TOKEN_KELIVO_EXPORT_ANALYTICS_CONTEXT,
  type TokenIntegrationActionsController,
} from "./useTokenIntegrationActions"

interface TokenIntegrationDialogsProps {
  account: DisplaySiteData
  controller: TokenIntegrationActionsController
  enabled: boolean
  token: AccountToken
}

interface TokenIntegrationActionGroupProps {
  account: DisplaySiteData
  actionPolicy: KeyResourceActionPolicy
  association?: KeyResourceCredentialAssociation
  controller: TokenIntegrationActionsController
  onOpenCCSwitchDialog?: () => void
  token: AccountToken
}

/** Reports whether a token row needs the integrations-and-export action group. */
export function hasTokenIntegrationActionGroup(
  actionPolicy: KeyResourceActionPolicy,
  association?: KeyResourceCredentialAssociation,
): boolean {
  return actionPolicy.exportSecret || Boolean(association)
}

/** Renders export dialogs outside the token action toolbar. */
export function TokenIntegrationDialogs({
  account,
  controller,
  enabled,
  token,
}: TokenIntegrationDialogsProps) {
  if (!enabled) return null

  const { dialogs } = controller

  return (
    <>
      <KiloCodeExportDialog
        isOpen={dialogs.kiloCode.isOpen}
        onClose={dialogs.kiloCode.close}
        initialSelectedSiteIds={[account.id]}
        initialSelectedTokenIdsBySite={{ [account.id]: [`${token.id}`] }}
      />
      {dialogs.cursorPlus.isOpen ? (
        <CursorPlusExportDialog
          isOpen={true}
          onClose={dialogs.cursorPlus.close}
          account={account}
          runtimeKey={buildDisplayAccountTokenRuntimeKey(account, token)}
        />
      ) : null}
      {dialogs.kelivo.input ? (
        <KelivoExportDialog
          isOpen={true}
          onClose={dialogs.kelivo.close}
          initialValue={dialogs.kelivo.input}
          analyticsContext={TOKEN_KELIVO_EXPORT_ANALYTICS_CONTEXT}
        />
      ) : null}
      <ClaudeCodeRouterImportDialog
        isOpen={dialogs.claudeCodeRouter.isOpen}
        onClose={dialogs.claudeCodeRouter.close}
        account={account}
        token={token}
        routerBaseUrl={dialogs.claudeCodeRouter.baseUrl}
        routerApiKey={dialogs.claudeCodeRouter.apiKey}
      />
      <CliProxyExportDialog
        isOpen={dialogs.cliProxy.isOpen}
        onClose={dialogs.cliProxy.close}
        account={account}
        token={token}
      />
    </>
  )
}

/** Renders managed-site import, third-party export, and credential actions. */
export function TokenIntegrationActionGroup({
  account,
  actionPolicy,
  association,
  controller,
  onOpenCCSwitchDialog,
  token,
}: TokenIntegrationActionGroupProps) {
  const { t } = useTranslation("keyManagement")
  const hasIntegrations = actionPolicy.exportSecret

  if (!hasTokenIntegrationActionGroup(actionPolicy, association)) return null

  const { exportActions, managedSiteImport } = controller

  return (
    <KeyResourceActionGroup
      label={t("keyManagement:actionToolbar.integrationsAndExport")}
      separated={actionPolicy.copySecret && hasIntegrations}
    >
      {hasIntegrations ? (
        <>
          <ManagedSiteImportButton
            buttonRef={managedSiteImport.buttonRef}
            managedSiteType={managedSiteImport.managedSiteType}
            managedSiteLabel={managedSiteImport.managedSiteLabel}
            onImport={managedSiteImport.onImport}
            testId={KEY_MANAGEMENT_TEST_IDS.importToManagedSiteButton}
            highlighted={managedSiteImport.highlighted}
          />
          <ExportActionsMenu
            triggerTestId={KEY_MANAGEMENT_TEST_IDS.exportMenuButton}
            actions={{
              [EXPORT_ACTION_TARGETS.CherryStudio]: {
                onSelect: exportActions.openCherryStudio,
              },
              [EXPORT_ACTION_TARGETS.Kelivo]: {
                onSelect: exportActions.openKelivo,
              },
              ...(onOpenCCSwitchDialog
                ? {
                    [EXPORT_ACTION_TARGETS.CCSwitch]: {
                      testId: KEY_MANAGEMENT_TEST_IDS.exportToCCSwitchButton,
                      onSelect: onOpenCCSwitchDialog,
                    },
                  }
                : {}),
              [EXPORT_ACTION_TARGETS.CursorPlus]: {
                onSelect: exportActions.openCursorPlus,
              },
              [EXPORT_ACTION_TARGETS.KiloCode]: {
                onSelect: exportActions.openKiloCode,
              },
              [EXPORT_ACTION_TARGETS.CliProxy]: {
                onSelect: exportActions.openCliProxy,
              },
              [EXPORT_ACTION_TARGETS.ClaudeCodeRouter]: {
                onSelect: exportActions.openClaudeCodeRouter,
              },
            }}
          />
        </>
      ) : null}
      <TokenApiCredentialActions
        association={association}
        actionPolicy={actionPolicy}
        account={account}
        token={token}
      />
    </KeyResourceActionGroup>
  )
}
