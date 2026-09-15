import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
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
import { getAccountRuntimeKeyExportId } from "~/services/accounts/accountRuntimeKeys"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { createAccountRuntimeKeyExportSource } from "~/services/accounts/utils/credentialExport"
import type { DisplaySiteData } from "~/types"

import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"
import { RuntimeKeyApiCredentialActions } from "./RuntimeKeyApiCredentialActions"
import {
  RUNTIME_KEY_KELIVO_EXPORT_ANALYTICS_CONTEXT,
  type RuntimeKeyIntegrationActionsController,
} from "./useRuntimeKeyIntegrationActions"

interface RuntimeKeyIntegrationDialogsProps {
  account: DisplaySiteData
  controller: RuntimeKeyIntegrationActionsController
  enabled: boolean
  runtimeKey: AccountRuntimeKey
}

interface RuntimeKeyIntegrationActionGroupProps {
  account: DisplaySiteData
  actionPolicy: KeyResourceActionPolicy
  association?: KeyResourceCredentialAssociation
  controller: RuntimeKeyIntegrationActionsController
  onOpenCCSwitchDialog?: () => void
  runtimeKey: AccountRuntimeKey
}

/** Reports whether a runtimeKey row needs the integrations-and-export action group. */
export function hasRuntimeKeyIntegrationActionGroup(
  actionPolicy: KeyResourceActionPolicy,
  association?: KeyResourceCredentialAssociation,
): boolean {
  return actionPolicy.exportSecret || Boolean(association)
}

/** Renders export dialogs outside the runtimeKey action toolbar. */
export function RuntimeKeyIntegrationDialogs({
  account,
  controller,
  enabled,
  runtimeKey,
}: RuntimeKeyIntegrationDialogsProps) {
  const exportSource = useMemo(
    () =>
      createAccountRuntimeKeyExportSource(account, runtimeKey, {
        preferCurrentSecret: true,
      }),
    [account, runtimeKey],
  )
  const runtimeExportSource = useMemo(
    () => createAccountRuntimeKeyExportSource(account, runtimeKey),
    [account, runtimeKey],
  )
  if (!enabled) return null

  const { dialogs } = controller

  return (
    <>
      <KiloCodeExportDialog
        isOpen={dialogs.kiloCode.isOpen}
        onClose={dialogs.kiloCode.close}
        initialSelectedSiteIds={[account.id]}
        initialSelectedTokenIdsBySite={{
          [account.id]: [getAccountRuntimeKeyExportId(runtimeKey)],
        }}
      />
      {dialogs.cursorPlus.isOpen ? (
        <CursorPlusExportDialog
          isOpen={true}
          onClose={dialogs.cursorPlus.close}
          source={runtimeExportSource}
        />
      ) : null}
      {dialogs.kelivo.input ? (
        <KelivoExportDialog
          isOpen={true}
          onClose={dialogs.kelivo.close}
          initialValue={dialogs.kelivo.input}
          analyticsContext={RUNTIME_KEY_KELIVO_EXPORT_ANALYTICS_CONTEXT}
        />
      ) : null}
      <ClaudeCodeRouterImportDialog
        isOpen={dialogs.claudeCodeRouter.isOpen}
        onClose={dialogs.claudeCodeRouter.close}
        source={exportSource}
        routerBaseUrl={dialogs.claudeCodeRouter.baseUrl}
        routerApiKey={dialogs.claudeCodeRouter.apiKey}
      />
    </>
  )
}

/** Renders managed-site import, third-party export, and credential actions. */
export function RuntimeKeyIntegrationActionGroup({
  account,
  actionPolicy,
  association,
  controller,
  onOpenCCSwitchDialog,
  runtimeKey,
}: RuntimeKeyIntegrationActionGroupProps) {
  const { t } = useTranslation("keyManagement")
  const hasIntegrations = actionPolicy.exportSecret

  if (!hasRuntimeKeyIntegrationActionGroup(actionPolicy, association))
    return null

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

              [EXPORT_ACTION_TARGETS.ClaudeCodeRouter]: {
                onSelect: exportActions.openClaudeCodeRouter,
              },
            }}
          />
        </>
      ) : null}
      <RuntimeKeyApiCredentialActions
        association={association}
        actionPolicy={actionPolicy}
        account={account}
        runtimeKey={runtimeKey}
      />
    </KeyResourceActionGroup>
  )
}
