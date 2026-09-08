import { useTranslation } from "react-i18next"

import type { ChannelDialogAdvisoryWarning } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import { useChannelDialogContext } from "~/components/dialogs/ChannelDialog/context/ChannelDialogContext"
import {
  buildChannelDialogAdvisoryWarning,
  CHANNEL_DIALOG_ADVISORY_WARNING_KINDS,
} from "~/components/dialogs/ChannelDialog/utils/advisoryWarning"
import toast from "~/lib/notify"
import { selectSingleNewApiTokenByIdDiff } from "~/services/accounts/accountPostSaveWorkflow"
import {
  buildDisplayAccountTokenRuntimeKey,
  collectAccountRuntimeKeySecrets,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import { ensureAccountApiToken } from "~/services/accounts/ensureAccountApiToken"
import {
  resolveDefaultTokenQuickCreateResolution,
  TOKEN_QUICK_CREATE_RESOLUTION_KINDS,
} from "~/services/accounts/tokenQuickCreateResolution"
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  resolveDisplayAccountRuntimeKeySecret,
} from "~/services/accounts/utils/apiServiceRequest"
import { type ManagedSiteCapabilities } from "~/services/apiAdapters/contracts/managedSiteCapabilities"
import { openNativeManagedChannelImportEditor } from "~/services/apiAdapters/managedResources/channelImport"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import { toManagedSiteChannelAssessmentSignals } from "~/services/managedSites/channelAssessmentSignals"
import {
  buildManagedSiteChannelDraftSource,
  buildManagedSiteCredentialDraftSource,
} from "~/services/managedSites/channelDraftSource"
import {
  getManagedSiteChannelExactMatch,
  MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS,
} from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import {
  getCurrentManagedSiteType,
  type ManagedSiteRuntimeConfigValue,
} from "~/services/managedSites/runtimeConfig"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import {
  getManagedSiteConfigMissingMessage,
  getManagedSiteMessagesKeyFromSiteType,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"
import { collectManagedConfigSecrets } from "~/services/managedSites/utils/resourceSecrets"
import { createAutomaticProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
} from "~/services/protectionBypass/contracts"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import { type ApiToken, type DisplaySiteData, type SiteAccount } from "~/types"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to channel dialog open helpers.
 */
const logger = createLogger("ChannelDialogHook")

interface PrefilledChannelOpenOptions {
  managedSiteStatus?: ManagedSiteTokenChannelStatus
  shouldContinue?: () => boolean
}

interface PrefilledDialogDuplicateState {
  existingChannelName: string | null
  advisoryWarning: ChannelDialogAdvisoryWarning | null
}

export interface OpenWithAccountResult {
  opened: boolean
  deferred?: boolean
}

/**
 * Narrows a display account union to a persisted site account record.
 */
function isSiteAccount(
  account: DisplaySiteData | SiteAccount,
): account is SiteAccount {
  return "site_name" in account && "account_info" in account
}

/**
 * Extracts numeric token IDs from potentially sparse token lists.
 */
function getApiTokenIds(tokens: ApiToken[]): number[] {
  return tokens
    .map((token) => token?.id)
    .filter((tokenId): tokenId is number => typeof tokenId === "number")
}

/**
 * Exposes helpers for opening channel dialogs from account data,
 * raw credentials, or custom initial values.
 */
export function useChannelDialog() {
  const { t } = useTranslation(["messages", "channelDialog"])
  const {
    openNativeCreateDialog,
    openDefaultTokenQuickCreateDialog,
    requestDuplicateChannelWarning,
  } = useChannelDialogContext()

  const openPreparedChannelCreateDialog = async (params: {
    managedSite: ManagedSiteCapabilities
    formData: Awaited<
      ReturnType<ManagedSiteCapabilities["channelDrafts"]["prepareFormData"]>
    >
    advisoryWarning: ChannelDialogAdvisoryWarning | null
    onSuccess?: (result: any) => void
    shouldContinue?: () => boolean
  }): Promise<boolean> => {
    const nativeCreate = await openNativeManagedChannelImportEditor(
      params.managedSite.siteType,
      params.formData,
    )
    if (params.shouldContinue && !params.shouldContinue()) return false

    openNativeCreateDialog({
      nativeCreate: {
        ...nativeCreate,
        showModelPrefillWarning:
          params.formData.modelPrefillFetchFailed === true,
        advisoryWarning: params.advisoryWarning,
      },
      onSuccess: params.onSuccess,
    })
    return true
  }

  const openDefaultTokenQuickCreateDialogForAccount = async (
    account: DisplaySiteData,
    options?: {
      notice?: string
      onSuccess?: (createdToken?: ApiToken) => void | Promise<void>
    },
  ): Promise<boolean> => {
    const { keyManagement, request } = createDisplayAccountApiContext(account)
    const existingTokens = await requireDisplayAccountKeyManagement(
      account,
      keyManagement,
    ).fetchTokens(request)
    if (Array.isArray(existingTokens) && existingTokens.length > 0) {
      return false
    }

    const resolution = await resolveDefaultTokenQuickCreateResolution(account)
    if (resolution.kind === TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked) {
      toast.error(resolution.message)
      return false
    }

    if (resolution.kind === TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready) {
      const selectedGroup = resolution.tokenData.group?.trim()
      if (!selectedGroup) {
        toast.error(t("messages:tokenProvisioning.createRequiresGroup"))
        return false
      }

      openDefaultTokenQuickCreateDialog({
        account,
        allowedGroups: [selectedGroup],
        notice: options?.notice,
        onSuccess: options?.onSuccess,
      })
      return true
    }

    openDefaultTokenQuickCreateDialog({
      account,
      allowedGroups: resolution.allowedGroups,
      notice:
        options?.notice ??
        t("messages:tokenProvisioning.createRequiresGroupSelection"),
      onSuccess: options?.onSuccess,
    })

    return true
  }

  const buildAdvisoryWarning = (
    kind:
      | typeof CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.REVIEW_SUGGESTED
      | typeof CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.VERIFICATION_REQUIRED,
    options?: {
      assessment?: ChannelDialogAdvisoryWarning["assessment"]
    },
  ): ChannelDialogAdvisoryWarning =>
    buildChannelDialogAdvisoryWarning(t, kind, options)

  const resolvePrefilledDialogDuplicateState = async (params: {
    managedSite: ManagedSiteCapabilities
    managedConfig: ManagedSiteRuntimeConfigValue
    accountBaseUrl: string
    models: string[]
    key?: string
    managedSiteStatus?: ManagedSiteTokenChannelStatus
  }): Promise<PrefilledDialogDuplicateState> => {
    if (
      params.managedSiteStatus?.status ===
      MANAGED_SITE_TOKEN_CHANNEL_STATUSES.ADDED
    ) {
      return {
        existingChannelName: params.managedSiteStatus.matchedChannel.name,
        advisoryWarning: null,
      }
    }

    if (!supportsManagedSiteBaseUrlChannelLookup(params.managedSite.siteType)) {
      return {
        existingChannelName: null,
        advisoryWarning: null,
      }
    }

    const resolution = await resolveManagedSiteChannelMatch({
      managedSite: params.managedSite,
      managedConfig: params.managedConfig,
      accountBaseUrl: params.accountBaseUrl,
      models: params.models,
      key: params.key,
      protectionBypassExecution: createAutomaticProtectionBypassExecution(
        PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
        PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.UiLifecycle,
        getCurrentTempWindowRequestSource(),
      ),
    })
    const exactMatch = getManagedSiteChannelExactMatch(
      resolution,
      params.managedSite.matching,
    )

    if (exactMatch) {
      return {
        existingChannelName: exactMatch.name,
        advisoryWarning: null,
      }
    }

    if (
      resolution.unresolvedReason ===
        MANAGED_SITE_CHANNEL_MATCH_UNRESOLVED_REASONS.VERIFICATION_REQUIRED &&
      resolution.searchCompleted &&
      resolution.url.matched &&
      !resolution.key.comparable
    ) {
      return {
        existingChannelName: null,
        advisoryWarning: buildAdvisoryWarning(
          CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.VERIFICATION_REQUIRED,
          {
            assessment: toManagedSiteChannelAssessmentSignals(resolution),
          },
        ),
      }
    }

    if (
      resolution.searchCompleted &&
      (resolution.url.matched ||
        resolution.key.matched ||
        resolution.models.matched)
    ) {
      return {
        existingChannelName: null,
        advisoryWarning: buildAdvisoryWarning(
          CHANNEL_DIALOG_ADVISORY_WARNING_KINDS.REVIEW_SUGGESTED,
          {
            assessment: toManagedSiteChannelAssessmentSignals(resolution),
          },
        ),
      }
    }

    return {
      existingChannelName: null,
      advisoryWarning: null,
    }
  }

  /**
   * Prepare and open channel dialog with account data
   */
  const openWithAccount = async (
    account: DisplaySiteData | SiteAccount,
    runtimeKey: AccountRuntimeKey | null,
    onSuccess?: (result: any) => void,
    options?: PrefilledChannelOpenOptions,
  ): Promise<OpenWithAccountResult> => {
    const toastId = toast.loading(
      t("messages:accountOperations.checkingApiKeys"),
    )
    let displaySiteData: DisplaySiteData | null = null
    let secretsToRedact: string[] = []
    const shouldContinue = () => options?.shouldContinue?.() ?? true
    const cancelOpen = (): OpenWithAccountResult => {
      toast.dismiss(toastId)
      return { opened: false }
    }

    try {
      // Get full account if needed
      let siteAccount: SiteAccount

      if (isSiteAccount(account)) {
        siteAccount = account
        displaySiteData =
          (await accountReadModels.getDisplayDataById(account.id)) ??
          accountPresentation.convertToDisplayData(account)
      } else {
        displaySiteData = account
        const fetchedAccount = await accountQueries.getAccountById(account.id)
        if (!fetchedAccount) {
          throw new Error(t("messages:toast.error.findAccountDetailsFailed"))
        }
        siteAccount = fetchedAccount
      }

      const managedSite = getManagedSiteCapabilities(
        await getCurrentManagedSiteType(),
      )
      const managedConfig = await managedSite.config.get()
      if (!managedConfig) {
        toast.error(
          getManagedSiteConfigMissingMessage(
            t,
            getManagedSiteMessagesKeyFromSiteType(managedSite.siteType),
          ),
          {
            id: toastId,
          },
        )
        return { opened: false }
      }

      let selectedRuntimeKey = runtimeKey
      if (!selectedRuntimeKey) {
        const accountApiContext =
          createDisplayAccountApiContext(displaySiteData)
        const accountKeyManagement = requireDisplayAccountKeyManagement(
          displaySiteData,
          accountApiContext.keyManagement,
        )
        const accountApiRequest = accountApiContext.request
        const existingTokens =
          await accountKeyManagement.fetchTokens(accountApiRequest)
        const existingTokenList = Array.isArray(existingTokens)
          ? existingTokens
          : []
        const existingTokenIds = getApiTokenIds(existingTokenList)
        let apiToken = existingTokenList.at(-1) ?? null

        if (!apiToken) {
          const resolution =
            await resolveDefaultTokenQuickCreateResolution(displaySiteData)
          if (!shouldContinue()) {
            return cancelOpen()
          }

          if (resolution.kind === TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked) {
            toast.error(resolution.message, { id: toastId })
            return { opened: false }
          }

          if (
            resolution.kind ===
            TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired
          ) {
            if (!shouldContinue()) {
              return cancelOpen()
            }
            toast.dismiss(toastId)
            openDefaultTokenQuickCreateDialog({
              account: displaySiteData,
              allowedGroups: resolution.allowedGroups,
              notice: t(
                "messages:tokenProvisioning.createRequiresGroupSelection",
              ),
              onSuccess: async (createdToken?: ApiToken) => {
                if (!shouldContinue()) {
                  return
                }

                if (createdToken) {
                  await openWithAccount(
                    displaySiteData!,
                    buildDisplayAccountTokenRuntimeKey(
                      displaySiteData!,
                      createdToken,
                    ),
                    onSuccess,
                    options,
                  )
                  return
                }

                if (!shouldContinue()) {
                  return
                }

                const refetchedTokens =
                  await accountKeyManagement.fetchTokens(accountApiRequest)
                if (!shouldContinue()) {
                  return
                }
                const recoveredToken = Array.isArray(refetchedTokens)
                  ? selectSingleNewApiTokenByIdDiff({
                      existingTokenIds,
                      tokens: refetchedTokens,
                    })
                  : null

                if (!recoveredToken) {
                  toast.error(t("messages:accountOperations.createTokenFailed"))
                  return
                }

                await openWithAccount(
                  displaySiteData!,
                  buildDisplayAccountTokenRuntimeKey(
                    displaySiteData!,
                    recoveredToken,
                  ),
                  onSuccess,
                  options,
                )
              },
            })
            return { opened: false, deferred: true }
          }

          apiToken = await ensureAccountApiToken(siteAccount, displaySiteData, {
            toastId,
            defaultTokenData: resolution.tokenData,
          })
        }
        selectedRuntimeKey = buildDisplayAccountTokenRuntimeKey(
          displaySiteData,
          apiToken,
        )
      }
      if (!shouldContinue()) {
        return cancelOpen()
      }

      secretsToRedact = [
        ...collectAccountRuntimeKeySecrets([selectedRuntimeKey]),
        ...collectManagedConfigSecrets(managedConfig),
      ]
      const resolvedRuntimeKey = isAccountTokenRuntimeKey(selectedRuntimeKey)
        ? await resolveDisplayAccountRuntimeKeySecret(
            displaySiteData,
            selectedRuntimeKey,
          )
        : selectedRuntimeKey
      secretsToRedact.push(
        ...collectAccountRuntimeKeySecrets([resolvedRuntimeKey]),
      )
      const formData = await managedSite.channelDrafts.prepareFormData(
        buildManagedSiteChannelDraftSource(resolvedRuntimeKey),
      )
      if (!shouldContinue()) {
        return cancelOpen()
      }

      const duplicateState = await resolvePrefilledDialogDuplicateState({
        managedSite,
        managedConfig,
        accountBaseUrl: formData.base_url,
        models: formData.models,
        key: formData.key,
        managedSiteStatus: options?.managedSiteStatus,
      })
      if (!shouldContinue()) {
        return cancelOpen()
      }

      if (duplicateState.existingChannelName) {
        toast.dismiss(toastId)
        const confirmedDuplicate = await requestDuplicateChannelWarning({
          existingChannelName: duplicateState.existingChannelName,
        })
        if (!confirmedDuplicate) {
          return { opened: false }
        }
      } else {
        toast.dismiss(toastId)
      }
      if (!shouldContinue()) {
        return cancelOpen()
      }

      const opened = await openPreparedChannelCreateDialog({
        managedSite,
        formData,
        advisoryWarning: duplicateState.advisoryWarning,
        onSuccess,
        shouldContinue,
      })
      if (!opened) return cancelOpen()
      return { opened: true }
    } catch (error) {
      const diagnostic = toSanitizedErrorSummary(error, secretsToRedact)
      toast.error(
        t("messages:errors.operation.failed", {
          error: diagnostic || getErrorMessage(error),
        }),
        { id: toastId },
      )
      logger.error("Failed to prepare channel data", {
        accountId: displaySiteData?.id,
        diagnostic,
      })
      return { opened: false }
    }
  }

  /**
   * Prepare and open channel dialog from raw API credentials (baseUrl + apiKey),
   * without requiring a SiteAccount entry in storage.
   */
  const openWithCredentials = async (
    credentials: { name: string; baseUrl: string; apiKey: string },
    onSuccess?: (result: any) => void,
    options?: Pick<PrefilledChannelOpenOptions, "managedSiteStatus">,
  ): Promise<OpenWithAccountResult> => {
    const toastId = toast.loading(
      t("messages:accountOperations.checkingApiKeys"),
    )
    let secretsToRedact: string[] = []

    try {
      const managedSite = getManagedSiteCapabilities(
        await getCurrentManagedSiteType(),
      )
      const managedConfig = await managedSite.config.get()
      if (!managedConfig) {
        toast.error(
          getManagedSiteConfigMissingMessage(
            t,
            getManagedSiteMessagesKeyFromSiteType(managedSite.siteType),
          ),
          {
            id: toastId,
          },
        )
        return { opened: false }
      }

      secretsToRedact = [
        credentials.apiKey,
        ...collectManagedConfigSecrets(managedConfig),
      ].filter(Boolean) as string[]
      const formData = await managedSite.channelDrafts.prepareFormData(
        buildManagedSiteCredentialDraftSource(credentials),
      )

      const duplicateState = await resolvePrefilledDialogDuplicateState({
        managedSite,
        managedConfig,
        accountBaseUrl: formData.base_url,
        models: formData.models,
        key: formData.key,
        managedSiteStatus: options?.managedSiteStatus,
      })

      if (duplicateState.existingChannelName) {
        toast.dismiss(toastId)
        const confirmedDuplicate = await requestDuplicateChannelWarning({
          existingChannelName: duplicateState.existingChannelName,
        })
        if (!confirmedDuplicate) {
          return { opened: false }
        }
      } else {
        toast.dismiss(toastId)
      }

      const opened = await openPreparedChannelCreateDialog({
        managedSite,
        formData,
        advisoryWarning: duplicateState.advisoryWarning,
        onSuccess,
      })
      return { opened }
    } catch (error) {
      const diagnostic = toSanitizedErrorSummary(error, secretsToRedact)
      toast.error(
        t("messages:errors.operation.failed", {
          error: diagnostic || getErrorMessage(error),
        }),
        { id: toastId },
      )
      logger.error("Failed to prepare channel data", { diagnostic })
      return { opened: false }
    }
  }

  return {
    openWithAccount,
    openDefaultTokenQuickCreateDialogForAccount,
    openWithCredentials,
  }
}
