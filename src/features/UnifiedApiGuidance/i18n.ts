import type { TFunction } from "i18next"

import { GATEWAY_GUIDANCE_SURFACES } from "~/services/featureGuidance/featureGuidanceState"
import { assertNever } from "~/utils/core/assert"

import {
  UNIFIED_API_GUIDANCE_ACTION_KINDS,
  UNIFIED_API_GUIDANCE_SOURCE_KINDS,
  UNIFIED_API_GUIDANCE_STATUSES,
  UNIFIED_API_GUIDANCE_STEP_IDS,
  UNIFIED_API_GUIDANCE_STEP_STATES,
  type UnifiedApiGuidanceCtaActionKind,
  type UnifiedApiGuidanceModel,
  type UnifiedApiGuidanceSourceKind,
  type UnifiedApiGuidanceStepId,
  type UnifiedApiGuidanceStepState,
} from "./model"

export const UNIFIED_API_GUIDANCE_SURFACES = {
  OptionsOverview: "optionsOverview",
  Account: GATEWAY_GUIDANCE_SURFACES.Account,
} as const

type ValueOf<T> = T[keyof T]

export type UnifiedApiGuidanceSurface = ValueOf<
  typeof UNIFIED_API_GUIDANCE_SURFACES
>

export interface UnifiedApiGuidanceCopy {
  headline: () => string
  description: (model: UnifiedApiGuidanceModel) => string
  sourceSummary: (sourceKind: UnifiedApiGuidanceSourceKind) => string
  boundaryNote: () => string
  directToolExportNote: () => string
  modelSyncOptionalNote: () => string
  optionalLabel: () => string
  actionLabel: (actionKind: UnifiedApiGuidanceCtaActionKind) => string
}

export interface UnifiedApiGuidanceStepperCopy {
  label: () => string
  stepTitle: (stepId: UnifiedApiGuidanceStepId) => string
  stepDescription: (stepId: UnifiedApiGuidanceStepId) => string
  stateLabel: (state: UnifiedApiGuidanceStepState) => string
}

/**
 * Builds the Overview-only setup progress copy without dynamic i18n keys.
 */
export function getUnifiedApiGuidanceStepperCopy(
  t: TFunction,
): UnifiedApiGuidanceStepperCopy {
  return {
    label: () => t("optionsOverview:unifiedApiGuidance.stepper.label"),
    stepTitle: (stepId) => getStepTitle(t, stepId),
    stepDescription: (stepId) => getStepDescription(t, stepId),
    stateLabel: (state) => getStepStateLabel(t, state),
  }
}

/**
 * Resolves reusable guidance copy for the product surface rendering the card.
 */
export function getUnifiedApiGuidanceCopy(
  t: TFunction,
  surface: UnifiedApiGuidanceSurface,
): UnifiedApiGuidanceCopy {
  switch (surface) {
    case UNIFIED_API_GUIDANCE_SURFACES.Account:
      return getAccountUnifiedApiGuidanceCopy(t)
    case UNIFIED_API_GUIDANCE_SURFACES.OptionsOverview:
      return getOptionsOverviewUnifiedApiGuidanceCopy(t)
  }
}

/**
 * Builds copy helpers for the account management surface.
 */
function getAccountUnifiedApiGuidanceCopy(
  t: TFunction,
): UnifiedApiGuidanceCopy {
  return {
    headline: () => t("account:unifiedApiGuidance.headline"),
    description: (model) => getAccountDescription(t, model),
    sourceSummary: (sourceKind) => getAccountSourceSummary(t, sourceKind),
    boundaryNote: () => t("account:unifiedApiGuidance.boundaryNote"),
    directToolExportNote: () =>
      t("account:unifiedApiGuidance.directToolExportNote"),
    modelSyncOptionalNote: () =>
      t("account:unifiedApiGuidance.modelSyncOptional"),
    optionalLabel: () => t("account:unifiedApiGuidance.optionalLabel"),
    actionLabel: (actionKind) => getAccountActionLabel(t, actionKind),
  }
}

/**
 * Builds copy helpers for the options overview surface.
 */
function getOptionsOverviewUnifiedApiGuidanceCopy(
  t: TFunction,
): UnifiedApiGuidanceCopy {
  return {
    headline: () => t("optionsOverview:unifiedApiGuidance.headline"),
    description: (model) => getOptionsOverviewDescription(t, model),
    sourceSummary: (sourceKind) =>
      getOptionsOverviewSourceSummary(t, sourceKind),
    boundaryNote: () => t("optionsOverview:unifiedApiGuidance.boundaryNote"),
    directToolExportNote: () =>
      t("optionsOverview:unifiedApiGuidance.directToolExportNote"),
    modelSyncOptionalNote: () =>
      t("optionsOverview:unifiedApiGuidance.modelSyncOptional"),
    optionalLabel: () => t("optionsOverview:unifiedApiGuidance.optionalLabel"),
    actionLabel: (actionKind) => getOptionsOverviewActionLabel(t, actionKind),
  }
}

