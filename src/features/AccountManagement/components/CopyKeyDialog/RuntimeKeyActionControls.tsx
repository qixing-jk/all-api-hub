import { Check, Copy } from "lucide-react"
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react"
import { useTranslation } from "react-i18next"

import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CursorPlusExportDialog } from "~/components/CursorPlusExportDialog"
import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import {
  EXPORT_ACTION_TARGETS,
  ExportActionsMenu,
} from "~/components/ExportActionsMenu"
import { KelivoExportDialog } from "~/components/KelivoExportDialog"
import { ManagedSiteImportButton } from "~/components/ManagedSiteImportButton"
import { IconButton } from "~/components/ui"
import { useFeatureGuidanceContext } from "~/contexts/FeatureGuidanceContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import type { KeyResourceActionPolicy } from "~/features/KeyManagement/presentation/keyResourceCard"
import {
  collectAccountRuntimeKeySecrets,
  getAccountRuntimeKeyExportId,
  isServiceCredentialRuntimeKey,
  type AccountRuntimeKey,
  type ServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import { createAccountRuntimeKeyExportSource } from "~/services/accounts/utils/credentialExport"
import { buildApiCredentialProfileName } from "~/services/apiCredentialProfiles/accountTokenProfileName"
import {
  createProfileCredentialExportData,
  createProfileCredentialExportSource,
} from "~/services/apiCredentialProfiles/credentialExport"
import {
  resolveCredentialExport,
  type CredentialExportSource,
} from "~/services/integrations/credentialExport"
import type { KelivoProviderExportInput } from "~/services/integrations/kelivo"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { API_TYPES } from "~/services/verification/aiApiVerification"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/feedback/operationFeedback"

const logger = createLogger("RuntimeKeyActionControls")

interface RuntimeKeyActionControlsProps {
  runtimeKey: AccountRuntimeKey
  actionPolicy: Pick<KeyResourceActionPolicy, "copySecret" | "exportSecret">
  copiedRuntimeKeyId: string | null
  onCopyKey: (runtimeKey: AccountRuntimeKey) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (source: CredentialExportSource) => void
}

// Kilo Code export dialogs and the Cherry Studio integration are only needed
// after the user picks those export targets; keep their bundles out of the
// popup's first-paint import graph.
const LazyKiloCodeExportDialog = lazy(() =>
  import("~/components/KiloCodeExportDialog").then((m) => ({
    default: m.KiloCodeExportDialog,
  })),
)
const LazyKiloCodeProfileExportDialog = lazy(() =>
  import(
    "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog"
  ).then((m) => ({ default: m.KiloCodeProfileExportDialog })),
)

const buildServiceCredentialExportProfile = (
  account: DisplaySiteData,
  runtimeKey: ServiceCredentialRuntimeKey,
): ApiCredentialProfile => {
  const now = Date.now()
  return {
    id: `service-credential:${account.id}:${runtimeKey.service}`,
    name: buildApiCredentialProfileName({
      accountName: account.name,
      fallbackAccountName: account.name,
      tokenName: runtimeKey.label,
    }),
    apiType: API_TYPES.OPENAI_COMPATIBLE,
    baseUrl: runtimeKey.baseUrl,
    apiKey: runtimeKey.secret,
    tagIds: account.tagIds ?? [],
    notes: "",
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Renders quick-list actions that are permitted by the normalized key policy.
 */
export function RuntimeKeyActionControls({
  runtimeKey,
  actionPolicy,
  copiedRuntimeKeyId,
  onCopyKey,
  account,
  onOpenCCSwitchDialog,
}: RuntimeKeyActionControlsProps) {
  const { t } = useTranslation(["ui", "keyManagement", "settings"])
  const { managedSiteType, claudeCodeRouterBaseUrl, claudeCodeRouterApiKey } =
    useUserPreferencesContext()
  const { markGatewayGuidanceOnboardingCompleted } = useFeatureGuidanceContext()
  const { openWithAccount } = useChannelDialog()

  const [isClaudeCodeRouterOpen, setIsClaudeCodeRouterOpen] = useState(false)

  const [isKiloCodeDialogOpen, setIsKiloCodeDialogOpen] = useState(false)
  const [isCursorPlusDialogOpen, setIsCursorPlusDialogOpen] = useState(false)
  const [kelivoExportInput, setKelivoExportInput] =
    useState<KelivoProviderExportInput | null>(null)

  useEffect(() => {
    if (!actionPolicy.exportSecret) {
      setKelivoExportInput(null)
    }
  }, [actionPolicy.exportSecret])

  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)
  const serviceCredentialProfile = useMemo(
    () =>
      isServiceCredentialRuntimeKey(runtimeKey)
        ? buildServiceCredentialExportProfile(account, runtimeKey)
        : null,
    [account, runtimeKey],
  )
  const runtimeExportSource = useMemo(
    () => createAccountRuntimeKeyExportSource(account, runtimeKey),
    [account, runtimeKey],
  )
  const exportSource = useMemo(
    () =>
      serviceCredentialProfile
        ? createProfileCredentialExportSource(serviceCredentialProfile)
        : createAccountRuntimeKeyExportSource(account, runtimeKey, {
            preferCurrentSecret: true,
          }),
    [account, runtimeKey, serviceCredentialProfile],
  )
  const kelivoActionId = serviceCredentialProfile
    ? PRODUCT_ANALYTICS_ACTION_IDS.CopyServiceCredentialKelivoImportCode
    : PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKelivoImportCode
  const handleCopy = (event: MouseEvent) => {
    event.stopPropagation()
    void onCopyKey(runtimeKey)
  }

  const handleUseInCherry = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ExportAccountTokenToCherryStudio,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      const { OpenInCherryStudio } = await import(
        "~/services/integrations/cherryStudio"
      )
      if (serviceCredentialProfile) {
        OpenInCherryStudio(
          createProfileCredentialExportData(serviceCredentialProfile),
        )
      } else {
        OpenInCherryStudio(await resolveCredentialExport(runtimeExportSource))
      }
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error: getErrorMessage(error, t("messages:errors.unknown")),
        }),
      })
    }
  }

  const handleOpenKelivoExportDialog = async () => {
    try {
      let exportInput: KelivoProviderExportInput
      if (serviceCredentialProfile) {
        exportInput = serviceCredentialProfile
      } else {
        const resolvedRuntimeKey = await resolveDisplayAccountRuntimeKeySecret(
          account,
          runtimeKey,
        )
        exportInput = {
          apiType: API_TYPES.OPENAI_COMPATIBLE,
          name: buildApiCredentialProfileName({
            accountName: account.name,
            fallbackAccountName: account.name,
            tokenName: resolvedRuntimeKey.label,
          }),
          baseUrl: resolvedRuntimeKey.baseUrl,
          apiKey: resolvedRuntimeKey.secret,
        }
      }

      setKelivoExportInput(exportInput)
    } catch (error) {
      const tracker = startProductAnalyticsAction({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: kelivoActionId,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error:
            toSanitizedErrorSummary(
              error,
              collectAccountRuntimeKeySecrets([runtimeKey]),
            ) || t("messages:errors.unknown"),
        }),
      })
    }
  }

  const handleExportToCCSwitch = () => {
    onOpenCCSwitchDialog?.(exportSource)
  }

  const markGatewayGuidanceComplete = () => {
    void Promise.resolve(markGatewayGuidanceOnboardingCompleted()).catch(
      (error) =>
        logger.error(
          "Failed to mark gateway guidance onboarding complete",
          error,
        ),
    )
  }

  const handleImportToManagedSite = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      const result = await openWithAccount(
        account,
        runtimeKey,
        (channelResult) => {
          showResultToast(channelResult)
          if (channelResult?.success) {
            markGatewayGuidanceComplete()
          }
        },
      )

      if (result.opened || result.deferred) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
        return
      }

      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Skipped)
    } catch (error) {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      showResultToast({
        success: false,
        message: t("messages:errors.operation.failed", {
          error: getErrorMessage(error, t("messages:errors.unknown")),
        }),
      })
    }
  }

  const handleOpenClaudeCodeRouter = () => {
    if (!claudeCodeRouterBaseUrl) {
      showResultToast({
        success: false,
        message: t("messages:claudeCodeRouter.configMissing"),
      })
      return
    }
    setIsClaudeCodeRouterOpen(true)
  }

  const renderKiloCodeExportDialog = () => {
    if (!isKiloCodeDialogOpen) return null

    if (serviceCredentialProfile) {
      return (
        <Suspense fallback={null}>
          <LazyKiloCodeProfileExportDialog
            isOpen={true}
            onClose={() => setIsKiloCodeDialogOpen(false)}
            profile={serviceCredentialProfile}
          />
        </Suspense>
      )
    }

    return (
      <Suspense fallback={null}>
        <LazyKiloCodeExportDialog
          isOpen={true}
          onClose={() => setIsKiloCodeDialogOpen(false)}
          initialSelectedSiteIds={[account.id]}
          initialSelectedTokenIdsBySite={{
            [account.id]: [getAccountRuntimeKeyExportId(runtimeKey)],
          }}
        />
      </Suspense>
    )
  }

  const renderClaudeCodeRouterImportDialog = () => {
    if (!isClaudeCodeRouterOpen) return null

    return (
      <ClaudeCodeRouterImportDialog
        isOpen={true}
        onClose={() => setIsClaudeCodeRouterOpen(false)}
        source={exportSource}
        routerBaseUrl={claudeCodeRouterBaseUrl}
        routerApiKey={claudeCodeRouterApiKey}
      />
    )
  }

  if (!actionPolicy.copySecret && !actionPolicy.exportSecret) return null

  return (
    <>
      {renderKiloCodeExportDialog()}
      {isCursorPlusDialogOpen ? (
        <CursorPlusExportDialog
          isOpen={true}
          onClose={() => setIsCursorPlusDialogOpen(false)}
          source={runtimeExportSource}
        />
      ) : null}
      {actionPolicy.exportSecret && kelivoExportInput ? (
        <KelivoExportDialog
          isOpen={true}
          onClose={() => setKelivoExportInput(null)}
          initialValue={kelivoExportInput}
          analyticsContext={{
            featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
            actionId: kelivoActionId,
            surfaceId:
              PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
            entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          }}
        />
      ) : null}
      {renderClaudeCodeRouterImportDialog()}

      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        {actionPolicy.copySecret ? (
          <IconButton
            aria-label={
              copiedRuntimeKeyId === runtimeKey.id
                ? t("dialog.copyKey.copied")
                : t("dialog.copyKey.copy")
            }
            variant="ghost"
            size="sm"
            onClick={handleCopy}
          >
            {copiedRuntimeKeyId === runtimeKey.id ? (
              <Check className="text-success-text h-4 w-4" />
            ) : (
              <Copy className="text-muted-foreground h-4 w-4" />
            )}
          </IconButton>
        ) : null}
        {actionPolicy.exportSecret ? (
          <>
            <ManagedSiteImportButton
              managedSiteType={managedSiteType}
              managedSiteLabel={managedSiteLabel}
              onImport={handleImportToManagedSite}
              testId={
                ACCOUNT_MANAGEMENT_TEST_IDS.copyKeyDialogImportToManagedSiteButton
              }
            />
            <ExportActionsMenu
              triggerTestId={
                ACCOUNT_MANAGEMENT_TEST_IDS.copyKeyDialogExportMenuButton
              }
              actions={{
                [EXPORT_ACTION_TARGETS.CherryStudio]: {
                  onSelect: handleUseInCherry,
                },
                [EXPORT_ACTION_TARGETS.Kelivo]: {
                  onSelect: handleOpenKelivoExportDialog,
                },
                ...(onOpenCCSwitchDialog
                  ? {
                      [EXPORT_ACTION_TARGETS.CCSwitch]: {
                        testId:
                          ACCOUNT_MANAGEMENT_TEST_IDS.copyKeyDialogExportToCCSwitchButton,
                        onSelect: handleExportToCCSwitch,
                      },
                    }
                  : {}),
                [EXPORT_ACTION_TARGETS.CursorPlus]: {
                  testId:
                    ACCOUNT_MANAGEMENT_TEST_IDS.copyKeyDialogExportToCursorPlusButton,
                  onSelect: () => setIsCursorPlusDialogOpen(true),
                },
                [EXPORT_ACTION_TARGETS.KiloCode]: {
                  onSelect: () => setIsKiloCodeDialogOpen(true),
                },

                [EXPORT_ACTION_TARGETS.ClaudeCodeRouter]: {
                  onSelect: handleOpenClaudeCodeRouter,
                },
              }}
            />
          </>
        ) : null}
      </div>
    </>
  )
}
