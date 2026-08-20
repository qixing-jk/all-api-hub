import type { TFunction } from "i18next"

import type { ManagedChannelsLabels } from "./contracts"

type ManagedSiteChannelsLabelOverrides = Pick<
  ManagedChannelsLabels,
  "rowActions" | "statusLabels"
>

/** Builds copy shared by legacy and native managed-channel presentations. */
export const createManagedSiteChannelsLabels = (
  t: TFunction,
  overrides: ManagedSiteChannelsLabelOverrides,
): ManagedChannelsLabels => ({
  searchPlaceholder: t("managedSiteChannels:toolbar.searchPlaceholder"),
  clearSearch: t("managedSiteChannels:toolbar.clearSearch"),
  refresh: t("managedSiteChannels:toolbar.refresh"),
  cancelRefresh: t("managedSiteChannels:toolbar.cancelRefresh"),
  status: t("managedSiteChannels:toolbar.status"),
  statusLabel: t("managedSiteChannels:filter.statusLabel"),
  columns: t("managedSiteChannels:toolbar.columns"),
  toggleColumns: t("managedSiteChannels:toolbar.toggleColumns"),
  migrateSelected: t("managedSiteChannels:toolbar.migrateSelected"),
  migrateFiltered: t("managedSiteChannels:toolbar.migrateFiltered"),
  deleteSelected: t("managedSiteChannels:toolbar.deleteSelected"),
  syncSelected: t("managedSiteChannels:toolbar.syncSelected"),
  addChannel: t("managedSiteChannels:toolbar.addChannel"),
  loading: t("managedSiteChannels:table.loading"),
  emptyFiltered: t("managedSiteChannels:table.emptyFiltered"),
  emptyNoChannels: t("managedSiteChannels:table.emptyNoChannels"),
  rowsPerPage: t("managedSiteChannels:table.rowsPerPage"),
  paginationSummary: (start, end, currentTotal) =>
    t("managedSiteChannels:table.paginationSummary", {
      start,
      end,
      total: currentTotal,
    }),
  noEntries: t("managedSiteChannels:table.noEntries"),
  paginationPrev: t("managedSiteChannels:table.paginationPrev"),
  paginationNext: t("managedSiteChannels:table.paginationNext"),
  selectAll: t("managedSiteChannels:table.selectAll"),
  selectRow: t("managedSiteChannels:table.selectRow"),
  statusLabels: overrides.statusLabels,
  settings: t("common:labels.settings"),
  configurationRequired: t("common:status.configurationRequired"),
  goToSettings: t("common:actions.goToSettings"),
  deleteTitle: t("managedSiteChannels:dialog.deleteTitle"),
  deleteTitlePlural: t("managedSiteChannels:dialog.deleteTitlePlural"),
  deleteDescription: t("managedSiteChannels:dialog.deleteDescription"),
  deleteCancel: t("managedSiteChannels:dialog.cancel"),
  deleteConfirm: t("managedSiteChannels:dialog.confirm"),
  deleting: t("common:status.deleting"),
  deleteResultsTitle: t("managedSiteChannels:dialog.deleteResultsTitle"),
  deleteRefreshRequired: t("managedSiteChannels:dialog.deleteRefreshRequired"),
  deleteRefreshAction: t("managedSiteChannels:dialog.deleteRefreshAction"),
  deleteResultStatusLabels: {
    success: t("managedSiteChannels:dialog.deleteResultStatus.success"),
    failed: t("managedSiteChannels:dialog.deleteResultStatus.failed"),
    uncertain: t("managedSiteChannels:dialog.deleteResultStatus.uncertain"),
  },
  migrationBeta: t("managedSiteChannels:migration.betaBadge"),
  enterMigrationMode: t("managedSiteChannels:toolbar.enterMigrationMode"),
  exitMigrationMode: t("managedSiteChannels:toolbar.exitMigrationMode"),
  rowActions: overrides.rowActions,
})
