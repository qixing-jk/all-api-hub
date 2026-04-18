import { Tab } from "@headlessui/react"
import { CpuChipIcon } from "@heroicons/react/24/outline"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { useHorizontalScrollControls } from "~/hooks/useHorizontalScrollControls"
import {
  getProviderConfig,
  MODEL_PROVIDER_FILTER_VALUES,
  type ModelProviderFilterValue,
  type ProviderType,
} from "~/services/models/utils/modelProviders"

interface ProviderTabsProps {
  providers: ProviderType[]
  selectedProvider: ModelProviderFilterValue
  setSelectedProvider: (provider: ModelProviderFilterValue) => void
  allProvidersFilteredCount: number
  getProviderFilteredCount: (provider: ProviderType) => number
  children: ReactNode
}

interface ProviderTabListProps {
  providers: ProviderType[]
  selectedIndex: number
  allProvidersFilteredCount: number
  getProviderFilteredCount: (provider: ProviderType) => number
}

/**
 * Renders the provider tab list.
 */
function ProviderTabList({
  providers,
  selectedIndex,
  allProvidersFilteredCount,
  getProviderFilteredCount,
}: ProviderTabListProps) {
  const { t } = useTranslation("modelList")
  const {
    scrollRef: tabListRef,
    canScrollLeft,
    canScrollRight,
    scrollLeft,
    scrollRight,
    scrollChildIntoCenter,
  } = useHorizontalScrollControls<HTMLDivElement>({
    enableWheelScroll: true,
  })

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      scrollChildIntoCenter(selectedIndex)
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [selectedIndex, providers.length, scrollChildIntoCenter])

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

      <Tab.List
        ref={tabListRef}
        className={`flex min-w-0 flex-1 space-x-1 rounded-xl ${COLORS.background.tertiary} scrollbar-hide touch-pan-x overflow-x-auto p-1`}
      >
        <Tab
          className={({ selected }) =>
            `shrink-0 rounded-lg px-4 py-2.5 text-sm leading-5 font-medium transition-all ${ANIMATIONS.transition.base} ${
              selected
                ? "dark:bg-dark-bg-secondary bg-white text-blue-700 shadow dark:text-blue-400"
                : "dark:text-dark-text-secondary dark:hover:bg-dark-bg-secondary/60 dark:hover:text-dark-text-primary text-gray-700 hover:bg-white/60 hover:text-gray-900"
            }`
          }
        >
          <div className="flex items-center justify-center space-x-2">
            <CpuChipIcon className="dark:text-dark-text-secondary h-4 w-4 text-gray-600" />
            <span>
              {t("allProviders")} ({allProvidersFilteredCount})
            </span>
          </div>
        </Tab>
        {providers.map((provider) => {
          const providerConfig = getProviderConfig(
            provider.toLowerCase().replace(/\s/g, "-"),
          )
          const IconComponent = providerConfig.icon
          return (
            <Tab
              key={provider}
              className={({ selected }) =>
                `shrink-0 rounded-lg px-4 py-2.5 text-sm leading-5 font-medium transition-all ${ANIMATIONS.transition.base} ${
                  selected
                    ? "dark:bg-dark-bg-secondary bg-white text-blue-700 shadow dark:text-blue-400"
                    : "dark:text-dark-text-secondary dark:hover:bg-dark-bg-secondary/60 dark:hover:text-dark-text-primary text-gray-700 hover:bg-white/60 hover:text-gray-900"
                }`
              }
            >
              <div className="flex items-center justify-center space-x-2">
                <IconComponent className="h-4 w-4" />
                <span>
                  {provider} ({getProviderFilteredCount(provider)})
                </span>
              </div>
            </Tab>
          )
        })}
      </Tab.List>

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
 * @param props.providers Provider list with available models.
 * @param props.selectedProvider Currently selected provider or all providers.
 * @param props.setSelectedProvider Setter to change provider filter.
 * @param props.allProvidersFilteredCount Count of models after non-provider filters.
 * @param props.getProviderFilteredCount Helper to get count per provider.
 * @param props.children Tab panels content to render.
 * @returns Headless UI Tab group with provider tabs.
 */
export function ProviderTabs({
  providers,
  selectedProvider,
  setSelectedProvider,
  allProvidersFilteredCount,
  getProviderFilteredCount,
  children,
}: ProviderTabsProps) {
  // Filter out providers with zero models
  const filteredProviders = providers.filter(
    (provider) => getProviderFilteredCount(provider) > 0,
  )

  const selectedIndex =
    selectedProvider === MODEL_PROVIDER_FILTER_VALUES.ALL
      ? 0
      : Math.max(
          0,
          filteredProviders.indexOf(selectedProvider as ProviderType) + 1,
        )

  return (
    <Tab.Group
      selectedIndex={selectedIndex}
      onChange={(index) => {
        const newProvider =
          index === 0
            ? MODEL_PROVIDER_FILTER_VALUES.ALL
            : filteredProviders[index - 1]
        setSelectedProvider(newProvider)
      }}
    >
      <ProviderTabList
        providers={filteredProviders}
        selectedIndex={selectedIndex}
        allProvidersFilteredCount={allProvidersFilteredCount}
        getProviderFilteredCount={getProviderFilteredCount}
      />
      {children}
    </Tab.Group>
  )
}
