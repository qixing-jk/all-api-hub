import { Copy, KeyRound, RefreshCw, Terminal, Wrench } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CliProxyExportDialog } from "~/components/CliProxyExportDialog"
import { CursorPlusExportDialog } from "~/components/CursorPlusExportDialog"
import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import {
  EXPORT_ACTION_TARGETS,
  ExportActionsMenu,
} from "~/components/ExportActionsMenu"
import { KelivoExportDialog } from "~/components/KelivoExportDialog"
import { ManagedSiteImportButton } from "~/components/ManagedSiteImportButton"
import {
  Badge,
  Button,
  Card,
  CardContent,
  Heading6,
  IconButton,
  WorkflowTransitionButton,
} from "~/components/ui"
import { useFeatureGuidanceContext } from "~/contexts/FeatureGuidanceContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { KiloCodeProfileExportDialog } from "~/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import {
  createCliProxyExportPayload,
  createExportAccount,
  createExportToken,
} from "~/features/ApiCredentialProfiles/utils/exportShims"
import { BatchSelectionControl } from "~/features/KeyManagement/components/BatchSelectionControl"
import {
  KeyResourceActionGroup,
  KeyResourceActionToolbar,
  KeyResourceCredentialAssociationControl,
  type KeyResourceCredentialAssociation,
} from "~/features/KeyManagement/components/KeyResourceCard"
import { KEY_CREDENTIAL_ASSOCIATION_STATES } from "~/features/KeyManagement/credentialAssociations"
import { saveAccountRuntimeKeysToApiCredentialProfiles } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import { cn } from "~/lib/utils"
import { buildServiceCredentialRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import { buildApiCredentialProfileName } from "~/services/apiCredentialProfiles/accountTokenProfileName"
import { OpenInCherryStudio } from "~/services/integrations/cherryStudio"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
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
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { showResultToast } from "~/utils/core/toastHelpers"
import { openSettingsTab } from "~/utils/navigation"

import { KEY_MANAGEMENT_TEST_IDS } from "../testIds"
import { formatKey } from "../utils"
import {
  getManagedSiteSettingsActionLabel,
  getManagedSiteStatusBadgeVariant,
  getManagedSiteStatusDescription,
  getManagedSiteStatusLabel,
} from "./TokenListItem/TokenHeader"

const logger = createLogger("ServiceCredentialCard")

interface ServiceCredentialCardProps {
  account: DisplaySiteData
  credential: AccountServiceCredential
  isRotating?: boolean
  isSelected?: boolean
  managedSiteStatus?: ManagedSiteTokenChannelStatus
  isManagedSiteStatusChecking?: boolean
  selectionLabel?: string
  onSelectionChange?: (checked: boolean) => void
  selectionDisabledReason?: string
  onCopy: (account: DisplaySiteData) => Promise<void>
  onRotate?: (account: DisplaySiteData) => Promise<void>
  association?: KeyResourceCredentialAssociation
  targetId?: string
  isNavigationTarget?: boolean
}

/**
 * Displays a provider-managed singleton service key that is not token CRUD.
 */
export function ServiceCredentialCard({
  account,
  credential,
  isRotating = false,
  isSelected,
  managedSiteStatus,
  isManagedSiteStatusChecking = false,
  selectionLabel,
  onSelectionChange,
  selectionDisabledReason,
  onCopy,
  onRotate,
  association,
  targetId,
  isNavigationTarget = false,
}: ServiceCredentialCardProps) {
  const { t } = useTranslation(["keyManagement", "messages"])
  const {
    managedSiteType,
    claudeCodeRouterBaseUrl,
    claudeCodeRouterApiKey,
    cliProxyBaseUrl,
    cliProxyManagementKey,
  } = useUserPreferencesContext()
  const { markGatewayGuidanceOnboardingCompleted } = useFeatureGuidanceContext()
  const { openWithCredentials } = useChannelDialog()
  const identityKey = `${account.id}:${credential.service}`
  const visibleKeys = new Set<string>()
  const apiType: ApiVerificationApiType = API_TYPES.OPENAI_COMPATIBLE
  const [ccSwitchProfile, setCCSwitchProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [kiloCodeProfile, setKiloCodeProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [kelivoProfile, setKelivoProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [isCursorPlusDialogOpen, setIsCursorPlusDialogOpen] = useState(false)
  const [cliProxyProfile, setCliProxyProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [claudeCodeRouterProfile, setClaudeCodeRouterProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [verifyingProfile, setVerifyingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const [cliVerifyingProfile, setCliVerifyingProfile] =
    useState<ApiCredentialProfile | null>(null)
  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)
  const credentialBaseUrl = credential.baseUrl || account.baseUrl
  const managedSiteStatusDescription = getManagedSiteStatusDescription(
    t,
    managedSiteStatus,
  )
  const isManagedSiteConfigMissing =
    managedSiteStatus?.status === MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN &&
    managedSiteStatus.reason ===
      MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.CONFIG_MISSING
  const transientProfile = useMemo(() => {
    const now = Date.now()
    return {
      id: `service-credential:${account.id}:${credential.service}`,
      name: buildApiCredentialProfileName({
        accountName: account.name,
        fallbackAccountName: account.name,
        tokenName: credential.label,
      }),
      apiType,
      baseUrl: credentialBaseUrl,
      apiKey: credential.key,
      tagIds: account.tagIds ?? [],
      notes: "",
      createdAt: now,
      updatedAt: now,
    } satisfies ApiCredentialProfile
  }, [
    account.id,
    account.name,
    account.tagIds,
    apiType,
    credential.key,
    credential.label,
    credential.service,
    credentialBaseUrl,
  ])
  const canRotate = onRotate !== undefined
  const runtimeKey = useMemo(
    () =>
      buildServiceCredentialRuntimeKey(account, credential, {
        canRotate,
      }),
    [account, canRotate, credential],
  )

  const handleSaveToApiCredentialProfiles = async () => {
    try {
      await saveAccountRuntimeKeysToApiCredentialProfiles({
        items: [
          {
            runtimeKey,
          },
        ],
        t,
        logger,
        source: "ServiceCredentialCard",
      })
    } catch {
      // The shared save helper already logs and shows the localized failure toast.
    }
  }
  const canSaveAndAssociate =
    !association ||
    association.status === KEY_CREDENTIAL_ASSOCIATION_STATES.Unlinked
  const apiCredentialAssociation: KeyResourceCredentialAssociation = {
    ...(association ?? {
      status: KEY_CREDENTIAL_ASSOCIATION_STATES.Unlinked,
      label: t("apiCredentialProfiles:association.notLinked"),
      actionLabel: t("apiCredentialProfiles:association.linkExisting"),
    }),
    onSaveAndAssociate: canSaveAndAssociate
      ? handleSaveToApiCredentialProfiles
      : undefined,
    saveAndAssociateLabel: canSaveAndAssociate
      ? t("actions.saveToApiProfiles")
      : undefined,
  }
  const cliProxyPayload = cliProxyProfile
    ? createCliProxyExportPayload(cliProxyProfile)
    : null
  const apiCredentialProfileExportContext = {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  } as const

  const handleUseInCherry = () => {
    const tracker = startProductAnalyticsAction({
      ...apiCredentialProfileExportContext,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToCherryStudio,
    })

    try {
      OpenInCherryStudio(
        createExportAccount(transientProfile),
        createExportToken(transientProfile),
      )
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

  const handleOpenCliProxyDialog = () => {
    if (!cliProxyBaseUrl?.trim() || !cliProxyManagementKey?.trim()) {
      showResultToast({
        success: false,
        message: t("messages:cliproxy.configMissing"),
      })
      return
    }

    setCliProxyProfile(transientProfile)
  }

  const handleOpenClaudeCodeRouter = () => {
    if (!claudeCodeRouterBaseUrl?.trim()) {
      showResultToast({
        success: false,
        message: t("messages:claudeCodeRouter.configMissing"),
      })
      return
    }

    setClaudeCodeRouterProfile(transientProfile)
  }

  const handleImportToManagedSite = async () => {
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ImportManagedSiteSingleToken,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    try {
      const result = await openWithCredentials(
        {
          name: transientProfile.name,
          baseUrl: transientProfile.baseUrl,
          apiKey: transientProfile.apiKey,
        },
        (channelResult) => {
          showResultToast(channelResult)
          if (channelResult?.success) {
            void Promise.resolve(
              markGatewayGuidanceOnboardingCompleted(),
            ).catch((error) =>
              logger.error(
                "Failed to mark gateway guidance onboarding complete",
                error,
              ),
            )
          }
        },
        {
          managedSiteStatus,
        },
      )
      tracker.complete(
        result.opened || result.deferred
          ? PRODUCT_ANALYTICS_RESULTS.Success
          : PRODUCT_ANALYTICS_RESULTS.Skipped,
      )
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

  const handleOpenManagedSiteSettings = () => {
    void Promise.resolve(
      openSettingsTab("managedSite", {
        preserveHistory: true,
      }),
    ).catch((error) =>
      logger.error("Failed to open managed-site settings", error),
    )
  }

  return (
    <>
      {ccSwitchProfile ? (
        <CCSwitchExportDialog
          isOpen={true}
          onClose={() => setCCSwitchProfile(null)}
          account={createExportAccount(ccSwitchProfile)}
          token={createExportToken(ccSwitchProfile)}
          analyticsContext={{
            ...apiCredentialProfileExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToCCSwitch,
          }}
        />
      ) : null}
      {kiloCodeProfile ? (
        <KiloCodeProfileExportDialog
          isOpen={true}
          onClose={() => setKiloCodeProfile(null)}
          profile={kiloCodeProfile}
        />
      ) : null}
      {kelivoProfile ? (
        <KelivoExportDialog
          isOpen={true}
          onClose={() => setKelivoProfile(null)}
          initialValue={kelivoProfile}
          analyticsContext={{
            ...apiCredentialProfileExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.CopyServiceCredentialKelivoImportCode,
          }}
        />
      ) : null}
      {isCursorPlusDialogOpen ? (
        <CursorPlusExportDialog
          isOpen={true}
          onClose={() => setIsCursorPlusDialogOpen(false)}
          account={account}
          runtimeKey={runtimeKey}
        />
      ) : null}
      {cliProxyPayload ? (
        <CliProxyExportDialog
          isOpen={true}
          onClose={() => setCliProxyProfile(null)}
          account={cliProxyPayload.account}
          token={cliProxyPayload.token}
          apiTypeHint={cliProxyPayload.apiTypeHint}
          analyticsContext={{
            ...apiCredentialProfileExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.ImportApiCredentialProfileToCliProxy,
          }}
        />
      ) : null}
      {claudeCodeRouterProfile ? (
        <ClaudeCodeRouterImportDialog
          isOpen={true}
          onClose={() => setClaudeCodeRouterProfile(null)}
          account={createExportAccount(claudeCodeRouterProfile)}
          token={createExportToken(claudeCodeRouterProfile)}
          routerBaseUrl={claudeCodeRouterBaseUrl}
          routerApiKey={claudeCodeRouterApiKey}
          analyticsContext={{
            ...apiCredentialProfileExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.ImportApiCredentialProfileToClaudeCodeRouter,
          }}
        />
      ) : null}
      <VerifyApiCredentialProfileDialog
        isOpen={Boolean(verifyingProfile)}
        onClose={() => setVerifyingProfile(null)}
        profile={verifyingProfile}
      />
      {cliVerifyingProfile ? (
        <VerifyCliSupportDialog
          isOpen={true}
          onClose={() => setCliVerifyingProfile(null)}
          profile={cliVerifyingProfile}
        />
      ) : null}
      <Card
        variant="interactive"
        data-testid={KEY_MANAGEMENT_TEST_IDS.serviceCredentialCard}
        id={targetId}
        data-navigation-target={isNavigationTarget ? "true" : undefined}
        tabIndex={targetId ? -1 : undefined}
        className={cn(
          isNavigationTarget &&
            "ring-primary-500 dark:ring-primary-400 ring-2 ring-offset-2 outline-none",
        )}
      >
        <CardContent padding="default">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <BatchSelectionControl
                  checked={isSelected === true}
                  label={selectionLabel ?? credential.label}
                  onSelectionChange={onSelectionChange}
                  disabledReason={selectionDisabledReason}
                />
                <KeyRound className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                <Heading6 className="truncate text-sm sm:text-base">
                  {credential.label}
                </Heading6>
                <Badge
                  variant={credential.isAuthenticated ? "success" : "warning"}
                  size="sm"
                >
                  {credential.isAuthenticated
                    ? t("serviceCredential.authenticated")
                    : t("serviceCredential.notAuthenticated")}
                </Badge>
                <Badge variant="outline" size="sm">
                  {t("serviceCredential.singleton")}
                </Badge>
              </div>
              <KeyResourceActionToolbar label={t("actionToolbar.label")}>
                <KeyResourceActionGroup label={t("actionToolbar.quickActions")}>
                  <IconButton
                    aria-label={t("serviceCredential.copy")}
                    size="sm"
                    variant="ghost"
                    onClick={() => void onCopy(account)}
                  >
                    <Copy className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
                  </IconButton>
                </KeyResourceActionGroup>
                <KeyResourceActionGroup
                  label={t("actionToolbar.integrationsAndExport")}
                  separated
                >
                  <ManagedSiteImportButton
                    managedSiteType={managedSiteType}
                    managedSiteLabel={managedSiteLabel}
                    onImport={handleImportToManagedSite}
                    testId={
                      KEY_MANAGEMENT_TEST_IDS.serviceCredentialImportToManagedSiteButton
                    }
                  />
                  <ExportActionsMenu
                    triggerTestId={
                      KEY_MANAGEMENT_TEST_IDS.serviceCredentialExportMenuButton
                    }
                    actions={{
                      [EXPORT_ACTION_TARGETS.CherryStudio]: {
                        onSelect: handleUseInCherry,
                      },
                      [EXPORT_ACTION_TARGETS.Kelivo]: {
                        onSelect: () => setKelivoProfile(transientProfile),
                      },
                      [EXPORT_ACTION_TARGETS.CCSwitch]: {
                        testId:
                          KEY_MANAGEMENT_TEST_IDS.serviceCredentialExportToCCSwitchButton,
                        onSelect: () => setCCSwitchProfile(transientProfile),
                      },
                      [EXPORT_ACTION_TARGETS.CursorPlus]: {
                        onSelect: () => setIsCursorPlusDialogOpen(true),
                      },
                      [EXPORT_ACTION_TARGETS.KiloCode]: {
                        onSelect: () => setKiloCodeProfile(transientProfile),
                      },
                      [EXPORT_ACTION_TARGETS.CliProxy]: {
                        onSelect: handleOpenCliProxyDialog,
                      },
                      [EXPORT_ACTION_TARGETS.ClaudeCodeRouter]: {
                        onSelect: handleOpenClaudeCodeRouter,
                      },
                    }}
                  />
                  <KeyResourceCredentialAssociationControl
                    association={apiCredentialAssociation}
                  />
                </KeyResourceActionGroup>
                <KeyResourceActionGroup
                  label={t("actionToolbar.diagnostics")}
                  separated
                >
                  <IconButton
                    aria-label={t("actions.verifyApi")}
                    size="sm"
                    variant="ghost"
                    onClick={() => setVerifyingProfile(transientProfile)}
                  >
                    <Wrench className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </IconButton>
                  <IconButton
                    aria-label={t("actions.verifyCliSupport")}
                    size="sm"
                    variant="ghost"
                    onClick={() => setCliVerifyingProfile(transientProfile)}
                  >
                    <Terminal className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </IconButton>
                </KeyResourceActionGroup>
                {onRotate ? (
                  <KeyResourceActionGroup
                    label={t("actionToolbar.management")}
                    separated
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={isRotating}
                      onClick={() => void onRotate(account)}
                      leftIcon={<RefreshCw className="h-4 w-4" />}
                    >
                      {isRotating
                        ? t("serviceCredential.rotating")
                        : t("serviceCredential.rotate")}
                    </Button>
                  </KeyResourceActionGroup>
                ) : null}
              </KeyResourceActionToolbar>
            </div>
            <div className="dark:text-dark-text-secondary space-y-2 text-xs text-gray-600 sm:text-sm">
              {isManagedSiteStatusChecking || managedSiteStatus ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge
                    variant={getManagedSiteStatusBadgeVariant({
                      isChecking: isManagedSiteStatusChecking,
                      managedSiteStatus,
                    })}
                    size="sm"
                    data-testid={KEY_MANAGEMENT_TEST_IDS.managedSiteStatusBadge}
                  >
                    {isManagedSiteStatusChecking ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : null}
                    {getManagedSiteStatusLabel(t, {
                      isChecking: isManagedSiteStatusChecking,
                      managedSiteStatus,
                    })}
                  </Badge>
                  {managedSiteStatusDescription ? (
                    <span
                      className="break-words whitespace-normal"
                      title={managedSiteStatusDescription}
                    >
                      {managedSiteStatusDescription}
                    </span>
                  ) : null}
                  {isManagedSiteConfigMissing ? (
                    <WorkflowTransitionButton
                      size="sm"
                      variant="outline"
                      className="h-auto px-2 py-0.5 text-xs"
                      onClick={handleOpenManagedSiteSettings}
                    >
                      {getManagedSiteSettingsActionLabel(t, {
                        isConfigMissing: true,
                      })}
                    </WorkflowTransitionButton>
                  ) : null}
                </div>
              ) : null}
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 break-words">
                <span className="dark:text-dark-text-tertiary shrink-0 text-gray-500">
                  {t("keyDetails.key")}
                </span>
                <code className="dark:bg-dark-bg-tertiary dark:text-dark-text-secondary inline-block max-w-full truncate rounded bg-gray-100 px-1.5 py-0.5 align-middle font-mono text-[10px] text-gray-800 sm:px-2 sm:py-1 sm:text-xs">
                  {formatKey(credential.key, identityKey, visibleKeys)}
                </code>
              </div>
              {credential.baseUrl ? (
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 break-words">
                  <span className="dark:text-dark-text-tertiary shrink-0 text-gray-500">
                    {t("serviceCredential.baseUrl")}
                  </span>
                  <span className="dark:text-dark-text-primary min-w-0 font-medium break-words text-gray-900">
                    {credential.baseUrl}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
