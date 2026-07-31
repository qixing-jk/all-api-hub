import type { TFunction } from "i18next"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { ApiCredentialLibraryIcon } from "~/components/icons/productIcons"
import { PageHeader } from "~/components/PageHeader"
import { Button } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import type { ManagedSiteType } from "~/constants/siteType"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"
import {
  buildUnifiedApiGuidanceModel,
  GatewayGuidanceDismissDialog,
  UNIFIED_API_GUIDANCE_ACTION_KINDS,
  UNIFIED_API_GUIDANCE_STATUSES,
  useGatewayGuidanceDismissal,
  type UnifiedApiGuidanceAction,
  type UnifiedApiGuidanceModel,
  type UnifiedApiGuidanceStatus,
} from "~/features/UnifiedApiGuidance"
import {
  GuidanceCardActionButton,
  GuidanceCardLayout,
  GuidanceCardNote,
} from "~/features/UnifiedApiGuidance/components/GuidanceCardLayout"
import { GATEWAY_GUIDANCE_SURFACES } from "~/services/preferences/userPreferences"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { openSettingsTab, pushWithinOptionsPage } from "~/utils/navigation"

import { ApiCredentialProfilesListView } from "./components/ApiCredentialProfilesListView"
import { useApiCredentialProfilesController } from "./hooks/useApiCredentialProfilesController"
import { API_CREDENTIAL_PROFILES_TEST_IDS } from "./testIds"

/**
 * Options page for managing API credential profiles.
 */
export default function ApiCredentialProfiles({
  routeParams,
}: {
  routeParams?: Record<string, string>
}) {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
  ])

  const controller = useApiCredentialProfilesController()
  const { openAddDialog } = controller
  const { preferences, managedSiteType } = useUserPreferencesContext()
  const [guidedImportEntryRequest, setGuidedImportEntryRequest] = useState(0)
  const unifiedApiGuidance = buildApiCredentialGatewayGuidanceModel(
    controller.profiles.length,
    preferences,
    managedSiteType,
  )
  const guidanceDismissal = useGatewayGuidanceDismissal(
    GATEWAY_GUIDANCE_SURFACES.ApiCredentialProfiles,
    preferences,
  )
  const consumedCreatePrefillKeyRef = useRef<string | null>(null)
  const consumedGuidedImportRef = useRef(false)
  const createPrefill = useMemo(() => {
    if (routeParams?.action !== "add") {
      return null
    }

    const name = routeParams.name?.trim()
    const baseUrl = routeParams.baseUrl?.trim()
    if (!name || !baseUrl) {
      return null
    }

    const apiKeyCreateUrl = routeParams.apiKeyCreateUrl?.trim()
    const apiKeyCreateHint = routeParams.apiKeyCreateHint?.trim()
    return {
      name,
      baseUrl,
      apiKeyCreateUrl: apiKeyCreateUrl || undefined,
      apiKeyCreateHint: apiKeyCreateHint || undefined,
    }
  }, [routeParams])

  useEffect(() => {
    if (!createPrefill) {
      consumedCreatePrefillKeyRef.current = null
      return
    }

    const prefillKey = `${createPrefill.name}\n${createPrefill.baseUrl}\n${createPrefill.apiKeyCreateUrl ?? ""}\n${createPrefill.apiKeyCreateHint ?? ""}`
    if (consumedCreatePrefillKeyRef.current === prefillKey) {
      return
    }

    consumedCreatePrefillKeyRef.current = prefillKey
    openAddDialog(createPrefill)
  }, [createPrefill, openAddDialog])

  useEffect(() => {
    const isGuidedManagedSiteImport =
      routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport] ===
      KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite

    if (!isGuidedManagedSiteImport) {
      consumedGuidedImportRef.current = false
      return
    }
    if (consumedGuidedImportRef.current) {
      return
    }

    consumedGuidedImportRef.current = true
    setGuidedImportEntryRequest((request) => request + 1)
  }, [routeParams])

  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles}
      surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesPage}
    >
      <div className="space-y-6 p-6">
        <PageHeader
          icon={ApiCredentialLibraryIcon}
          title={t("title")}
          description={t("description")}
          actions={
            <Button
              onClick={() => openAddDialog()}
              data-testid={API_CREDENTIAL_PROFILES_TEST_IDS.addButton}
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog
              }
            >
              {t("apiCredentialProfiles:actions.add")}
            </Button>
          }
        />

        {guidanceDismissal.shouldShow ? (
          <ApiCredentialGatewayGuidance
            model={unifiedApiGuidance}
            onAddApiCredential={() => openAddDialog()}
            onShowImportEntry={() =>
              setGuidedImportEntryRequest((request) => request + 1)
            }
            onAction={(action) => {
              if (
                action.kind ===
                UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite
              ) {
                void openSettingsTab("managedSite", {
                  preserveHistory: true,
                })
                return
              }

              pushWithinOptionsPage(
                `#${action.target.menuItemId}`,
                action.target.params ?? {},
              )
            }}
            onDismissForSession={guidanceDismissal.dismissForSession}
            onRequestPermanentDismiss={
              guidanceDismissal.requestPermanentDismiss
            }
          />
        ) : null}

        <GatewayGuidanceDismissDialog
          isOpen={guidanceDismissal.isPermanentDismissDialogOpen}
          title={t(
            "apiCredentialProfiles:unifiedApiGuidance.dismissDialog.title",
          )}
          description={t(
            "apiCredentialProfiles:unifiedApiGuidance.dismissDialog.description",
          )}
          cancelLabel={t("common:actions.cancel")}
          confirmLabel={t(
            "apiCredentialProfiles:unifiedApiGuidance.dismissDialog.confirm",
          )}
          isSaving={guidanceDismissal.isPermanentDismissSaving}
          onClose={guidanceDismissal.cancelPermanentDismiss}
          onConfirm={() => void guidanceDismissal.confirmPermanentDismiss()}
        />

        <ApiCredentialProfilesListView
          controller={controller}
          guidedImportEntryRequest={guidedImportEntryRequest}
        />
      </div>
    </ProductAnalyticsScope>
  )
}

