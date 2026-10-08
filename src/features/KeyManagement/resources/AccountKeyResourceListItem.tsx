import { Pencil, Trash2 } from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import type { DeeplinkExportTarget } from "~/features/CredentialExport/DeeplinkExportDialog"
import { LinkedCredentialProfileActions } from "~/features/KeyManagement/associations/LinkedCredentialProfileActions"
import { RuntimeKeyHeader } from "~/features/KeyManagement/components/RuntimeKeyActions/RuntimeKeyHeader"
import { KeyResourceCard } from "~/features/KeyManagement/inventory/KeyResourceCard"
import type { KeyResourceCredentialAssociation } from "~/features/KeyManagement/inventory/KeyResourceCard"
import type { AccountKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/accountKeyResourceCardAdapter"
import type { KeyResourceDetailState } from "~/features/KeyManagement/presentation/keyResourceCard"
import { useAccountKeySecretDisclosure } from "~/features/KeyManagement/resources/useAccountKeySecretDisclosure"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import type {
  NativeKeyManagementRow,
  NativeKeyManagementRowAction,
} from "~/features/KeyManagement/types"
import { buildAccountKeyResourceRuntimeKeyFromFacts } from "~/services/accounts/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keyProductCapabilities"
import type {
  AccountKeyResourceFacts,
  ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

/** Composes one native account-key resource with the shared key-resource card. */
export function AccountKeyResourceListItem({
  row,
  account,
  cardAdapter,
  onEdit,
  onDelete,
  detail,
  isDetailLoading = false,
  detailFailure,
  expanded = false,
  onExpandedChange,
  detailsFromRow = false,
  selectionDisabledReason,
  association,
  associatedProfile,
  targetId,
  isNavigationTarget,
  isSelected,
  onSelectionChange,
  onOpenDeeplinkExport,
  managedSiteStatus,
  isManagedSiteStatusChecking,
  onManagedSiteImportSuccess,
  onManagedSiteVerificationRetry,
  guidedManagedSiteImportRequest,
}: {
  row: NativeKeyManagementRow
  account: DisplaySiteData
  cardAdapter: AccountKeyResourceCardAdapter
  onEdit: NativeKeyManagementRowAction
  onDelete: NativeKeyManagementRowAction
  detail?: AccountKeyResourceFacts | null
  isDetailLoading?: boolean
  detailFailure?: ResourceFailure | null
  expanded?: boolean
  onExpandedChange: (expanded: boolean) => void
  detailsFromRow?: boolean
  selectionDisabledReason?: string
  association?: KeyResourceCredentialAssociation
  associatedProfile?: ApiCredentialProfile
  targetId?: string
  isNavigationTarget?: boolean
  isSelected?: boolean
  onSelectionChange?: (selected: boolean) => void
  onOpenDeeplinkExport?: (target: DeeplinkExportTarget) => void
  managedSiteStatus?: ManagedSiteTokenChannelStatus
  isManagedSiteStatusChecking?: boolean
  onManagedSiteImportSuccess?: () => void | Promise<void>
  onManagedSiteVerificationRetry?: (
    status: ManagedSiteTokenChannelStatus,
  ) => void | Promise<void>
  guidedManagedSiteImportRequest?: string
}) {
  const { t } = useTranslation(["keyManagement", "common"])
  const runtimeKey = useMemo(
    () => buildAccountKeyResourceRuntimeKeyFromFacts(account, row.facts),
    [account, row.facts],
  )
  const recoverable = supportsRecoverableAccountRuntimeKeySecrets(
    account.siteType,
  )
  const {
    secret,
    secretControls,
    associatedProfileWithSecret,
    hasAssociatedSecret,
    copy: copyDisclosedKey,
  } = useAccountKeySecretDisclosure({
    account,
    runtimeKey,
    recoverable,
    associatedProfile,
    maskedLabel: row.facts.maskedLabel,
    displayName: row.facts.displayName,
  })
  const presentation = cardAdapter.buildPresentation(row, t, {
    hasAssociatedSecret,
  })
  const visibleDetail = detail ?? (detailsFromRow ? row.facts : null)
  const detailState: KeyResourceDetailState = isDetailLoading
    ? { status: "loading" }
    : detailFailure
      ? {
          status: "error",
          message: cardAdapter.getDetailsLoadFailedMessage(t),
          onRetry: () => onExpandedChange(true),
        }
      : {
          status: "ready",
          facts: visibleDetail
            ? cardAdapter.buildDetailFacts(visibleDetail, t)
            : [],
        }
  const managementActions =
    presentation.actions.edit || presentation.actions.delete ? (
      <>
        {presentation.actions.edit ? (
          <IconButton
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t("native.actions.edit")}
            onClick={() => onEdit(row.facts.ref)}
          >
            <Pencil
              aria-hidden="true"
              className="text-theme-500 dark:text-theme-400 h-4 w-4"
            />
          </IconButton>
        ) : null}
        {presentation.actions.delete ? (
          <IconButton
            type="button"
            size="sm"
            variant="destructiveGhost"
            aria-label={t("native.actions.delete")}
            onClick={() => onDelete(row.facts.ref)}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </IconButton>
        ) : null}
      </>
    ) : undefined
  const actions = associatedProfileWithSecret ? (
    <LinkedCredentialProfileActions
      profile={associatedProfileWithSecret}
      managementActions={managementActions}
    />
  ) : (
    managementActions
  )

  return (
    <KeyResourceCard
      presentation={presentation}
      secret={secret}
      secretControls={secretControls}
      actions={recoverable ? undefined : actions}
      renderHeader={
        recoverable
          ? (headerProps) => (
              <RuntimeKeyHeader
                headerProps={headerProps}
                account={account}
                runtimeKey={runtimeKey}
                actionPolicy={presentation.actions}
                association={association}
                copyKey={copyDisclosedKey}
                handleEditKey={() => onEdit(row.facts.ref)}
                handleDeleteKey={() => onDelete(row.facts.ref)}
                onOpenDeeplinkExport={onOpenDeeplinkExport}
                managedSiteStatus={managedSiteStatus}
                isManagedSiteStatusChecking={isManagedSiteStatusChecking}
                onManagedSiteImportSuccess={onManagedSiteImportSuccess}
                onManagedSiteVerificationRetry={
                  onManagedSiteVerificationRetry
                    ? (_key, status) => onManagedSiteVerificationRetry(status)
                    : undefined
                }
                guidedManagedSiteImportRequest={guidedManagedSiteImportRequest}
              />
            )
          : undefined
      }
      details={detailState}
      isDetailsExpanded={expanded}
      onDetailsExpandedChange={onExpandedChange}
      selectionDisabledReason={selectionDisabledReason}
      isSelected={isSelected}
      onSelectionChange={onSelectionChange}
      selectionLabel={t("batchManagedSiteExport.selection.rowLabel", {
        name: presentation.title,
      })}
      testId={KEY_MANAGEMENT_TEST_IDS.nativeKeyRow}
      resourceId={row.facts.ref.resourceId}
      association={association}
      targetId={targetId}
      isNavigationTarget={isNavigationTarget}
    />
  )
}
