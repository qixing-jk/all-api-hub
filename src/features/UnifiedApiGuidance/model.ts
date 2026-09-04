import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import {
  MENU_ITEM_IDS,
  type OptionsMenuItemId,
} from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { ManagedSiteType } from "~/constants/siteType"
import {
  ACCOUNT_MANAGEMENT_ROUTE_ACTIONS,
  ACCOUNT_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/AccountManagement/routeParams"
import type {
  FeatureGuidanceState,
  GatewayGuidanceSurface,
} from "~/services/featureGuidance/featureGuidanceState"
import { hasValidManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import { supportsManagedSiteModelSync } from "~/services/managedSites/utils/managedSite"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS,
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES,
} from "~/services/productAnalytics/contracts"

export const UNIFIED_API_GUIDANCE_STATUSES =
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_STATUSES

export const UNIFIED_API_GUIDANCE_SOURCE_KINDS = {
  None: "none",
  AccountUnavailable: "account_unavailable",
  Account: "account",
  Profile: "profile",
  Both: "both",
} as const

export const UNIFIED_API_GUIDANCE_STEP_IDS = {
  Source: "source",
  GatewaySettings: "gateway_settings",
  GatewayChannel: "gateway_channel",
  ClientAccess: "client_access",
} as const

export const UNIFIED_API_GUIDANCE_STEP_STATES = {
  Completed: "completed",
  Current: "current",
  Upcoming: "upcoming",
} as const

export const UNIFIED_API_GUIDANCE_ACTION_KINDS =
  PRODUCT_ANALYTICS_UNIFIED_API_GUIDANCE_ACTION_KINDS

type ValueOf<T> = T[keyof T]

export type UnifiedApiGuidanceStatus = ValueOf<
  typeof UNIFIED_API_GUIDANCE_STATUSES
>
export type UnifiedApiGuidanceSourceKind = ValueOf<
  typeof UNIFIED_API_GUIDANCE_SOURCE_KINDS
>
export type UnifiedApiGuidanceActionKind = ValueOf<
  typeof UNIFIED_API_GUIDANCE_ACTION_KINDS
>
export type UnifiedApiGuidanceStepId = ValueOf<
  typeof UNIFIED_API_GUIDANCE_STEP_IDS
>
export type UnifiedApiGuidanceStepState = ValueOf<
  typeof UNIFIED_API_GUIDANCE_STEP_STATES
>
export type UnifiedApiGuidanceCtaActionKind = Exclude<
  UnifiedApiGuidanceActionKind,
  | typeof UNIFIED_API_GUIDANCE_ACTION_KINDS.SaveApiCredentialRecovery
  | typeof UNIFIED_API_GUIDANCE_ACTION_KINDS.RequestSiteSupport
>

export interface UnifiedApiGuidanceNavigationTarget {
  menuItemId: OptionsMenuItemId
  params?: Record<string, string | undefined>
}

export interface UnifiedApiGuidanceAction {
  kind: UnifiedApiGuidanceCtaActionKind
  target: UnifiedApiGuidanceNavigationTarget
}

export interface UnifiedApiGuidanceStep {
  id: UnifiedApiGuidanceStepId
  state: UnifiedApiGuidanceStepState
}

export interface UnifiedApiGuidanceModel {
  status: UnifiedApiGuidanceStatus
  sourceKind: UnifiedApiGuidanceSourceKind
  managedSiteType?: ManagedSiteType
  modelSyncSupported: boolean
  steps: UnifiedApiGuidanceStep[]
  primaryAction: UnifiedApiGuidanceAction
  secondaryActions: UnifiedApiGuidanceAction[]
  optionalActions: UnifiedApiGuidanceAction[]
}

const buildGuidanceSteps = (
  status: UnifiedApiGuidanceStatus,
): UnifiedApiGuidanceStep[] => {
  const { Completed, Current, Upcoming } = UNIFIED_API_GUIDANCE_STEP_STATES

  switch (status) {
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsSources:
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource:
      return [
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.Source, state: Current },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.GatewaySettings, state: Upcoming },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.GatewayChannel, state: Upcoming },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.ClientAccess, state: Upcoming },
      ]
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite:
      return [
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.Source, state: Completed },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.GatewaySettings, state: Current },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.GatewayChannel, state: Upcoming },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.ClientAccess, state: Upcoming },
      ]
    case UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport:
      return [
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.Source, state: Completed },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.GatewaySettings, state: Completed },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.GatewayChannel, state: Current },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.ClientAccess, state: Upcoming },
      ]
    case UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels:
      return [
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.Source, state: Completed },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.GatewaySettings, state: Completed },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.GatewayChannel, state: Completed },
        { id: UNIFIED_API_GUIDANCE_STEP_IDS.ClientAccess, state: Current },
      ]
  }
}