/**
 * Resolves account-surface description copy from guidance state.
 */
function getAccountDescription(t: TFunction, model: UnifiedApiGuidanceModel) {
  switch (model.status) {
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsSources:
      return t("account:unifiedApiGuidance.description.needs_sources")
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource:
      return t("account:unifiedApiGuidance.description.needs_importable_source")
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite:
      return t("account:unifiedApiGuidance.description.needs_managed_site")
    case UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport:
      return model.primaryAction.kind ===
        UNIFIED_API_GUIDANCE_ACTION_KINDS.AddGatewayChannel
        ? t("account:unifiedApiGuidance.description.ready_accounts")
        : t("account:unifiedApiGuidance.description.ready_profiles")
    case UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels:
      return t("account:unifiedApiGuidance.description.has_gateway_channels")
    default:
      return assertNever(
        model.status,
        `Unexpected guidance status: ${model.status}`,
      )
  }
}

/**
 * Resolves overview-surface description copy from guidance state.
 */
function getOptionsOverviewDescription(
  t: TFunction,
  model: UnifiedApiGuidanceModel,
) {
  switch (model.status) {
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsSources:
      return t("optionsOverview:unifiedApiGuidance.description.needs_sources")
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource:
      return t(
        "optionsOverview:unifiedApiGuidance.description.needs_importable_source",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite:
      return t(
        "optionsOverview:unifiedApiGuidance.description.needs_managed_site",
      )
    case UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport:
      return model.primaryAction.kind ===
        UNIFIED_API_GUIDANCE_ACTION_KINDS.AddGatewayChannel
        ? t("optionsOverview:unifiedApiGuidance.description.ready_accounts")
        : t("optionsOverview:unifiedApiGuidance.description.ready_profiles")
    case UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels:
      return t(
        "optionsOverview:unifiedApiGuidance.description.has_gateway_channels",
      )
    default:
      return assertNever(
        model.status,
        `Unexpected guidance status: ${model.status}`,
      )
  }
}

/**
 * Resolves the visible title for a setup step.
 */
function getStepTitle(t: TFunction, stepId: UnifiedApiGuidanceStepId): string {
  switch (stepId) {
    case UNIFIED_API_GUIDANCE_STEP_IDS.Source:
      return t("optionsOverview:unifiedApiGuidance.stepper.steps.source.title")
    case UNIFIED_API_GUIDANCE_STEP_IDS.GatewaySettings:
      return t(
        "optionsOverview:unifiedApiGuidance.stepper.steps.gatewaySettings.title",
      )
    case UNIFIED_API_GUIDANCE_STEP_IDS.GatewayChannel:
      return t(
        "optionsOverview:unifiedApiGuidance.stepper.steps.gatewayChannel.title",
      )
    case UNIFIED_API_GUIDANCE_STEP_IDS.ClientAccess:
      return t(
        "optionsOverview:unifiedApiGuidance.stepper.steps.clientAccess.title",
      )
    default:
      return assertNever(stepId, `Unexpected guidance step: ${stepId}`)
  }
}

/**
 * Resolves the supporting description for a setup step.
 */
function getStepDescription(
  t: TFunction,
  stepId: UnifiedApiGuidanceStepId,
): string {
  switch (stepId) {
    case UNIFIED_API_GUIDANCE_STEP_IDS.Source:
      return t(
        "optionsOverview:unifiedApiGuidance.stepper.steps.source.description",
      )
    case UNIFIED_API_GUIDANCE_STEP_IDS.GatewaySettings:
      return t(
        "optionsOverview:unifiedApiGuidance.stepper.steps.gatewaySettings.description",
      )
    case UNIFIED_API_GUIDANCE_STEP_IDS.GatewayChannel:
      return t(
        "optionsOverview:unifiedApiGuidance.stepper.steps.gatewayChannel.description",
      )
    case UNIFIED_API_GUIDANCE_STEP_IDS.ClientAccess:
      return t(
        "optionsOverview:unifiedApiGuidance.stepper.steps.clientAccess.description",
      )
    default:
      return assertNever(stepId, `Unexpected guidance step: ${stepId}`)
  }
}

/**
 * Resolves the non-color state label for a setup step.
 */
function getStepStateLabel(
  t: TFunction,
  state: UnifiedApiGuidanceStepState,
): string {
  switch (state) {
    case UNIFIED_API_GUIDANCE_STEP_STATES.Completed:
      return t("optionsOverview:unifiedApiGuidance.stepper.states.completed")
    case UNIFIED_API_GUIDANCE_STEP_STATES.Current:
      return t("optionsOverview:unifiedApiGuidance.stepper.states.current")
    case UNIFIED_API_GUIDANCE_STEP_STATES.Upcoming:
      return t("optionsOverview:unifiedApiGuidance.stepper.states.upcoming")
    default:
      return assertNever(state, `Unexpected guidance step state: ${state}`)
  }
}

/**
 * Resolves account-surface source inventory labels.
 */
function getAccountSourceSummary(
  t: TFunction,
  sourceKind: UnifiedApiGuidanceSourceKind,
) {
  switch (sourceKind) {
    case UNIFIED_API_GUIDANCE_SOURCE_KINDS.AccountUnavailable:
      return t("account:unifiedApiGuidance.sources.accountUnavailable")
    case UNIFIED_API_GUIDANCE_SOURCE_KINDS.Account:
      return t("account:unifiedApiGuidance.sources.account")
    case UNIFIED_API_GUIDANCE_SOURCE_KINDS.Both:
      return t("account:unifiedApiGuidance.sources.both")
    case UNIFIED_API_GUIDANCE_SOURCE_KINDS.Profile:
      return t("account:unifiedApiGuidance.sources.profile")
    case UNIFIED_API_GUIDANCE_SOURCE_KINDS.None:
      return t("account:unifiedApiGuidance.sources.none")
    default:
      return assertNever(
        sourceKind,
        `Unexpected guidance source kind: ${sourceKind}`,
      )
  }
}

/**
 * Resolves overview-surface source inventory labels.
 */
function getOptionsOverviewSourceSummary(
  t: TFunction,
  sourceKind: UnifiedApiGuidanceSourceKind,
) {
  switch (sourceKind) {
    case UNIFIED_API_GUIDANCE_SOURCE_KINDS.AccountUnavailable:
      return t("optionsOverview:unifiedApiGuidance.sources.accountUnavailable")
    case UNIFIED_API_GUIDANCE_SOURCE_KINDS.Account:
      return t("optionsOverview:unifiedApiGuidance.sources.account")
    case UNIFIED_API_GUIDANCE_SOURCE_KINDS.Both:
      return t("optionsOverview:unifiedApiGuidance.sources.both")
    case UNIFIED_API_GUIDANCE_SOURCE_KINDS.Profile:
      return t("optionsOverview:unifiedApiGuidance.sources.profile")
    case UNIFIED_API_GUIDANCE_SOURCE_KINDS.None:
      return t("optionsOverview:unifiedApiGuidance.sources.none")
    default:
      return assertNever(
        sourceKind,
        `Unexpected guidance source kind: ${sourceKind}`,
      )
  }
}

/**
 * Resolves account-surface CTA labels from guidance action kinds.
 */
function getAccountActionLabel(
  t: TFunction,
  actionKind: UnifiedApiGuidanceCtaActionKind,
): string {
  switch (actionKind) {
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount:
      return t("account:unifiedApiGuidance.actions.addAccount")
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.AddApiCredential:
      return t("account:unifiedApiGuidance.actions.addApiCredential")
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite:
      return t("account:unifiedApiGuidance.actions.configureManagedSite")
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.AddGatewayChannel:
      return t("account:unifiedApiGuidance.actions.addGatewayChannel")
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.ManageChannels:
      return t("account:unifiedApiGuidance.actions.manageChannels")
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles:
      return t("account:unifiedApiGuidance.actions.openApiCredentialProfiles")
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenModelSync:
      return t("account:unifiedApiGuidance.actions.openModelSync")
    default:
      return assertNever(
        actionKind,
        `Unexpected guidance action: ${actionKind}`,
      )
  }
}

/**
 * Resolves overview-surface CTA labels from guidance action kinds.
 */
function getOptionsOverviewActionLabel(
  t: TFunction,
  actionKind: UnifiedApiGuidanceCtaActionKind,
): string {
  switch (actionKind) {
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount:
      return t("optionsOverview:unifiedApiGuidance.actions.addAccount")
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.AddApiCredential:
      return t("optionsOverview:unifiedApiGuidance.actions.addApiCredential")
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite:
      return t(
        "optionsOverview:unifiedApiGuidance.actions.configureManagedSite",
      )
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.AddGatewayChannel:
      return t("optionsOverview:unifiedApiGuidance.actions.addGatewayChannel")
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.ManageChannels:
      return t("optionsOverview:unifiedApiGuidance.actions.manageChannels")
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles:
      return t(
        "optionsOverview:unifiedApiGuidance.actions.openApiCredentialProfiles",
      )
    case UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenModelSync:
      return t("optionsOverview:unifiedApiGuidance.actions.openModelSync")
    default:
      return assertNever(
        actionKind,
        `Unexpected guidance action: ${actionKind}`,
      )
  }
}
