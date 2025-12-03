import { Tab } from "@headlessui/react"
import { CpuChipIcon } from "@heroicons/react/24/outline"
import { useEffect, useRef, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { getProviderConfig, type ProviderType } from "~/utils/modelProviders"

interface ProviderTabsProps {
  providers: ProviderType[]
  selectedProvider: ProviderType | "all"
  setSelectedProvider: (provider: ProviderType | "all") => void
  baseFilteredModelsCount: number
  getProviderFilteredCount: (provider: ProviderType) => number
  children: ReactNode
}

export function ProviderTabs({
  providers,
  selectedProvider,
  setSelectedProvider,
  baseFilteredModelsCount,
  getProviderFilteredCount,
  children,
}: ProviderTabsProps) {
  const { t } = useTranslation("modelList")
  const tabListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tabList = tabListRef.current
    if (!tabList) return

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      tabList.scrollTo({
        left: tabList.scrollLeft + e.deltaY,
        behavior: "auto",
      })
    }

    tabList.addEventListener("wheel", onWheel)
    return () => tabList.removeEventListener("wheel", onWheel)
  }, [])

  const scrollToSelectedTab = (selectedIndex: number) => {
    if (!tabListRef.current) return

    const tabList = tabListRef.current
    const tabs = tabList.children

    if (selectedIndex >= 0 && selectedIndex < tabs.length) {
      const selectedTab = tabs[selectedIndex] as HTMLElement
      const tabListRect = tabList.getBoundingClientRect()
      const selectedTabRect = selectedTab.getBoundingClientRect()

      const tabLeft =
        selectedTabRect.left - tabListRect.left + tabList.scrollLeft
      const idealScrollLeft =
        tabLeft - tabList.clientWidth / 2 + selectedTabRect.width / 2

      tabList.scrollTo({
        left: Math.max(0, idealScrollLeft),
        behavior: "smooth",
      })
    }
  }

  // Filter out providers with zero models
  const filteredProviders = providers.filter(
    (provider) => getProviderFilteredCount(provider) > 0,
  )

  useEffect(() => {
    const selectedIndex =
      selectedProvider === "all"
        ? 0
        : Math.max(
            0,
            filteredProviders.indexOf(selectedProvider as ProviderType) + 1,
          )
    setTimeout(() => scrollToSelectedTab(selectedIndex), 100)
  }, [selectedProvider, filteredProviders])

  const selectedIndex =
    selectedProvider === "all"
      ? 0
      : Math.max(
          0,
          filteredProviders.indexOf(selectedProvider as ProviderType) + 1,
        )

  return (
    <Tab.Group
      selectedIndex={selectedIndex}
      onChange={(index) => {
        const newProvider = index === 0 ? "all" : filteredProviders[index - 1]
        setSelectedProvider(newProvider)
        setTimeout(() => scrollToSelectedTab(index), 50)
      }}
    >
      <Tab.List
        ref={tabListRef}
        className={`flex space-x-1 rounded-xl ${COLORS.background.tertiary} scrollbar-hide mb-6 touch-pan-x overflow-x-auto p-1`}
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
            <span>{t("allProviders", { count: baseFilteredModelsCount })}</span>
          </div>
        </Tab>
        {filteredProviders.map((provider) => {
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
      {children}
    </Tab.Group>
  )
}