/**
 * Returns whether the user has completed the one-time self-hosted gateway
 * onboarding goal. This is intentionally a product-guidance marker, not a live
 * channel-count or gateway-health signal.
 */
function hasCompletedGatewayGuidanceOnboarding(
  guidanceState: FeatureGuidanceState | null | undefined,
): boolean {
  return Boolean(guidanceState?.gatewayGuidance.onboardingCompletedAt)
}

/**
 * Returns whether a source surface has been explicitly hidden by the user.
 */
function hasDismissedGatewayGuidanceSurface(
  guidanceState: FeatureGuidanceState | null | undefined,
  surface: GatewayGuidanceSurface,
): boolean {
  return Boolean(guidanceState?.gatewayGuidance.dismissedAtBySurface[surface])
}

/**
 * Resolves whether source-surface gateway guidance should be shown.
 */
export function shouldShowGatewayGuidanceSurface(
  guidanceState: FeatureGuidanceState | null | undefined,
  surface: GatewayGuidanceSurface,
  dismissedForSession = false,
): boolean {
  return (
    !dismissedForSession &&
    !hasCompletedGatewayGuidanceOnboarding(guidanceState) &&
    !hasDismissedGatewayGuidanceSurface(guidanceState, surface)
  )
}

interface BuildUnifiedApiGuidanceModelInput {
  enabledAccountCount: number
  keyAccessibleAccountCount: number
  profileCount: number
  preferences: UserPreferences | null | undefined
  guidanceState?: FeatureGuidanceState | null
  managedSiteType: ManagedSiteType | undefined
}

const buildBasicSettingsTarget = (
  anchor: typeof SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
): UnifiedApiGuidanceNavigationTarget => ({
  menuItemId: MENU_ITEM_IDS.BASIC,
  params: {
    tab: BASIC_SETTINGS_ANCHOR_TO_TAB[anchor],
    anchor,
    highlight: anchor,
  },
})

const accountAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount,
  target: {
    menuItemId: MENU_ITEM_IDS.ACCOUNT,
    params: {
      [ACCOUNT_MANAGEMENT_ROUTE_PARAMS.Action]:
        ACCOUNT_MANAGEMENT_ROUTE_ACTIONS.Add,
    },
  },
})

const apiCredentialAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.AddApiCredential,
  target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
})

const configureManagedSiteAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite,
  target: buildBasicSettingsTarget(SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR),
})

const addGatewayChannelAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.AddGatewayChannel,
  target: { menuItemId: MENU_ITEM_IDS.KEYS },
})

const openApiCredentialProfilesAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles,
  target: { menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES },
})

const manageChannelsAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.ManageChannels,
  target: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_CHANNELS },
})

const openModelSyncAction = (): UnifiedApiGuidanceAction => ({
  kind: UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenModelSync,
  target: { menuItemId: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC },
})

/**
 * Classifies the available unified API source inventory.
 */