interface ApiCredentialGatewayGuidanceProps {
  model: UnifiedApiGuidanceModel
  onAddApiCredential: () => void
  onShowImportEntry: () => void
  onAction: (action: UnifiedApiGuidanceAction) => void
  onDismissForSession: () => void
  onRequestPermanentDismiss: () => void
}

/**
 * Renders API credential guidance using the same visual language as unified API setup cards.
 */
export function ApiCredentialGatewayGuidance({
  model,
  onAddApiCredential,
  onShowImportEntry,
  onAction,
  onDismissForSession,
  onRequestPermanentDismiss,
}: ApiCredentialGatewayGuidanceProps) {
  const { t } = useTranslation(["apiCredentialProfiles", "common"])
  const isReadyToImport =
    model.status === UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport

  return (
    <GuidanceCardLayout
      badge={getApiCredentialGuidanceSourceLabel(t, model.status)}
      badgeVariant={apiCredentialGuidanceBadgeVariants[model.status]}
      title={t("apiCredentialProfiles:unifiedApiGuidance.title")}
      description={getApiCredentialGuidanceDescription(t, model.status)}
      dismissControls={{
        dismissForSessionLabel: t(
          "apiCredentialProfiles:unifiedApiGuidance.dismissForSession",
        ),
        permanentlyDismissLabel: t(
          "apiCredentialProfiles:unifiedApiGuidance.permanentlyDismiss",
        ),
        onDismissForSession,
        onRequestPermanentDismiss,
      }}
      notes={
        <div
          className={
            isReadyToImport ? "grid gap-2" : "grid gap-2 md:grid-cols-2"
          }
        >
          <GuidanceCardNote icon="managedSite">
            {t("apiCredentialProfiles:unifiedApiGuidance.boundaryNote")}
          </GuidanceCardNote>
          {isReadyToImport ? (
            <GuidanceCardNote icon="key">
              {t("apiCredentialProfiles:unifiedApiGuidance.importHint")}
            </GuidanceCardNote>
          ) : null}
          {!isReadyToImport ? (
            <GuidanceCardNote icon="key">
              {getApiCredentialGuidanceStatusNote(t, model.status)}
            </GuidanceCardNote>
          ) : null}
        </div>
      }
      actions={
        <GuidanceCardActionButton
          primary
          onClick={() => {
            if (
              model.primaryAction.kind ===
              UNIFIED_API_GUIDANCE_ACTION_KINDS.AddApiCredential
            ) {
              onAddApiCredential()
              return
            }

            if (isReadyToImport) {
              onShowImportEntry()
              return
            }

            onAction(model.primaryAction)
          }}
        >
          {getApiCredentialGuidanceActionLabel(t, model.status)}
        </GuidanceCardActionButton>
      }
      actionPanelJustify="start"
    />
  )
}

