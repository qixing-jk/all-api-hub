import { ChevronLeft, ChevronRight } from "lucide-react"
import { useLayoutEffect, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { getModelVendorPresentation } from "~/features/ModelList/modelVendorPresentation"
import { useHorizontalScrollControls } from "~/hooks/useHorizontalScrollControls"
import type { ModelVendorCatalogEntry } from "~/services/models/modelMetadata/types"
import {
  MODEL_VENDOR_FILTER_VALUES,
  type ModelVendorFilterValue,
} from "~/services/models/modelVendor"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
} from "~/services/productAnalytics/contracts"

type CountedModelVendorCatalogEntry = ModelVendorCatalogEntry & {
  count: number
}

interface ProviderTabsProps {
  vendorCatalog: CountedModelVendorCatalogEntry[]
  effectiveSelectedVendor: ModelVendorFilterValue
  setSelectedProvider: (provider: ModelVendorFilterValue) => void
  allVendorsFilteredCount: number
  unclassifiedVendorCount: number
  children: ReactNode
}

interface ProviderTabListProps {
  vendorCatalog: CountedModelVendorCatalogEntry[]
  selectedIndex: number
  allVendorsFilteredCount: number
  unclassifiedVendorCount: number
}

const providerTabClassName = `shrink-0 rounded-lg px-4 py-2.5 text-sm leading-5 font-medium transition-all ${ANIMATIONS.transition.base} data-[state=active]:dark:bg-dark-bg-secondary data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow data-[state=active]:dark:text-blue-400 dark:text-dark-text-secondary dark:hover:bg-dark-bg-secondary/60 dark:hover:text-dark-text-primary text-gray-700 hover:bg-white/60 hover:text-gray-900`

/**
 * Renders the provider tab list.
 */
function ProviderTabList({
  vendorCatalog,
  selectedIndex,
  allVendorsFilteredCount,
  unclassifiedVendorCount,
}: ProviderTabListProps) {
  const { t } = useTranslation("modelList")
  const {
    scrollRef: tabListRef,
    canScrollLeft,
    canScrollRight,
    updateScrollState,
    scrollLeft,
    scrollRight,
    scrollChildIntoCenter,
  } = useHorizontalScrollControls<HTMLDivElement>({
    enableWheelScroll: true,
  })
  const allVendorsPresentation = getModelVendorPresentation({
    state: "unknown",
  })

  useLayoutEffect(() => {
    updateScrollState()
    const rafId = window.requestAnimationFrame(() => {
      scrollChildIntoCenter(selectedIndex)
      updateScrollState()
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [selectedIndex, vendorCatalog, scrollChildIntoCenter, updateScrollState])

  return (
    <div className="mb-6 flex items-center gap-2">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={t("providerTabs.scrollLeft")}
        disabled={!canScrollLeft}
        onClick={scrollLeft}
        className="shrink-0"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <TabsList
        ref={tabListRef}
        className={`flex min-w-0 flex-1 space-x-1 rounded-xl ${COLORS.background.tertiary} scrollbar-hide touch-pan-x overflow-x-auto p-1`}
      >
        <TabsTrigger
          value={MODEL_VENDOR_FILTER_VALUES.All}
          className={providerTabClassName}
        >
          <div className="flex items-center justify-center space-x-2">
            <allVendorsPresentation.Icon
              aria-hidden={true}
              className={`h-4 w-4 ${allVendorsPresentation.iconClassName}`}
            />
            <span>
              {t("allProviders")} ({allVendorsFilteredCount})
            </span>
          </div>
        </TabsTrigger>
        {vendorCatalog.map((vendor) => {
          const presentation = getModelVendorPresentation(vendor)

          return (
            <TabsTrigger
              key={vendor.key}
              value={vendor.key}
              className={providerTabClassName}
            >
              <div className="flex items-center justify-center space-x-2">
                <presentation.Icon
                  aria-hidden={true}
                  className={`h-4 w-4 ${presentation.iconClassName}`}
                />
                <span>
                  {vendor.label} ({vendor.count})
                </span>
              </div>
            </TabsTrigger>
          )
        })}
        {unclassifiedVendorCount > 0 && (
          <TabsTrigger
            value={MODEL_VENDOR_FILTER_VALUES.Unclassified}
            className={providerTabClassName}
            title={t("providerTabs.unclassifiedDescription")}
          >
            <div className="flex items-center justify-center space-x-2">
              <allVendorsPresentation.Icon
                aria-hidden={true}
                className={`h-4 w-4 ${allVendorsPresentation.iconClassName}`}
              />
              <span>
                {t("providerTabs.unclassified")} ({unclassifiedVendorCount})
              </span>
            </div>
          </TabsTrigger>
        )}
      </TabsList>

      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={t("providerTabs.scrollRight")}
        disabled={!canScrollRight}
        onClick={scrollRight}
        className="shrink-0"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

/**
 * Provider filter tabs with horizontal scroll and counts.
 * @param props Component props container.
 * @param props.vendorCatalog Dynamic vendor entries available after base filters.
 * @param props.effectiveSelectedVendor Already-clamped vendor selection.
 * @param props.setSelectedProvider Setter to change provider filter.
 * @param props.allVendorsFilteredCount Count of models after non-vendor filters.
 * @param props.unclassifiedVendorCount Count of rows whose vendor is unresolved.
 * @param props.children Tab panels content to render.
 * @returns Radix tab group with provider tabs.
 */
export function ProviderTabs({
  vendorCatalog,
  effectiveSelectedVendor,
  setSelectedProvider,
  allVendorsFilteredCount,
  unclassifiedVendorCount,
  children,
}: ProviderTabsProps) {
  const selectedIndex =
    effectiveSelectedVendor === MODEL_VENDOR_FILTER_VALUES.All
      ? 0
      : effectiveSelectedVendor === MODEL_VENDOR_FILTER_VALUES.Unclassified
        ? vendorCatalog.length + 1
        : Math.max(
            0,
            vendorCatalog.findIndex(
              (vendor) => vendor.key === effectiveSelectedVendor,
            ) + 1,
          )

  return (
    <Tabs
      value={effectiveSelectedVendor}
      onValueChange={(value) => {
        const newProvider = value as ModelVendorFilterValue
        setSelectedProvider(newProvider)
        void trackProductAnalyticsActionCompleted({
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterModelList,
          surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
          result: PRODUCT_ANALYTICS_RESULTS.Success,
          insights: {
            targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
            mode: PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter,
            filterCount: newProvider === MODEL_VENDOR_FILTER_VALUES.All ? 0 : 1,
            resultCount:
              newProvider === MODEL_VENDOR_FILTER_VALUES.All
                ? allVendorsFilteredCount
                : newProvider === MODEL_VENDOR_FILTER_VALUES.Unclassified
                  ? unclassifiedVendorCount
                  : vendorCatalog.find((vendor) => vendor.key === newProvider)
                      ?.count ?? 0,
          },
        })
      }}
    >
      <ProviderTabList
        vendorCatalog={vendorCatalog}
        selectedIndex={selectedIndex}
        allVendorsFilteredCount={allVendorsFilteredCount}
        unclassifiedVendorCount={unclassifiedVendorCount}
      />
      {children}
    </Tabs>
  )
}
