import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import {
  KeyResourceCredentialAssociationControl,
  type KeyResourceCredentialAssociation,
} from "~/features/KeyManagement/components/KeyResourceCard"
import { KEY_CREDENTIAL_ASSOCIATION_STATES } from "~/features/KeyManagement/credentialAssociations"
import type { KeyResourceActionPolicy } from "~/features/KeyManagement/presentation/keyResourceCard"
import { TOKEN_PROVISIONING_TEST_IDS } from "~/features/TokenProvisioning/testIds"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import {
  ACCOUNT_RUNTIME_KEY_SECRET_SOURCES,
  resolveDisplayAccountTokenForSecret,
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
import type { AccountToken, DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
import { openApiCredentialProfilesPage } from "~/utils/navigation"

const logger = createLogger("TokenApiCredentialActions")

type TokenApiCredentialActionsProps = {
  actionPolicy: KeyResourceActionPolicy
  association?: KeyResourceCredentialAssociation
  account: DisplaySiteData
  token: AccountToken
}

/** Renders API credential save and association actions for a token. */
export function TokenApiCredentialActions({
  actionPolicy,
  association,
  account,
  token,
}: TokenApiCredentialActionsProps) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const canSave =
    actionPolicy.exportSecret &&
    (!association ||
      association.status === KEY_CREDENTIAL_ASSOCIATION_STATES.Unlinked)

  if (!canSave && !association) {
    return null
  }

  const handleSaveToApiCredentialProfiles = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    let resolvedToken = token

    try {
      resolvedToken = await resolveDisplayAccountTokenForSecret(
        account,
        token,
        {
          secretSource:
            ACCOUNT_RUNTIME_KEY_SECRET_SOURCES.ProviderThenAssociatedProfile,
        },
      )
      const result = await captureProfileFromAccountToken({
        accountName: account.name,
        fallbackAccountName: token.accountName,
        baseUrl: account.baseUrl,
        siteType: account.siteType,
        tagIds: account.tagIds ?? [],
        token: {
          ...token,
          key: resolvedToken.key,
        },
        locator: {
          source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
          accountId: account.id,
          siteType: account.siteType,
          tokenId: token.id,
        },
      })
      const hasAssociationConflict =
        result.status ===
        API_CREDENTIAL_PROFILE_CAPTURE_STATUSES.AssociationConflict
      toast.success(
        (toastInstance) => (
          <div className="flex min-w-0 items-center gap-2">
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
              className="shrink-0 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
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
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      logger.error("Failed to save token to API profiles", {
        message: toSanitizedErrorSummary(
          error,
          [
            token.key,
            resolvedToken.key,
            account.token,
            account.cookieAuthSessionCookie,
          ].filter(Boolean) as string[],
        ),
      })
      toast.error(t("keyManagement:messages.saveToApiProfilesFailed"))
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
