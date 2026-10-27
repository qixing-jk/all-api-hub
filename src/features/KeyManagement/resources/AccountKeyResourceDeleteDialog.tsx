import type { TFunction } from "i18next"
import { RefreshCw } from "lucide-react"
import { useCallback, useId, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Checkbox, ConfirmDialog, Label } from "~/components/ui"
import type { useKeyCredentialAssociations } from "~/features/KeyManagement/associations/useKeyCredentialAssociations"
import { LinkedChannelCleanupOption } from "~/features/KeyManagement/managedSite/LinkedChannelCleanup"
import { getKeyResourcePresentationPolicy } from "~/features/KeyManagement/presentation/keyResourcePresentationPolicy"
import type { useAccountKeyResourceController } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceController"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import toast from "~/lib/notify"
import {
  ACCOUNT_CREDENTIAL_IDENTITY_STATUSES,
  resolveAccountCredentialIdentity,
} from "~/services/accounts/keys/accountCredentialIdentity"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/keys/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keys/keyProductCapabilities"
import { hasAccountKeyManagementPermission } from "~/services/apiAdapters/accountKeyResources/displayFacts"
import { ACCOUNT_KEY_RESOURCE_FAILURE_CODES } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { DisplaySiteData } from "~/types"

const nativeDeleteFailureMessage = (
  code: string | undefined,
  t: TFunction,
  isRevoke: boolean,
) => {
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
      return isRevoke
        ? t("keyManagement:native.revoke.feedback.error")
        : t("keyManagement:native.delete.feedback.error")
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
  ...props
}: DeleteDialogInput) {
  const ref = nativeKeys.deleteState.ref
  if (!nativeKeys.deleteState.isOpen || !ref) return null
  return (
    <AccountKeyResourceDeleteSession
      key={JSON.stringify([
        ref.accountId,
        ref.siteType,
        ref.scopeKey,
        ref.resourceId,
      ])}
      nativeKeys={nativeKeys}
      {...props}
    />
  )
}

