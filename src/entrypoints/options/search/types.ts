import type { BasicSettingsTabId } from "~/constants/basicSettingsTabs"
import type { ManagedSiteType } from "~/constants/siteType"

export type { BasicSettingsTabId } from "~/constants/basicSettingsTabs"

export type OptionsSearchItemKind = "page" | "tab" | "section" | "control"

export interface OptionsSearchContext {
  autoCheckinEnabled: boolean
  hasOptionalPermissions: boolean
  managedSiteType: ManagedSiteType
  modelRedirectEnabled: boolean
  sidePanelSupported: boolean
  showTodayCashflow: boolean
  webdavAutoSyncEnabled: boolean
}

export interface OptionsSearchItemDefinition {
  id: string
  kind: OptionsSearchItemKind
  pageId: string
  tabId?: BasicSettingsTabId
  targetId?: string
  titleKey: string
  descriptionKey?: string
  breadcrumbsKeys: string[]
  keywords: string[]
  order: number
  isVisible?: (context: OptionsSearchContext) => boolean
}

export interface OptionsSearchItem extends OptionsSearchItemDefinition {
  title: string
  description?: string
  breadcrumbs: string[]
}
