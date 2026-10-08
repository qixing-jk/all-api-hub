import type { TFunction } from "i18next"
import { useMemo, useState } from "react"

import type { ManagedSiteType } from "~/constants/siteType"
import { type useManagedResourceListController } from "~/features/ManagedSiteChannels/controllers/useManagedResourceListController"
import { useManagedResourceMigrationController } from "~/features/ManagedSiteChannels/controllers/useManagedResourceMigrationController"
import type {
  ManagedChannelsCallbacks,
  ManagedSiteMigrationLabels,
} from "~/features/ManagedSiteChannels/presentation/contracts"
import { trackNativeChannelActionStarted } from "~/features/ManagedSiteChannels/presentation/nativeChannelActionAnalytics"
import { resolveManagedSiteMigrationCapability } from "~/services/managedSites/channelMigrationCapabilityRegistry"
import { getManagedSiteTargetOptions } from "~/services/managedSites/channelMigrationTargets"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

const createMigrationLabels = (
  t: TFunction,
  selectedCount: number,
  preview: ReturnType<typeof useManagedResourceMigrationController>["preview"],
): ManagedSiteMigrationLabels => ({
  title: t("managedSiteChannels:migration.title"),
  beta: t("managedSiteChannels:migration.betaBadge"),
  description: t("managedSiteChannels:migration.description", {
    selectedCount,
  }),
  targetLabel: t("managedSiteChannels:migration.target.label"),
  targetPlaceholder: t("managedSiteChannels:migration.target.placeholder"),
  sourceLabel: t("managedSiteChannels:migration.target.sourceLabel"),
  destinationLabel: t("managedSiteChannels:migration.target.destinationLabel"),
  unselectedTarget: t("managedSiteChannels:migration.target.unselected"),
  refreshPreview: t("managedSiteChannels:migration.actions.refreshPreview"),
  loadingPreview: t("managedSiteChannels:migration.preview.loading"),
  generalWarningsTitle: t(
    "managedSiteChannels:migration.generalWarnings.title",
  ),
  generalWarningsSummary: t(
    "managedSiteChannels:migration.generalWarnings.compactSummary",
  ),
  limitsLabel: t("managedSiteChannels:migration.preview.badges.limitsLabel"),
  warningsLabel: t(
    "managedSiteChannels:migration.preview.badges.warningsLabel",
  ),
  ready: t("managedSiteChannels:migration.preview.status.ready"),
  blocked: t("managedSiteChannels:migration.preview.status.blocked"),
  fieldLabel: t("managedSiteChannels:migration.preview.compare.fieldLabel"),
  resultsTitle: t("managedSiteChannels:migration.results.title"),
  close: t("managedSiteChannels:migration.actions.close"),
  cancel: t("managedSiteChannels:migration.actions.cancel"),
  start: t("managedSiteChannels:migration.actions.start"),
  running: t("managedSiteChannels:migration.actions.running"),
  footerSummary: t("managedSiteChannels:migration.preview.summary", {
    ready: preview?.readyCount ?? 0,
    blocked: preview?.blockedCount ?? 0,
    total: preview?.totalCount ?? selectedCount,
  }),
  confirmationTitle: t("managedSiteChannels:migration.confirm.title"),
  confirmationDescription: t(
    "managedSiteChannels:migration.confirm.description",
    {
      ready: preview?.readyCount ?? 0,
      total: preview?.totalCount ?? selectedCount,
    },
  ),
  confirmationWarningTitle: t(
    "managedSiteChannels:migration.confirm.warningTitle",
  ),
  confirmationConfirm: t("managedSiteChannels:migration.confirm.confirm"),
  missingValue: t("common:labels.notAvailable"),
  refreshRequired: t("managedSiteChannels:migration.results.refreshRequired"),
  refreshRequiredAction: t(
    "managedSiteChannels:migration.actions.refreshChannels",
  ),
})
type NativeChannelMigrationOptions = {
  siteType: ManagedSiteType
  config: { baseUrl: string } | null
  preferences: Parameters<typeof getManagedSiteTargetOptions>[0]
  list: ReturnType<typeof useManagedResourceListController>
  executeMigration: Parameters<
    typeof useManagedResourceMigrationController
  >[0]["executeMigration"]
  analytics: Parameters<
    typeof useManagedResourceMigrationController
  >[0]["analytics"]
  t: TFunction
}
/** Owns migration selection, preview composition, and entrypoint commands. */
export function useNativeChannelMigration({
  siteType,
  config,
  preferences,
  list,
  executeMigration,
  analytics,
  t,
}: NativeChannelMigrationOptions) {
  const [migrationMode, setMigrationMode] = useState(false)

  const [migrationRowKeys, setMigrationRowKeys] = useState<string[]>([])

  const [isMigrationOpen, setIsMigrationOpen] = useState(false)

  const targets = useMemo(
    () =>
      getManagedSiteTargetOptions(preferences, {
        excludeSiteTypes: [siteType],
      }).map((target) => ({
        value: target.siteType,
        label: getManagedSiteLabel(t, target.siteType),
      })),
    [preferences, siteType, t],
  )

  const migration = useManagedResourceMigrationController({
    isOpen: isMigrationOpen,
    sourceSiteType: siteType,
    scopeIdentity: config?.baseUrl ?? `${siteType}:configuration-missing`,
    selectedRowKeys: migrationRowKeys,
    targets,
    resolveRef: list.resolveRef,
    resolveDisplayName: (rowKey) =>
      list.allRows.find((row) => row.rowKey === rowKey)?.name,
    refresh: list.refreshSilently,
    onClose: () => setIsMigrationOpen(false),
    t,
    getSiteLabel: (targetSiteType) => getManagedSiteLabel(t, targetSiteType),
    analytics,
    executeMigration,
  })

  const canMigrate =
    resolveManagedSiteMigrationCapability(siteType)?.source !== undefined &&
    targets.length > 0

  const migrationLabels = createMigrationLabels(
    t,
    migrationRowKeys.length,
    migration.preview,
  )
  const commands: Pick<
    ManagedChannelsCallbacks,
    | "onToggleMigrationMode"
    | "onMigrateSelected"
    | "onMigrateFiltered"
    | "onMigrate"
  > = {
    onToggleMigrationMode: () => {
      trackNativeChannelActionStarted(
        PRODUCT_ANALYTICS_ACTION_IDS.ToggleManagedSiteChannelMigrationMode,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      )
      setMigrationMode((current) => !current)
    },
    onMigrateSelected: (rowKeys) => {
      trackNativeChannelActionStarted(
        PRODUCT_ANALYTICS_ACTION_IDS.OpenSelectedManagedSiteChannelMigration,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      )
      setMigrationRowKeys(rowKeys)
      setIsMigrationOpen(true)
    },
    onMigrateFiltered: (rowKeys) => {
      trackNativeChannelActionStarted(
        PRODUCT_ANALYTICS_ACTION_IDS.OpenFilteredManagedSiteChannelMigration,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      )
      setMigrationRowKeys(rowKeys)
      setIsMigrationOpen(true)
    },
    onMigrate: (rowKey) => {
      trackNativeChannelActionStarted(
        PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelMigration,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      )
      setMigrationRowKeys([rowKey])
      setIsMigrationOpen(true)
    },
  }
  return {
    migrationMode,
    migration,
    isMigrationOpen,
    migrationLabels,
    canMigrate,
    commands,
    targets,
  }
}
