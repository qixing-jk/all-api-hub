import type { ManagedSiteType } from "~/constants/siteType"

export type OptionsSearchItemKind = "page" | "tab" | "section" | "control"

export type BasicSettingsTabId =
  | "general"
  | "balanceHistory"
  | "accountManagement"
  | "refresh"
  | "checkinRedeem"
  | "webAiApiCheck"
  | "accountUsage"
  | "dataBackup"
  | "managedSite"
  | "cliProxy"
  | "claudeCodeRouter"
  | "permissions"

export interface OptionsSearchContext {
  autoCheckinEnabled: boolean
  hasOptionalPermissions: boolean
  managedSiteType: ManagedSiteType
  sidePanelSupported: boolean
  showTodayCashflow: boolean
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
