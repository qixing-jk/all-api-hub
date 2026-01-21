import type { DragEndEvent } from "@dnd-kit/core"
import { arrayMove } from "@dnd-kit/sortable"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardContent } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { SortingCriteriaType, type SortingFieldConfig } from "~/types/sorting"

import { showUpdateToast } from "../../../../../../utils/toastHelpers"
import { SortingPriorityDragList } from "./SortingPriorityDragList"

// Maps sorting criteria IDs to their UI display text (label and description).
// This keeps UI concerns separate from the data-only sorting configuration.
const getSortingCriteriaUiText = (
  t: (key: string) => string,
): Record<SortingCriteriaType, { label: string; description?: string }> => ({
  [SortingCriteriaType.DISABLED_ACCOUNT]: {
    label: t("settings:sorting.disabledAccount"),
    description: t("settings:sorting.disabledAccountDesc"),
  },
  [SortingCriteriaType.PINNED]: {
    label: t("settings:sorting.pinnedPriority"),
    description: t("settings:sorting.pinnedDesc"),
  },
  [SortingCriteriaType.MANUAL_ORDER]: {
    label: t("settings:sorting.manualOrder"),
    description: t("settings:sorting.manualOrderDesc"),
  },
  [SortingCriteriaType.CURRENT_SITE]: {
    label: t("settings:sorting.currentSitePriority"),
    description: t("settings:sorting.currentSiteDesc"),
  },
  [SortingCriteriaType.HEALTH_STATUS]: {
    label: t("settings:sorting.healthStatus"),
    description: t("settings:sorting.healthDesc"),
  },
  [SortingCriteriaType.CHECK_IN_REQUIREMENT]: {
    label: t("settings:sorting.checkInRequirement"),
    description: t("settings:sorting.checkInDesc"),
  },
  [SortingCriteriaType.USER_SORT_FIELD]: {
    label: t("settings:sorting.userCustomSort"),
    description: t("settings:sorting.customSortDesc"),
  },
  [SortingCriteriaType.CUSTOM_CHECK_IN_URL]: {
    label: t("settings:sorting.customCheckInUrl"),
    description: t("settings:sorting.customCheckInDesc"),
  },
  [SortingCriteriaType.CUSTOM_REDEEM_URL]: {
    label: t("settings:sorting.customRedeemUrl"),
    description: t("settings:sorting.customRedeemDesc"),
  },
  [SortingCriteriaType.MATCHED_OPEN_TABS]: {
    label: t("settings:sorting.matchedOpenTabs"),
    description: t("settings:sorting.matchedOpenTabsDesc"),
  },
})

/**
 * Settings section that lets users reorder and toggle sorting criteria priorities.
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

  useEffect(() => {
    if (initialConfig?.criteria) {
      // Sort items based on priority for consistent display
      setItems(
        [...initialConfig.criteria].sort((a, b) => a.priority - b.priority),
      )
    }
  }, [initialConfig])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id)
      const newIndex = items.findIndex((item) => item.id === over.id)
      const reorderedItems = arrayMove(items, oldIndex, newIndex)
      const updatedItems = reorderedItems.map((item, index) => ({
        ...item,
        priority: index,
      }))

      setItems(updatedItems)

      // 立即保存
      if (initialConfig) {
        const success = await updateSortingPriorityConfig({
          ...initialConfig,
          criteria: updatedItems,
          lastModified: Date.now(),
        })
        if (success) {
          showUpdateToast(success, t("sorting.title"))
        }
      }
    }
  }

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    const updatedItems = items.map((item) =>
      item.id === id ? { ...item, enabled } : item,
    )

    setItems(updatedItems)

    // 立即保存
    if (initialConfig) {
      const success = await updateSortingPriorityConfig({
        ...initialConfig,
        criteria: updatedItems,
        lastModified: Date.now(),
      })
      if (success) {
        showUpdateToast(success, t("sorting.title"))
      }
    }
  }

  if (isLoading) {
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
      id="sorting-priority"
      title={t("sorting.title")}
      description={t("sorting.description", { defaultValue: "" })}
      onReset={resetSortingPriorityConfig}
    >
      <Card>
        <CardContent>
          <SortingPriorityDragList
            items={augmentedItems}
            onDragEnd={handleDragEnd}
            onToggleEnabled={handleToggleEnabled}
          />
        </CardContent>
      </Card>
    </SettingSection>
  )
}
