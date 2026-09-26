import { motion, useReducedMotion } from "framer-motion"
import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react"
import { useId, useLayoutEffect, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { COLORS, CORNERS } from "~/constants/designTokens"
import type { CountedModelVendorCatalogEntry } from "~/features/ModelList/modelFiltering"
import { useHorizontalScrollControls } from "~/hooks/useHorizontalScrollControls"
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

import { ModelVendorMark } from "./ModelVendorMark"

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
  selectedVendor: ModelVendorFilterValue
  allVendorsFilteredCount: number
  unclassifiedVendorCount: number
}

/** Resolves the privacy-safe result count recorded for a provider filter. */
export function getProviderFilterAnalyticsResultCount(
  selectedVendor: ModelVendorFilterValue,
  vendorCatalog: CountedModelVendorCatalogEntry[],
  allVendorsFilteredCount: number,
  unclassifiedVendorCount: number,
): number {
  if (selectedVendor === MODEL_VENDOR_FILTER_VALUES.All) {
    return allVendorsFilteredCount
  }

  if (selectedVendor === MODEL_VENDOR_FILTER_VALUES.Unclassified) {
    return unclassifiedVendorCount
  }

  return (
    vendorCatalog.find((vendor) => vendor.key === selectedVendor)?.count ?? 0
  )
}

const providerTabClassName =
  "relative isolate shrink-0 rounded-lg px-4 py-density-2-5 text-sm leading-5 font-medium transition-colors duration-150 ease-out motion-reduce:transition-none data-[state=active]:text-theme-700 data-[state=active]:dark:text-theme-400 text-secondary-foreground hover:bg-card/60 hover:text-foreground"

/**
 * Renders the provider tab list.
 */
function ProviderTabList({
  vendorCatalog,
  selectedIndex,
  selectedVendor,
  allVendorsFilteredCount,
  unclassifiedVendorCount,
}: ProviderTabListProps) {
  const { t } = useTranslation("modelList")
  const shouldReduceMotion = useReducedMotion()
  const indicatorId = useId()
  const selectionIndicator = (value: ModelVendorFilterValue) =>
    selectedVendor === value ? (
      <motion.span
        aria-hidden="true"
        layoutId={indicatorId}
        className="bg-card absolute inset-0 -z-10 rounded-lg shadow"
        transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: "easeOut" }}
      />
    ) : null
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
  useLayoutEffect(() => {
    updateScrollState()
    const rafId = window.requestAnimationFrame(() => {
      scrollChildIntoCenter(selectedIndex)
      updateScrollState()
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [selectedIndex, vendorCatalog, scrollChildIntoCenter, updateScrollState])

  return (
    <div className="mb-density-6 gap-y-density-2 flex items-center gap-x-2">
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
        className={`corners-concentric flex min-w-0 flex-1 space-x-1 rounded-lg [--corner-inset:4px] ${CORNERS.buttonItems} ${COLORS.background.tertiary} scrollbar-hide py-density-1 touch-pan-x overflow-x-auto px-1`}
      >
        <TabsTrigger
          value={MODEL_VENDOR_FILTER_VALUES.All}
          className={providerTabClassName}
        >
          {selectionIndicator(MODEL_VENDOR_FILTER_VALUES.All)}
          <div className="flex items-center justify-center space-x-2">
            <LayoutGrid
              aria-hidden={true}
              className={`h-4 w-4 ${COLORS.text.secondary}`}
            />
            <span>
              {t("allProviders")} ({allVendorsFilteredCount})
            </span>
          </div>
        </TabsTrigger>
        {vendorCatalog.map((vendor) => (
          <TabsTrigger
            key={vendor.key}
            value={vendor.key}
            className={providerTabClassName}
          >
            {selectionIndicator(vendor.key)}
            <div className="flex items-center justify-center space-x-2">
              <ModelVendorMark vendor={vendor} variant="compact" />
              <span>
                {vendor.label} ({vendor.count})
              </span>
            </div>
          </TabsTrigger>
        ))}
        {unclassifiedVendorCount > 0 && (
          <TabsTrigger
            value={MODEL_VENDOR_FILTER_VALUES.Unclassified}
            className={providerTabClassName}
            title={t("providerTabs.unclassifiedDescription")}
          >
            {selectionIndicator(MODEL_VENDOR_FILTER_VALUES.Unclassified)}
            <div className="flex items-center justify-center space-x-2">
              <ModelVendorMark
                vendor={{ state: "unknown" }}
                variant="compact"
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
            resultCount: getProviderFilterAnalyticsResultCount(
              newProvider,
              vendorCatalog,
              allVendorsFilteredCount,
              unclassifiedVendorCount,
            ),
          },
        })
      }}
    >
      <ProviderTabList
        vendorCatalog={vendorCatalog}
        selectedIndex={selectedIndex}
        selectedVendor={effectiveSelectedVendor}
        allVendorsFilteredCount={allVendorsFilteredCount}
        unclassifiedVendorCount={unclassifiedVendorCount}
      />
      {children}
    </Tabs>
  )
}