/** Keeps cleanup selection local to one open deletion target. */
function AccountKeyResourceDeleteSession({
  nativeKeys,
  accounts: displayData,
  getProfileForLocator,
}: DeleteDialogInput) {
  const { t } = useTranslation(["keyManagement", "common"])
  const isRevoke = nativeKeys.deleteState.operation === "revoke"
  const [nativeCleanupLinkedChannels, setNativeCleanupLinkedChannels] =
    useState(false)
  const [
    accountCredentialWarningAcknowledged,
    setAccountCredentialWarningAcknowledged,
  ] = useState(false)
  const accountCredentialAcknowledgeId = useId()
  const labels = getKeyResourcePresentationPolicy(
    nativeKeys.deleteState.ref?.siteType,
  ).actions
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
    if (isRevoke || !nativeKeys.deleteState.ref || !deleteAccount) return false
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
    isRevoke,
    getProfileForLocator,
    nativeDeleteFacts?.ref,
    nativeKeys.deleteState.ref,
  ])
  const nativeDeleteIsUncertain =
    nativeKeys.deleteState.failure?.code ===
    ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
  // Deleting the account's own credential cuts the extension off from every
  // management endpoint; losing other manage keys only affects their users.
  const linkedDeleteProfile = nativeDeleteFacts
    ? getProfileForLocator({
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
        ref: nativeDeleteFacts.ref,
      })
    : undefined
  const deleteCredentialIdentity = resolveAccountCredentialIdentity({
    provider: nativeDeleteFacts?.accountCredentialIdentity,
    accountCredential: deleteAccount?.token,
    siteType: deleteAccount?.siteType,
    linkedSecret: linkedDeleteProfile?.apiKey,
  })
  const deletesAccountCredential =
    !isRevoke &&
    deleteCredentialIdentity.status ===
      ACCOUNT_CREDENTIAL_IDENTITY_STATUSES.Confirmed
  const deletesManageKey =
    !isRevoke && hasAccountKeyManagementPermission(nativeDeleteFacts)
  const confirmBlockedByCredentialWarning =
    deletesAccountCredential && !accountCredentialWarningAcknowledged
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
        isRevoke
          ? t("keyManagement:native.revoke.success")
          : keyName
            ? t("keyManagement:messages.keyDeleted", { name: keyName })
            : t("keyManagement:messages.keyDeletedSimple"),
      )
    }
  }, [
    canResolveDeleteKeySecret,
    isRevoke,
    nativeCleanupLinkedChannels,
    nativeDeleteFacts?.displayName,
    nativeDeleteIsUncertain,
    nativeKeys,
    t,
  ])
  return (
    <ConfirmDialog
      intent={nativeDeleteIsUncertain || isRevoke ? "warning" : "destructive"}
      icon={nativeDeleteIsUncertain ? RefreshCw : undefined}
      isOpen={nativeKeys.deleteState.isOpen}
      onClose={nativeKeys.cancelDelete}
      title={
        isRevoke
          ? t("keyManagement:native.revoke.title")
          : labels?.deleteTitle(t) ?? t("keyManagement:native.delete.title")
      }
      description={
        isRevoke
          ? t("keyManagement:native.revoke.description", {
              name: nativeDeleteFacts?.displayName ?? "",
            })
          : labels?.deleteDescription(
              t,
              nativeDeleteFacts?.displayName ?? "",
            ) ??
            t("keyManagement:native.delete.description", {
              name: nativeDeleteFacts?.displayName ?? "",
            })
      }
      cancelLabel={t("common:actions.cancel")}
      confirmLabel={
        nativeDeleteIsUncertain
          ? t("keyManagement:native.delete.refresh")
          : isRevoke
            ? t("keyManagement:native.actions.revoke")
            : labels?.deleteLabel(t) ?? t("keyManagement:native.delete.confirm")
      }
      workingLabel={
        nativeDeleteIsUncertain
          ? t("common:status.refreshing")
          : isRevoke
            ? t("keyManagement:native.revoke.working")
            : t("common:status.deleting")
      }
      confirmButtonTestId={KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton}
      isWorking={nativeKeys.deleteState.isExecuting}
      confirmDisabled={confirmBlockedByCredentialWarning}
      onConfirm={() => void handleConfirmDeleteNativeKey()}
      details={
        <>
          {deletesAccountCredential ? (
            <Alert
              variant="destructive"
              role="alert"
              title={t(
                "keyManagement:native.delete.accountCredentialWarningTitle",
              )}
              description={t(
                "keyManagement:native.delete.accountCredentialWarningDescription",
              )}
              data-testid={
                KEY_MANAGEMENT_TEST_IDS.nativeDeleteCredentialWarning
              }
            />
          ) : deletesManageKey ? (
            <Alert
              variant="warning"
              role="alert"
              description={t("keyManagement:native.delete.manageKeyWarning")}
              data-testid={
                KEY_MANAGEMENT_TEST_IDS.nativeDeleteCredentialWarning
              }
            />
          ) : null}
          {deletesAccountCredential ? (
            <div className="gap-y-density-2 flex items-start gap-x-2">
              <Checkbox
                id={accountCredentialAcknowledgeId}
                checked={accountCredentialWarningAcknowledged}
                disabled={nativeKeys.deleteState.isExecuting}
                onCheckedChange={(value) =>
                  setAccountCredentialWarningAcknowledged(value === true)
                }
                data-testid={
                  KEY_MANAGEMENT_TEST_IDS.nativeDeleteCredentialAcknowledge
                }
              />
              <Label htmlFor={accountCredentialAcknowledgeId}>
                {t("keyManagement:native.delete.accountCredentialAcknowledge")}
              </Label>
            </div>
          ) : null}
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
                isRevoke,
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
