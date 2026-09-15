import { useLayoutEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import {
  KeyResourceCredentialAssociationControl,
  type KeyResourceCredentialAssociation,
} from "~/features/KeyManagement/components/KeyResourceCard"
import { KEY_CREDENTIAL_ASSOCIATION_STATES } from "~/features/KeyManagement/credentialAssociations"
import type { KeyResourceActionPolicy } from "~/features/KeyManagement/presentation/keyResourceCard"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import toast from "~/lib/notify"
import { getAccountRuntimeKeyLocator } from "~/services/accounts/accountRuntimeKeys"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  ACCOUNT_RUNTIME_KEY_SECRET_SOURCES,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { captureProfileFromAccountToken } from "~/services/apiCredentialProfiles/accountTokenImport"
import { API_CREDENTIAL_PROFILE_CAPTURE_STATUSES } from "~/services/apiCredentialProfiles/apiCredentialProfileLinkContracts"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { openApiCredentialProfilesPage } from "~/utils/navigation"

const logger = createLogger("RuntimeKeyApiCredentialActions")

type RuntimeKeyApiCredentialActionsProps = {
  actionPolicy: KeyResourceActionPolicy
  association?: KeyResourceCredentialAssociation
  account: DisplaySiteData
  runtimeKey: AccountRuntimeKey
}

/** Renders API credential save and association actions for a runtimeKey. */
export function RuntimeKeyApiCredentialActions({
  actionPolicy,
  association,
  account,
  runtimeKey,
}: RuntimeKeyApiCredentialActionsProps) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const canSave =
    actionPolicy.exportSecret &&
    (!association ||
      association.status === KEY_CREDENTIAL_ASSOCIATION_STATES.Unlinked)
  const sourceRef = useRef<AbortController | null>(null)
  const pendingRef = useRef(false)
  useLayoutEffect(() => {
    const source = new AbortController()
    sourceRef.current = source
    pendingRef.current = false
    return () => source.abort()
  }, [
    account.id,
    account.siteType,
    account.baseUrl,
    account.authType,
    account.token,
    account.userId,
    account.cookieAuthSessionCookie,
    runtimeKey.id,
    runtimeKey.secret,
    canSave,
  ])

  if (!canSave && !association) {
    return null
  }

  const handleSaveToApiCredentialProfiles = async () => {
    const source = sourceRef.current
    if (!canSave || pendingRef.current || !source || source.signal.aborted)
      return
    pendingRef.current = true
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    let resolvedKey = runtimeKey

    try {
      resolvedKey = await resolveDisplayAccountRuntimeKeySecret(
        account,
        runtimeKey,
        {
          abortSignal: source.signal,
          secretSource:
            ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.ProviderThenAssociatedProfile,
        },
      )
      if (source.signal.aborted) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
      const result = await captureProfileFromAccountToken({
        accountName: account.name,
        fallbackAccountName: runtimeKey.accountName,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
        tagIds: account.tagIds ?? [],
        token: { name: runtimeKey.label, key: resolvedKey.secret },
        locator: getAccountRuntimeKeyLocator(runtimeKey),
      })
      const hasAssociationConflict =
        result.status ===
        API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.AssociationConflict
      toast.success(
        (toastInstance) => (
          <div className="gap-y-density-2 flex min-w-0 items-center gap-x-2">
            <span className="min-w-0 truncate">
              {hasAssociationConflict
                ? t(
                    "keyManagement:messages.savedToApiProfilesNeedsConfirmation",
                  )
                : t("keyManagement:messages.savedToApiProfiles", {
                    name: result.profile.name,
                  })}
            </span>
            <button
              type="button"
              data-testid={
                TOKEN_PROVISIONING_TEST_IDS.openApiProfilesToastButton
              }
              className="bg-primary text-primary-foreground hover:bg-primary/90 py-density-1 min-h-(--density-control-xs) shrink-0 rounded-md px-2 text-xs font-medium"
              onClick={() => {
                openApiCredentialProfilesPage()
                toast.dismiss(toastInstance.id)
              }}
            >
              {t("keyManagement:actions.openApiProfiles")}
            </button>
          </div>
        ),
        { duration: 8000 },
      )
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      if (source.signal.aborted) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        return
      }
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      logger.error("Failed to save runtimeKey to API profiles", {
        message: toSanitizedErrorSummary(
          error,
          [
            runtimeKey.secret,
            resolvedKey.secret,
            account.token,
            account.cookieAuthSessionCookie,
          ].filter(Boolean) as string[],
        ),
      })
      toast.error(t("keyManagement:messages.saveToApiProfilesFailed"))
    } finally {
      if (sourceRef.current === source) pendingRef.current = false
    }
  }

  const menuAssociation: KeyResourceCredentialAssociation = association
    ? {
        ...association,
        onSaveAndAssociate: canSave
          ? handleSaveToApiCredentialProfiles
          : undefined,
        saveAndAssociateLabel: canSave
          ? t("keyManagement:actions.saveToApiProfiles")
          : undefined,
      }
    : {
        status: KEY_CREDENTIAL_ASSOCIATION_STATES.Unlinked,
        label: t("apiCredentialProfiles:association.notLinked"),
        actionLabel: t("apiCredentialProfiles:association.linkExisting"),
        onSaveAndAssociate: handleSaveToApiCredentialProfiles,
        saveAndAssociateLabel: t("keyManagement:actions.saveToApiProfiles"),
      }

  return (
    <KeyResourceCredentialAssociationControl association={menuAssociation} />
  )
}