const apiCredentialGuidanceBadgeVariants = {
  [UNIFIED_API_GUIDANCE_STATUSES.NeedsSources]: "warning",
  [UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource]: "warning",
  [UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite]: "info",
  [UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport]: "success",
  [UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels]: "success",
} as const

/**
 * Resolves the API credential guidance badge label for the current setup state.
 */
function getApiCredentialGuidanceSourceLabel(
  t: TFunction,
  status: UnifiedApiGuidanceStatus,
): string {
  switch (status) {
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsSources:
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource:
      return t("apiCredentialProfiles:unifiedApiGuidance.sources.needs_sources")
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.sources.needs_managed_site",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.sources.ready_to_import",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.sources.has_gateway_channels",
      )
  }
}

/**
 * Resolves the API credential guidance body copy for the current setup state.
 */
function getApiCredentialGuidanceDescription(
  t: TFunction,
  status: UnifiedApiGuidanceStatus,
): string {
  switch (status) {
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsSources:
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.description.needs_sources",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.description.needs_managed_site",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.description.ready_to_import",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.description.has_gateway_channels",
      )
  }
}

/**
 * Resolves the secondary note shown beside the gateway boundary note.
 */
function getApiCredentialGuidanceStatusNote(
  t: TFunction,
  status: UnifiedApiGuidanceStatus,
): string {
  switch (status) {
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsSources:
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource:
      return t("apiCredentialProfiles:unifiedApiGuidance.notes.needs_sources")
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.notes.needs_managed_site",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport:
      return t("apiCredentialProfiles:unifiedApiGuidance.importHint")
    case UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels:
      return t("apiCredentialProfiles:unifiedApiGuidance.channelHistoryHint")
  }
}

/**
 * Resolves the primary API credential guidance action label.
 */
function getApiCredentialGuidanceActionLabel(
  t: TFunction,
  status: UnifiedApiGuidanceStatus,
): string {
  switch (status) {
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsSources:
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.actions.addApiCredential",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.actions.configureManagedSite",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.actions.addFirstChannel",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels:
      return t(
        "apiCredentialProfiles:unifiedApiGuidance.actions.manageChannels",
      )
  }
}

/**
 * Adapts the shared unified API guidance state machine to the API credential
 * surface, where standalone API keys are the source being configured.
 */
export function buildApiCredentialGatewayGuidanceModel(
  profileCount: number,
  preferences: UserPreferences | null | undefined,
  managedSiteType: ManagedSiteType | undefined,
): UnifiedApiGuidanceModel {
  const model = buildUnifiedApiGuidanceModel({
    enabledAccountCount: 0,
    keyAccessibleAccountCount: 0,
    profileCount,
    preferences,
    managedSiteType,
  })

  if (model.status === UNIFIED_API_GUIDANCE_STATUSES.NeedsSources) {
    return {
      ...model,
      primaryAction: {
        kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.AddApiCredential,
        target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
      },
      secondaryActions: [],
      optionalActions: [],
    }
  }

  if (model.status === UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite) {
    return {
      ...model,
      secondaryActions: [],
      optionalActions: [],
    }
  }

  const manageChannelsAction = model.secondaryActions.find(
    (action) =>
      action.kind === UNIFIED_API_GUIDANCE_ACTION_KINDS.ManageChannels,
  )

  return {
    ...model,
    primaryAction: manageChannelsAction ?? {
      kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.ManageChannels,
      target: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_CHANNELS },
    },
    secondaryActions: [],
    optionalActions: [],
  }
}
