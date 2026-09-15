import type { TFunction } from "i18next"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardContent, Switch } from "~/components/ui"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { CONFIGURABLE_SORTING_CRITERIA } from "~/services/preferences/utils/sortingPriority"
import { SortingCriteriaType, type SortingFieldConfig } from "~/types/sorting"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"

import { getSortingCriteriaTargetId } from "./search"

// Maps sorting criteria IDs to their UI display text (label and description).
// This keeps UI concerns separate from the data-only sorting configuration.
const getSortingCriteriaUiText = (
  t: TFunction,
): Partial<
  Record<SortingCriteriaType, { label: string; description?: string }>
> => ({
  [SortingCriteriaType.CURRENT_SITE]: {
    label: t("settings:sorting.currentSitePriority"),
    description: t("settings:sorting.currentSiteDesc"),
  },
  [SortingCriteriaType.MATCHED_OPEN_TABS]: {
    label: t("settings:sorting.matchedOpenTabs"),
    description: t("settings:sorting.matchedOpenTabsDesc"),
  },
})

const CONFIGURABLE_SORTING_CRITERIA_SET = new Set<SortingCriteriaType>(
  CONFIGURABLE_SORTING_CRITERIA,
)

/** Keeps only automatic criteria that remain configurable in settings. */
function getConfigurableCriteria(criteria: SortingFieldConfig[]) {
  return criteria
    .filter((item) => CONFIGURABLE_SORTING_CRITERIA_SET.has(item.id))
    .sort((a, b) => a.priority - b.priority)
}

/**
 * Settings section that lets users toggle browsing-context sorting priorities.
 */
export default function SortingPrioritySettings() {
  const { t } = useTranslation("settings")
  const {
    sortingPriorityConfig: initialConfig,
    updateSortingPriorityConfig,
    resetSortingPriorityConfig,
    isLoading,
  } = useUserPreferencesContext()
  const [items, setItems] = useState<SortingFieldConfig[]>([])

  const resetItemsFromInitialConfig = () => {
    setItems(
      initialConfig?.criteria
        ? getConfigurableCriteria(initialConfig.criteria)
        : [],
    )
  }

  useEffect(() => {
    if (initialConfig?.criteria) {
      setItems(getConfigurableCriteria(initialConfig.criteria))
    }
  }, [initialConfig])

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    const updatedItems = items.map((item) =>
      item.id === id ? { ...item, enabled } : item,
    )

    setItems(updatedItems)

    // 立即保存
    if (initialConfig) {
      const writeResult = await updateSortingPriorityConfig({
        ...initialConfig,
        criteria: updatedItems,
        lastModified: Date.now(),
      })
      showUpdateToast(writeResult, t("sorting.title"))
      if (!writeResult.ok) {
        resetItemsFromInitialConfig()
      }
    }
  }

  const isInitialLoading =
    isLoading && items.length === 0 && !initialConfig?.criteria?.length

  if (isInitialLoading) {
    return <div>{t("common:status.loading")}</div>
  }

  // Augment the data-only items with UI text for rendering
  const sortingCriteriaUiText = getSortingCriteriaUiText(t)
  const augmentedItems = items.map((item) => ({
    ...item,
    ...(sortingCriteriaUiText[item.id] || {
      label: item.id,
      description: t("sorting.unknownSortRule"),
    }),
  }))

  return (
    <SettingSection
      id={SETTINGS_ANCHORS.SORTING_PRIORITY}
      title={t("sorting.title")}
      description={t("sorting.description")}
      onReset={resetSortingPriorityConfig}
    >
      <Card>
        <CardContent className="space-y-density-5">
          <div className="space-y-density-3">
            <div>
              <h3 className="text-sm font-medium">
                {t("sorting.contextBoostTitle")}
              </h3>
              <p className="text-muted-foreground mt-density-1 text-xs">
                {t("sorting.contextBoostDescription")}
              </p>
            </div>
            {CONFIGURABLE_SORTING_CRITERIA.map((id) => {
              const item = augmentedItems.find((item) => item.id === id)
              if (!item) return null
              const targetId = getSortingCriteriaTargetId(id)
              return (
                <div
                  key={id}
                  id={targetId}
                  className="gap-y-density-4 flex items-center justify-between gap-x-4"
                >
                  <div className="min-w-0">
                    <label
                      htmlFor={`${targetId}-toggle`}
                      className="text-sm font-medium"
                    >
                      {item.label}
                    </label>
                    <p
                      id={`${targetId}-description`}
                      className="text-muted-foreground mt-density-1 text-xs"
                    >
                      {item.description}
                    </p>
                  </div>
                  <Switch
                    id={`${targetId}-toggle`}
                    aria-describedby={`${targetId}-description`}
                    checked={item.enabled}
                    onChange={(checked) =>
                      void handleToggleEnabled(id, checked)
                    }
                    size="sm"
                  />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </SettingSection>
  )
}
