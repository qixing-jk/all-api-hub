import { Ellipsis } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsActionId,
} from "~/services/productAnalytics/events"

import type { ChannelRow, RowActionsLabels } from "../types"

interface RowActionsProps {
  channel: ChannelRow
  onEdit: (channel: ChannelRow) => void
  onView: (channel: ChannelRow) => void
  onMigrate: (channel: ChannelRow) => void
  onDelete: (ids: number[]) => void
  onSync: (channelIds: number[]) => void
  onOpenSync: (channelId: number) => Promise<void>
  onFilters: (channel: ChannelRow) => void
  canMigrate: boolean
  showMigrationAction: boolean
  showNewApiOnlyActions?: boolean
  isSyncing: boolean
  labels: RowActionsLabels
}

const trackManagedSiteChannelRowAction = (
  actionId: ProductAnalyticsActionId,
) => {
  void trackProductAnalyticsActionStarted({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
    actionId,
    surfaceId:
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
  })
}

/**
 * Dropdown actions available for each channel row.
 * - Migration mode renders view + migrate.
 * - Standard mode renders edit + delete, with filters/sync controls gated by
 *   `showNewApiOnlyActions`.
 */
export default function RowActions({
  channel,
  onEdit,
  onView,
  onMigrate,
  onDelete,
  onSync,
  onOpenSync,
  onFilters,
  canMigrate,
  showMigrationAction,
  showNewApiOnlyActions = true,
  isSyncing,
  labels,
}: RowActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label={labels.trigger}
        >
          <Ellipsis className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {showMigrationAction ? (
          <>
            <DropdownMenuItem
              onClick={() => {
                onView(channel)
                trackManagedSiteChannelRowAction(
                  PRODUCT_ANALYTICS_ACTION_IDS.ViewManagedSiteChannel,
                )
              }}
            >
              {labels.view}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onMigrate(channel)
                trackManagedSiteChannelRowAction(
                  PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelMigration,
                )
              }}
              disabled={!canMigrate}
            >
              {labels.migrate}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem
              onClick={() => {
                onEdit(channel)
                trackManagedSiteChannelRowAction(
                  PRODUCT_ANALYTICS_ACTION_IDS.UpdateManagedSiteChannel,
                )
              }}
            >
              {labels.edit}
            </DropdownMenuItem>
            {showNewApiOnlyActions ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    onFilters(channel)
                    trackManagedSiteChannelRowAction(
                      PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelFilters,
                    )
                  }}
                >
                  {labels.filters}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void onOpenSync(channel.id)
                    trackManagedSiteChannelRowAction(
                      PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelModelSync,
                    )
                  }}
                >
                  {labels.openSync}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    onSync([channel.id])
                  }}
                  disabled={isSyncing}
                >
                  {isSyncing ? labels.syncing : labels.sync}
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                onDelete([channel.id])
              }}
            >
              {labels.delete}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
