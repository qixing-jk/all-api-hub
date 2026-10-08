import type { TFunction } from "i18next"
import { RefreshCw } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, ConfirmDialog } from "~/components/ui"
import type { useKeyCredentialAssociations } from "~/features/KeyManagement/associations/useKeyCredentialAssociations"
import { LinkedChannelCleanupOption } from "~/features/KeyManagement/managedSite/LinkedChannelCleanup"
import type { useAccountKeyResourceController } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceController"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import toast from "~/lib/notify"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keyProductCapabilities"
import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { DisplaySiteData } from "~/types"

const nativeDeleteFailureMessage = (code: string | undefined, t: TFunction) => {
  switch (code) {
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed:
      return t("keyManagement:native.delete.feedback.authenticationFailed")
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied:
      return t("keyManagement:native.delete.feedback.permissionDenied")
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable:
      return t("keyManagement:native.delete.feedback.unavailable")
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain:
      return t("keyManagement:native.delete.feedback.uncertain")
    default:
      return t("keyManagement:native.delete.feedback.error")
  }
}

type DeleteDialogInput = {
  nativeKeys: Pick<
    ReturnType<typeof useAccountKeyResourceController>,
    "allRows" | "deleteState" | "refresh" | "confirmDelete" | "cancelDelete"
  >
  accounts: DisplaySiteData[]
  getProfileForLocator: ReturnType<
    typeof useKeyCredentialAssociations
  >["getProfileForLocator"]
}

/** Own deletion confirmation policy while the controller retains mutation ordering. */
export function AccountKeyResourceDeleteDialog({
  nativeKeys,
  accounts: displayData,
  getProfileForLocator,
}: DeleteDialogInput) {
  const { t } = useTranslation(["keyManagement", "common"])
  const [nativeCleanupLinkedChannels, setNativeCleanupLinkedChannels] =
    useState(false)
  const nativeDeleteFacts = nativeKeys.deleteState.ref
    ? nativeKeys.allRows.find(
        (facts) =>
          facts.ref.accountId === nativeKeys.deleteState.ref?.accountId &&
          facts.ref.scopeKey === nativeKeys.deleteState.ref?.scopeKey &&
          facts.ref.resourceId === nativeKeys.deleteState.ref?.resourceId,
      )
    : null
  const deleteAccount = useMemo(
    () =>
      nativeKeys.deleteState.ref
        ? displayData.find(
            (a) => a.id === nativeKeys.deleteState.ref?.accountId,
          )
        : null,
    [displayData, nativeKeys.deleteState.ref],
  )
  const canResolveDeleteKeySecret = useMemo(() => {
    if (!nativeKeys.deleteState.ref || !deleteAccount) return false
    if (supportsRecoverableAccountRuntimeKeySecrets(deleteAccount.siteType)) {
      return true
    }
    const profile = getProfileForLocator({
      source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
      ref: nativeDeleteFacts?.ref ?? nativeKeys.deleteState.ref,
    })
    return Boolean(profile?.apiKey?.trim())
  }, [
    deleteAccount,
    getProfileForLocator,
    nativeDeleteFacts?.ref,
    nativeKeys.deleteState.ref,
  ])
  const nativeDeleteIsUncertain =
    nativeKeys.deleteState.failure?.code ===
    ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
  const handleConfirmDeleteNativeKey = useCallback(async () => {
    if (nativeDeleteIsUncertain) {
      await nativeKeys.refresh()
      return
    }
    const keyName = nativeDeleteFacts?.displayName
    const success = await nativeKeys.confirmDelete(
      canResolveDeleteKeySecret && nativeCleanupLinkedChannels,
    )
    if (success) {
      toast.success(
        keyName
          ? t("keyManagement:messages.keyDeleted", { name: keyName })
          : t("keyManagement:messages.keyDeletedSimple"),
      )
    }
  }, [
    canResolveDeleteKeySecret,
    nativeCleanupLinkedChannels,
    nativeDeleteFacts?.displayName,
    nativeDeleteIsUncertain,
    nativeKeys,
    t,
  ])
  return (
    <ConfirmDialog
      intent={nativeDeleteIsUncertain ? "warning" : "destructive"}
      icon={nativeDeleteIsUncertain ? RefreshCw : undefined}
      isOpen={nativeKeys.deleteState.isOpen}
      onClose={nativeKeys.cancelDelete}
      title={t("keyManagement:native.delete.title")}
      description={t("keyManagement:native.delete.description", {
        name: nativeDeleteFacts?.displayName ?? "",
      })}
      cancelLabel={t("common:actions.cancel")}
      confirmLabel={
        nativeDeleteIsUncertain
          ? t("keyManagement:native.delete.refresh")
          : t("keyManagement:native.delete.confirm")
      }
      workingLabel={
        nativeDeleteIsUncertain
          ? t("common:status.refreshing")
          : t("common:status.deleting")
      }
      confirmButtonTestId={KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton}
      isWorking={nativeKeys.deleteState.isExecuting}
      onConfirm={() => void handleConfirmDeleteNativeKey()}
      details={
        <>
          {canResolveDeleteKeySecret ? (
            <LinkedChannelCleanupOption
              checked={nativeCleanupLinkedChannels}
              onCheckedChange={setNativeCleanupLinkedChannels}
              disabled={nativeKeys.deleteState.isExecuting}
            />
          ) : null}
          {nativeKeys.deleteState.failure ? (
            <Alert
              variant="warning"
              role="alert"
              title={nativeDeleteFailureMessage(
                nativeKeys.deleteState.failure.code,
                t,
              )}
            >
              {nativeKeys.deleteState.failure.message}
            </Alert>
          ) : undefined}
        </>
      }
    />
  )
}
