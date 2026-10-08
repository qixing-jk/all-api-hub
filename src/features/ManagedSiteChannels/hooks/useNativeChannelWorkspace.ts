import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useManagedResourceListController } from "~/features/ManagedSiteChannels/controllers/useManagedResourceListController"
import type { ManagedSiteChannelsRouteProps } from "~/features/ManagedSiteChannels/managedSiteChannelsRouteContracts"
import { createManagedResourceDisplayFieldIds } from "~/features/ManagedSiteChannels/presentation/managedResourceDetailPresentation"
import {
  getDefaultManagedResourceSorting,
  getManagedResourcePresentationSemantics,
} from "~/features/ManagedSiteChannels/presentation/managedResourceTablePolicy"
import { recordGatewayGuidanceCompletion } from "~/features/UnifiedApiGuidance/recordGatewayGuidanceCompletion"
import type { ManagedResourceProductPolicy } from "~/services/accountSiteDefinitions/contracts"
import { type ManagedResourceRegistration } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteRuntimeConfigValue } from "~/services/managedSites/configRegistration"
import {
  getManagedResourceRefKey,
  isManagedResourceRefForSite,
  parseManagedResourceRef,
} from "~/services/managedSites/managedResourceIdentity"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import { resolveProductAnalyticsManagedSiteType } from "~/services/productAnalytics/managedSite"

type NativeChannelWorkspaceOptions = ManagedSiteChannelsRouteProps & {
  config: ManagedSiteRuntimeConfigValue | null
  policy: ManagedResourceProductPolicy
  registration: ManagedResourceRegistration
}
/** Owns routed collection identity, search, table state, and selection resets. */
export function useNativeChannelWorkspace({
  siteType,
  refreshKey,
  routeParams = {},
  onReplaceRouteQuery,
  policy,
  registration,
  config,
}: NativeChannelWorkspaceOptions) {
  const latestRouteParams = useRef(routeParams)

  useEffect(() => {
    latestRouteParams.current = routeParams
  }, [routeParams])

  const onUnsupportedSearch = useCallback(() => {
    onReplaceRouteQuery({
      ...latestRouteParams.current,
      search: undefined,
    })
  }, [onReplaceRouteQuery])

  const routedResourceRef = parseManagedResourceRef(routeParams.resourceRef)

  const routeResourceMatches =
    !routeParams.resourceRef ||
    Boolean(
      routedResourceRef &&
        config &&
        isManagedResourceRefForSite(routedResourceRef, { siteType, config }),
    )

  const routedResourceKey = routedResourceRef
    ? getManagedResourceRefKey(routedResourceRef)
    : null

  const channelIdFilterValue = routeParams.resourceRef
    ? routedResourceRef?.resourceId ?? "—"
    : routeParams.channelId?.trim() ?? ""

  const routeIdentityKey = routeParams.resourceRef ?? channelIdFilterValue

  const routeSearch = channelIdFilterValue ? "" : routeParams.search ?? ""

  const [searchValue, setSearchValue] = useState(routeSearch)

  const [sorting, setSorting] = useState(() =>
    getDefaultManagedResourceSorting(siteType),
  )

  const [columnVisibility, setColumnVisibility] = useState<
    Record<string, boolean>
  >({})

  const [pageSize, setPageSize] = useState(10)

  const analytics = useMemo(() => {
    const managedSiteType = resolveProductAnalyticsManagedSiteType(siteType)
    return managedSiteType
      ? { managedSiteType, startAction: startProductAnalyticsAction }
      : undefined
  }, [siteType])

  useEffect(
    () => setSearchValue(routeSearch),
    [routeSearch, channelIdFilterValue],
  )

  useEffect(
    () => setSorting(getDefaultManagedResourceSorting(siteType)),
    [siteType],
  )

  const presentationSemantics =
    getManagedResourcePresentationSemantics(siteType)

  const displayFieldIds = useMemo(
    () => createManagedResourceDisplayFieldIds(policy),
    [policy],
  )

  const list = useManagedResourceListController({
    registration,
    scopeKey: config?.baseUrl ?? `${siteType}:configuration-missing`,
    search: searchValue,
    refreshKey,
    pageSize,
    onUnsupportedSearch,
    onResourcesAccepted: (itemCount) => {
      if (itemCount > 0) recordGatewayGuidanceCompletion()
    },
    fieldIds: displayFieldIds,
    semantics: presentationSemantics,
    analytics,
  })

  const previousRouteIdentity = useRef(routeIdentityKey)

  const { setPageIndex, setSelectedRowKeys, setStatusFilter } = list

  useEffect(() => {
    if (previousRouteIdentity.current === routeIdentityKey) return
    previousRouteIdentity.current = routeIdentityKey
    setPageIndex(0)
    setSelectedRowKeys({})
    setStatusFilter([])
  }, [routeIdentityKey, setPageIndex, setSelectedRowKeys, setStatusFilter])
  return {
    list,
    analytics,
    searchValue,
    setSearchValue,
    sorting,
    setSorting,
    columnVisibility,
    setColumnVisibility,
    pageSize,
    setPageSize,
    presentationSemantics,
    channelIdFilterValue,
    routeResourceMatches,
    routedResourceKey,
  }
}
