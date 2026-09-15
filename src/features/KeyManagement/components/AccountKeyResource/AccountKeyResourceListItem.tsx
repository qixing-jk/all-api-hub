import { Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import { KeyResourceCard } from "~/features/KeyManagement/components/KeyResourceCard"
import type { KeyResourceCredentialAssociation } from "~/features/KeyManagement/components/KeyResourceCard"
import { LinkedCredentialProfileActions } from "~/features/KeyManagement/components/LinkedCredentialProfileActions"
import type { AccountKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/accountKeyResourceCardAdapter"
import type { KeyResourceDetailState } from "~/features/KeyManagement/presentation/keyResourceCard"
import toast from "~/lib/notify"
import { buildAccountKeyResourceRuntimeKeyFromFacts } from "~/services/accounts/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keyProductCapabilities"
import type {
  AccountKeyResourceFacts,
  ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { maskSecretForDisplay } from "~/utils/core/formatters"

import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"
import type {
  NativeKeyManagementRow,
  NativeKeyManagementRowAction,
} from "../../types"
import { RuntimeKeyHeader } from "../RuntimeKeyActions/RuntimeKeyHeader"
import { useRuntimeKeyDisclosure } from "../RuntimeKeyActions/useRuntimeKeyDisclosure"

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
  onOpenCCSwitchDialog,
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
  onOpenCCSwitchDialog?: () => void
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
  const disclosure = useRuntimeKeyDisclosure(account, runtimeKey)
  const [visibleSecretProfileId, setVisibleSecretProfileId] = useState<
    string | null
  >(null)
  const associatedProfileWithSecret = associatedProfile?.apiKey.trim()
    ? associatedProfile
    : undefined
  const isSecretVisible =
    associatedProfileWithSecret !== undefined &&
    visibleSecretProfileId === associatedProfileWithSecret.id
  const hasAssociatedSecret = Boolean(associatedProfileWithSecret)
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
  const secret = recoverable
    ? disclosure.secret ?? presentation.maskedLabel
    : associatedProfileWithSecret
      ? isSecretVisible
        ? associatedProfileWithSecret.apiKey
        : maskSecretForDisplay(associatedProfileWithSecret.apiKey)
      : presentation.maskedLabel
  const copyAssociatedSecret = async () => {
    if (!associatedProfileWithSecret) return
    try {
      await navigator.clipboard.writeText(associatedProfileWithSecret.apiKey)
      toast.success(
        t("keyManagement:messages.keyCopied", {
          name: presentation.title,
        }),
      )
    } catch {
      toast.error(t("keyManagement:messages.copyFailed"))
    }
  }
  const secretControls = recoverable ? (
    <IconButton
      type="button"
      size="sm"
      variant="ghost"
      loading={disclosure.resolving}
      aria-label={
        disclosure.visible ? t("actions.hideKey") : t("actions.showKey")
      }
      tooltip={disclosure.visible ? t("actions.hideKey") : t("actions.showKey")}
      onClick={() => void disclosure.toggle()}
    >
      {disclosure.visible ? (
        <EyeOff aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Eye aria-hidden="true" className="h-4 w-4" />
      )}
    </IconButton>
  ) : hasAssociatedSecret ? (
    <>
      {/* These local disclosure actions do not resolve provider secrets, so the
          existing provider reveal/copy analytics would misclassify them. */}
      <IconButton
        type="button"
        size="sm"
        variant="ghost"
        aria-label={
          isSecretVisible
            ? t("keyManagement:actions.hideKey")
            : t("keyManagement:actions.showKey")
        }
        tooltip={
          isSecretVisible
            ? t("keyManagement:actions.hideKey")
            : t("keyManagement:actions.showKey")
        }
        onClick={() =>
          setVisibleSecretProfileId(
            isSecretVisible ? null : associatedProfileWithSecret?.id ?? null,
          )
        }
      >
        {isSecretVisible ? (
          <EyeOff aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Eye aria-hidden="true" className="h-4 w-4" />
        )}
      </IconButton>
      <IconButton
        type="button"
        size="sm"
        variant="ghost"
        aria-label={t("common:actions.copyKey")}
        tooltip={t("common:actions.copyKey")}
        onClick={() => void copyAssociatedSecret()}
      >
        <Copy aria-hidden="true" className="h-4 w-4" />
      </IconButton>
    </>
  ) : undefined

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
                copyKey={disclosure.copy}
                handleEditKey={() => onEdit(row.facts.ref)}
                handleDeleteKey={() => onDelete(row.facts.ref)}
                onOpenCCSwitchDialog={onOpenCCSwitchDialog}
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
      association={association}
      targetId={targetId}
      isNavigationTarget={isNavigationTarget}
    />
  )
}