function resolveSourceKind(input: {
  enabledAccountCount: number
  keyAccessibleAccountCount: number
  profileCount: number
}): UnifiedApiGuidanceSourceKind {
  const hasAccounts = input.keyAccessibleAccountCount > 0
  const hasProfiles = input.profileCount > 0

  if (hasAccounts && hasProfiles) return UNIFIED_API_GUIDANCE_SOURCE_KINDS.Both
  if (hasAccounts) return UNIFIED_API_GUIDANCE_SOURCE_KINDS.Account
  if (hasProfiles) return UNIFIED_API_GUIDANCE_SOURCE_KINDS.Profile
  if (input.enabledAccountCount > 0) {
    return UNIFIED_API_GUIDANCE_SOURCE_KINDS.AccountUnavailable
  }
  return UNIFIED_API_GUIDANCE_SOURCE_KINDS.None
}

/**
 * Builds the state-aware guidance model for unified API setup and import.
 */
export function buildUnifiedApiGuidanceModel(
  input: BuildUnifiedApiGuidanceModelInput,
): UnifiedApiGuidanceModel {
  const sourceKind = resolveSourceKind(input)
  const hasSources =
    sourceKind !== UNIFIED_API_GUIDANCE_SOURCE_KINDS.None &&
    sourceKind !== UNIFIED_API_GUIDANCE_SOURCE_KINDS.AccountUnavailable
  const managedSiteConfigured = hasValidManagedSiteConfig(
    input.preferences ?? null,
    input.managedSiteType,
  )
  const modelSyncSupported =
    !!input.managedSiteType &&
    supportsManagedSiteModelSync(input.managedSiteType)

  if (!hasSources) {
    if (sourceKind === UNIFIED_API_GUIDANCE_SOURCE_KINDS.AccountUnavailable) {
      return {
        status: UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource,
        sourceKind,
        managedSiteType: input.managedSiteType,
        modelSyncSupported,
        steps: buildGuidanceSteps(
          UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource,
        ),
        primaryAction: apiCredentialAction(),
        secondaryActions: [accountAction()],
        optionalActions: [],
      }
    }

    return {
      status: UNIFIED_API_GUIDANCE_STATUSES.NeedsSources,
      sourceKind,
      managedSiteType: input.managedSiteType,
      modelSyncSupported,
      steps: buildGuidanceSteps(UNIFIED_API_GUIDANCE_STATUSES.NeedsSources),
      primaryAction: accountAction(),
      secondaryActions: [apiCredentialAction()],
      optionalActions: [],
    }
  }

  if (!managedSiteConfigured) {
    return {
      status: UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite,
      sourceKind,
      managedSiteType: input.managedSiteType,
      modelSyncSupported,
      steps: buildGuidanceSteps(UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite),
      primaryAction: configureManagedSiteAction(),
      secondaryActions:
        sourceKind === UNIFIED_API_GUIDANCE_SOURCE_KINDS.Account
          ? [apiCredentialAction()]
          : [accountAction()],
      optionalActions: [],
    }
  }

  const usesAccountPrimary =
    sourceKind === UNIFIED_API_GUIDANCE_SOURCE_KINDS.Account ||
    sourceKind === UNIFIED_API_GUIDANCE_SOURCE_KINDS.Both

  if (hasCompletedGatewayGuidanceOnboarding(input.guidanceState)) {
    return {
      status: UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels,
      sourceKind,
      managedSiteType: input.managedSiteType,
      modelSyncSupported,
      steps: buildGuidanceSteps(
        UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels,
      ),
      primaryAction: manageChannelsAction(),
      secondaryActions: [],
      optionalActions: modelSyncSupported ? [openModelSyncAction()] : [],
    }
  }

  return {
    status: UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport,
    sourceKind,
    managedSiteType: input.managedSiteType,
    modelSyncSupported,
    steps: buildGuidanceSteps(UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport),
    primaryAction: usesAccountPrimary
      ? addGatewayChannelAction()
      : openApiCredentialProfilesAction(),
    secondaryActions: [
      ...(usesAccountPrimary
        ? [openApiCredentialProfilesAction()]
        : [accountAction()]),
      manageChannelsAction(),
    ],
    optionalActions: modelSyncSupported ? [openModelSyncAction()] : [],
  }
}
