import { Copy, KeyRound, RefreshCw, Terminal, Wrench } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import {
  Badge,
  Button,
  Card,
  CardContent,
  Heading6,
  IconButton,
  WorkflowTransitionButton,
} from "~/components/ui"
import { KiloCodeProfileExportDialog } from "~/features/ApiCredentialProfiles/export/KiloCodeProfileExportDialog"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/verification/VerifyApiCredentialProfileDialog"
import { ClaudeCodeRouterImportDialog } from "~/features/CredentialExport/ClaudeCodeRouterImportDialog"
import { CursorPlusExportDialog } from "~/features/CredentialExport/CursorPlusExportDialog"
import {
  createDeeplinkExportMenuActions,
  createProfileDeeplinkExportRequest,
  DEEPLINK_EXPORT_TARGETS,
  DeeplinkExportDialog,
  type DeeplinkExportRequest,
} from "~/features/CredentialExport/DeeplinkExportDialog"
import {
  EXPORT_ACTION_TARGETS,
  ExportActionsMenu,
} from "~/features/CredentialExport/ExportActionsMenu"
import { KelivoExportDialog } from "~/features/CredentialExport/KelivoExportDialog"
import { KEY_CREDENTIAL_ASSOCIATION_STATES } from "~/features/KeyManagement/associations/credentialAssociations"
import {
  getManagedSiteSettingsActionLabel,
  getManagedSiteStatusBadgeVariant,
  getManagedSiteStatusDescription,
  getManagedSiteStatusLabel,
} from "~/features/KeyManagement/components/RuntimeKeyActions/RuntimeKeyHeader"
import { useRuntimeKeyIntegrationActions } from "~/features/KeyManagement/components/RuntimeKeyActions/useRuntimeKeyIntegrationActions"
import { useRuntimeKeyVerificationActions } from "~/features/KeyManagement/components/RuntimeKeyActions/useRuntimeKeyVerificationActions"
import { BatchSelectionControl } from "~/features/KeyManagement/inventory/BatchSelectionControl"
import {
  KeyResourceActionGroup,
  KeyResourceActionToolbar,
  KeyResourceCredentialAssociationControl,
  type KeyResourceCredentialAssociation,
} from "~/features/KeyManagement/inventory/KeyResourceCard"
import { ManagedSiteStatusDisclosure } from "~/features/KeyManagement/managedSite/ManagedSiteStatusDisclosure"
import { KEY_MANAGEMENT_TEST_IDS } from "~/features/KeyManagement/testIds"
import { formatKey } from "~/features/KeyManagement/utils"
import { ManagedSiteImportButton } from "~/features/ManagedSiteWidgets/ManagedSiteImportButton"
import { saveAccountRuntimeKeysToApiCredentialProfiles } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import { cn } from "~/lib/utils"
import { buildServiceCredentialRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { createAccountRuntimeKeyExportSource } from "~/services/accounts/utils/credentialExport"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import { buildApiCredentialProfileName } from "~/services/apiCredentialProfiles/accountImport/accountTokenProfileName"
import { createProfileCredentialExportSource } from "~/services/apiCredentialProfiles/credentialExport"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/core/logger"
import { openSettingsTab } from "~/utils/navigation"

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
  const identityKey = `${account.id}:${credential.service}`
  const visibleKeys = new Set<string>()
  const apiType: ApiVerificationApiType = API_TYPES.OPENAI_COMPATIBLE
  const [deeplinkExportRequest, setDeeplinkExportRequest] =
    useState<DeeplinkExportRequest | null>(null)
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
  const runtimeExportSource = useMemo(
    () => createAccountRuntimeKeyExportSource(account, runtimeKey),
    [account, runtimeKey],
  )
  const transientExportSource = useMemo(
    () => createProfileCredentialExportSource(transientProfile),
    [transientProfile],
  )
  const { dialogs, exportActions, managedSiteImport } =
    useRuntimeKeyIntegrationActions({
      account,
      runtimeKey,
      enabled: true,
      managedSiteStatus,
      credentialProfile: transientProfile,
    })
  const {
    verifyingProfile,
    cliVerifyingProfile,
    closeVerification,
    closeCliVerification,
    handleVerifyApi,
    handleVerifyCliSupport,
  } = useRuntimeKeyVerificationActions({
    account,
    runtimeKey,
    enabled: true,
    credentialProfile: transientProfile,
  })
  const {
    managedSiteLabel,
    managedSiteType,
    onImport: handleImportToManagedSite,
  } = managedSiteImport
  const { baseUrl: claudeCodeRouterBaseUrl, apiKey: claudeCodeRouterApiKey } =
    dialogs.claudeCodeRouter
  const kiloCodeProfile = dialogs.kiloCode.isOpen
    ? dialogs.kiloCode.profile
    : null
  const kelivoProfile = dialogs.kelivo.input
  const isCursorPlusDialogOpen = dialogs.cursorPlus.isOpen
  const claudeCodeRouterProfile = dialogs.claudeCodeRouter.isOpen
    ? dialogs.claudeCodeRouter.profile
    : null
  const claudeCodeRouterSource = useMemo(
    () =>
      claudeCodeRouterProfile
        ? createProfileCredentialExportSource(claudeCodeRouterProfile)
        : null,
    [claudeCodeRouterProfile],
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

  const apiCredentialProfileExportContext = {
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  } as const

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
      {deeplinkExportRequest ? (
        <DeeplinkExportDialog
          request={deeplinkExportRequest}
          onClose={() => setDeeplinkExportRequest(null)}
        />
      ) : null}
      {kiloCodeProfile ? (
        <KiloCodeProfileExportDialog
          isOpen={true}
          onClose={dialogs.kiloCode.close}
          profile={kiloCodeProfile}
        />
      ) : null}
      {kelivoProfile ? (
        <KelivoExportDialog
          isOpen={true}
          onClose={dialogs.kelivo.close}
          initialValue={kelivoProfile}
          analyticsContext={dialogs.kelivo.analyticsContext}
        />
      ) : null}
      {isCursorPlusDialogOpen ? (
        <CursorPlusExportDialog
          isOpen={true}
          onClose={dialogs.cursorPlus.close}
          source={runtimeExportSource}
        />
      ) : null}

      {claudeCodeRouterSource ? (
        <ClaudeCodeRouterImportDialog
          isOpen={true}
          onClose={dialogs.claudeCodeRouter.close}
          source={claudeCodeRouterSource}
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
        onClose={closeVerification}
        profile={verifyingProfile}
      />
      {cliVerifyingProfile ? (
        <VerifyCliSupportDialog
          isOpen={true}
          onClose={closeCliVerification}
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
        <CardContent padding="default" spacing="default">
          <div className="gap-density-3 flex min-w-0 flex-col">
            <div className="gap-y-density-2 flex min-w-0 flex-wrap items-center justify-between gap-x-2">
              <div className="gap-y-density-2 flex min-w-0 flex-wrap items-center gap-x-2">
                <BatchSelectionControl
                  checked={isSelected === true}
                  label={selectionLabel ?? credential.label}
                  onSelectionChange={onSelectionChange}
                  disabledReason={selectionDisabledReason}
                />
                <KeyRound className="text-link h-4 w-4 shrink-0" />
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
                {isManagedSiteStatusChecking || managedSiteStatus ? (
                  <ManagedSiteStatusDisclosure
                    status={
                      <Badge
                        variant={getManagedSiteStatusBadgeVariant({
                          isChecking: isManagedSiteStatusChecking,
                          managedSiteStatus,
                        })}
                        size="sm"
                        data-testid={
                          KEY_MANAGEMENT_TEST_IDS.managedSiteStatusBadge
                        }
                      >
                        {isManagedSiteStatusChecking ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : null}
                        {getManagedSiteStatusLabel(t, {
                          isChecking: isManagedSiteStatusChecking,
                          managedSiteStatus,
                        })}
                      </Badge>
                    }
                  >
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
                        className="h-auto min-h-(--density-control-xs) px-2 py-0.5 text-xs"
                        onClick={handleOpenManagedSiteSettings}
                      >
                        {getManagedSiteSettingsActionLabel(t, {
                          isConfigMissing: true,
                        })}
                      </WorkflowTransitionButton>
                    ) : null}
                  </ManagedSiteStatusDisclosure>
                ) : null}
              </div>
              <KeyResourceActionToolbar label={t("actionToolbar.label")}>
                <KeyResourceActionGroup label={t("actionToolbar.quickActions")}>
                  <IconButton
                    aria-label={t("serviceCredential.copy")}
                    size="sm"
                    variant="ghost"
                    onClick={() => void onCopy(account)}
                  >
                    <Copy className="text-muted-foreground h-4 w-4" />
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
                        onSelect: exportActions.openCherryStudio,
                      },
                      [EXPORT_ACTION_TARGETS.Kelivo]: {
                        onSelect: exportActions.openKelivo,
                      },
                      ...createDeeplinkExportMenuActions({
                        testIds: {
                          [DEEPLINK_EXPORT_TARGETS.CCSwitch]:
                            KEY_MANAGEMENT_TEST_IDS.serviceCredentialExportToCCSwitchButton,
                          [DEEPLINK_EXPORT_TARGETS.AiToolbox]:
                            KEY_MANAGEMENT_TEST_IDS.serviceCredentialExportToAiToolboxButton,
                        },
                        onSelect: (target) =>
                          setDeeplinkExportRequest(
                            createProfileDeeplinkExportRequest({
                              target,
                              source: transientExportSource,
                              baseContext: apiCredentialProfileExportContext,
                            }),
                          ),
                      }),
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
                    onClick={() => void handleVerifyApi()}
                  >
                    <Wrench className="text-link h-4 w-4" />
                  </IconButton>
                  <IconButton
                    aria-label={t("actions.verifyCliSupport")}
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleVerifyCliSupport()}
                  >
                    <Terminal className="text-link h-4 w-4" />
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
            <div className="dark:text-secondary-foreground text-muted-foreground space-y-density-2 text-xs sm:text-sm">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 break-words">
                <span className="text-muted-foreground shrink-0">
                  {t("keyDetails.key")}
                </span>
                <code className="dark:bg-secondary bg-muted text-secondary-foreground sm:py-density-1 text-3xs inline-block max-w-full truncate rounded px-1.5 py-0.5 align-middle font-mono sm:px-2 sm:text-xs">
                  {formatKey(credential.key, identityKey, visibleKeys)}
                </code>
              </div>
              {credential.baseUrl ? (
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 break-words">
                  <span className="text-muted-foreground shrink-0">
                    {t("serviceCredential.baseUrl")}
                  </span>
                  <span className="text-foreground min-w-0 font-medium break-words">
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
