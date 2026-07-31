import { describe, expect, it } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  buildUnifiedApiGuidanceModel,
  UNIFIED_API_GUIDANCE_ACTION_KINDS,
  UNIFIED_API_GUIDANCE_SOURCE_KINDS,
  UNIFIED_API_GUIDANCE_STATUSES,
} from "~/features/UnifiedApiGuidance"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"

const basePreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  lastUpdated: 1,
}

const configuredNewApiPreferences: UserPreferences = {
  ...basePreferences,
  newApi: {
    ...basePreferences.newApi,
    baseUrl: "https://managed.example.invalid",
    adminToken: "redacted-admin-token",
    userId: "1",
  },
}

const completedGatewayGuidancePreferences: UserPreferences = {
  ...configuredNewApiPreferences,
  gatewayGuidance: {
    onboardingCompletedAt: 1,
  },
}

describe("buildUnifiedApiGuidanceModel", () => {
  it("routes users with no sources to account and credential setup", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 0,
      keyAccessibleAccountCount: 0,
      profileCount: 0,
      preferences: basePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.status).toBe(UNIFIED_API_GUIDANCE_STATUSES.NeedsSources)
    expect(model.sourceKind).toBe(UNIFIED_API_GUIDANCE_SOURCE_KINDS.None)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount,
    )
    expect(model.primaryAction.target).toEqual({
      menuItemId: MENU_ITEM_IDS.ACCOUNT,
    })
    expect(model.secondaryActions.map((action) => action.kind)).toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.AddApiCredential,
    )
  })

  it("routes existing sources without managed-site config to the managed-site selector", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 2,
      keyAccessibleAccountCount: 2,
      profileCount: 1,
      preferences: basePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.status).toBe(UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite)
    expect(model.sourceKind).toBe(UNIFIED_API_GUIDANCE_SOURCE_KINDS.Both)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.ConfigureManagedSite,
    )
    expect(model.primaryAction.target).toEqual({
      menuItemId: MENU_ITEM_IDS.BASIC,
      params: {
        tab: "managedSite",
        anchor: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
        highlight: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
      },
    })
  })

  it("prefers gateway-channel creation when accounts and a managed site are ready", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 1,
      profileCount: 1,
      preferences: configuredNewApiPreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.status).toBe(UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.AddGatewayChannel,
    )
    expect(model.primaryAction.target).toEqual({
      menuItemId: MENU_ITEM_IDS.KEYS,
    })
    expect(model.secondaryActions.map((action) => action.kind)).toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles,
    )
    expect(model.optionalActions.map((action) => action.kind)).toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenModelSync,
    )
    expect(model.steps).toEqual([
      { id: "source", state: "completed" },
      { id: "gateway_settings", state: "completed" },
      { id: "gateway_channel", state: "current" },
      { id: "client_access", state: "upcoming" },
    ])
  })

  it("routes users who previously created a gateway channel to channel management", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 1,
      profileCount: 0,
      preferences: completedGatewayGuidancePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.status).toBe(UNIFIED_API_GUIDANCE_STATUSES.HasGatewayChannels)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.ManageChannels,
    )
    expect(model.secondaryActions).toEqual([])
    expect(model.steps).toEqual([
      { id: "source", state: "completed" },
      { id: "gateway_settings", state: "completed" },
      { id: "gateway_channel", state: "completed" },
      { id: "client_access", state: "current" },
    ])
  })

  it("keeps current prerequisites authoritative over historical channel completion", () => {
    const missingSourceModel = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 0,
      keyAccessibleAccountCount: 0,
      profileCount: 0,
      preferences: completedGatewayGuidancePreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })
    const missingGatewayModel = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 1,
      profileCount: 0,
      preferences: {
        ...basePreferences,
        gatewayGuidance: { onboardingCompletedAt: 1 },
      },
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(missingSourceModel.status).toBe(
      UNIFIED_API_GUIDANCE_STATUSES.NeedsSources,
    )
    expect(missingGatewayModel.status).toBe(
      UNIFIED_API_GUIDANCE_STATUSES.NeedsManagedSite,
    )
  })

  it("routes profile-only sources to the API credential library", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 0,
      keyAccessibleAccountCount: 0,
      profileCount: 3,
      preferences: configuredNewApiPreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.sourceKind).toBe(UNIFIED_API_GUIDANCE_SOURCE_KINDS.Profile)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles,
    )
    expect(model.primaryAction.target).toEqual({
      menuItemId: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
    })
    expect(model.secondaryActions.map((action) => action.kind)).toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount,
    )
  })

  it("does not treat accounts without accessible keys as importable sources", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 0,
      profileCount: 0,
      preferences: configuredNewApiPreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.status).toBe(
      UNIFIED_API_GUIDANCE_STATUSES.NeedsImportableSource,
    )
    expect(model.sourceKind).toBe(
      UNIFIED_API_GUIDANCE_SOURCE_KINDS.AccountUnavailable,
    )
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.AddApiCredential,
    )
    expect(model.secondaryActions.map((action) => action.kind)).toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.AddAccount,
    )
  })

  it("uses profile sources when saved accounts cannot expose keys", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 0,
      profileCount: 1,
      preferences: configuredNewApiPreferences,
      managedSiteType: SITE_TYPES.NEW_API,
    })

    expect(model.status).toBe(UNIFIED_API_GUIDANCE_STATUSES.ReadyToImport)
    expect(model.sourceKind).toBe(UNIFIED_API_GUIDANCE_SOURCE_KINDS.Profile)
    expect(model.primaryAction.kind).toBe(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenApiCredentialProfiles,
    )
  })

  it("omits model sync when the managed site does not support it", () => {
    const model = buildUnifiedApiGuidanceModel({
      enabledAccountCount: 1,
      keyAccessibleAccountCount: 1,
      profileCount: 0,
      preferences: {
        ...basePreferences,
        axonHub: {
          baseUrl: "https://axon.example.invalid",
          email: "admin@example.invalid",
          password: "redacted-password",
        },
      },
      managedSiteType: SITE_TYPES.AXON_HUB,
    })

    expect(model.optionalActions.map((action) => action.kind)).not.toContain(
      UNIFIED_API_GUIDANCE_ACTION_KINDS.OpenModelSync,
    )
  })
})
