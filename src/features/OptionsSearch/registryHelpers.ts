import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"

import type {
  BasicSettingsTabId,
  OptionsSearchContext,
  OptionsSearchItemDefinition,
} from "./types"

export const DEFAULT_BREADCRUMBS = ["ui:navigation.basic"]

type SearchDefinitionOptions = {
  descriptionKey?: string
  breadcrumbsKeys?: string[]
  keywords?: string[]
  keywordKeys?: string[]
  isVisible?: (context: OptionsSearchContext) => boolean
}

/** Define a page result with a stable identity and a title resolved from page metadata. */
export const buildPageDefinition = (
  pageId: string,
  order: number,
): OptionsSearchItemDefinition => ({
  id: `page:${pageId}`,
  kind: "page",
  pageId,
  titleKey: `__page:${pageId}`,
  breadcrumbsKeys: ["ui:navigation.settings"],
  keywords: [],
  order,
})

/** Define a Basic Settings tab result, hiding permissions when the browser has none. */
export const buildTabDefinition = (
  tabId: BasicSettingsTabId,
  order: number,
): OptionsSearchItemDefinition => ({
  id: `tab:${tabId}`,
  kind: "tab",
  pageId: MENU_ITEM_IDS.BASIC,
  tabId,
  titleKey: `settings:tabs.${tabId}`,
  breadcrumbsKeys: DEFAULT_BREADCRUMBS,
  keywords: [],
  order,
  isVisible:
    tabId === "permissions"
      ? (context) => context.hasOptionalPermissions
      : undefined,
})

/** Define a settings section whose target is revealed within its owning tab. */
export const buildSectionDefinition = (
  id: string,
  tabId: BasicSettingsTabId,
  targetId: string,
  titleKey: string,
  order: number,
  options?: SearchDefinitionOptions,
): OptionsSearchItemDefinition => ({
  id,
  kind: "section",
  pageId: MENU_ITEM_IDS.BASIC,
  tabId,
  targetId,
  titleKey,
  descriptionKey: options?.descriptionKey,
  breadcrumbsKeys: options?.breadcrumbsKeys ?? [
    ...DEFAULT_BREADCRUMBS,
    `settings:tabs.${tabId}`,
  ],
  keywords: options?.keywords ?? [],
  keywordKeys: options?.keywordKeys,
  order,
  isVisible: options?.isVisible,
})

/** Define a section on a standalone options page with page-level breadcrumbs. */
export const buildPageSectionDefinition = (
  id: string,
  pageId: string,
  targetId: string,
  titleKey: string,
  order: number,
  options?: SearchDefinitionOptions,
): OptionsSearchItemDefinition => ({
  id,
  kind: "section",
  pageId,
  targetId,
  titleKey,
  descriptionKey: options?.descriptionKey,
  breadcrumbsKeys: options?.breadcrumbsKeys ?? [
    "ui:navigation.settings",
    `__page:${pageId}`,
  ],
  keywords: options?.keywords ?? [],
  keywordKeys: options?.keywordKeys,
  order,
  isVisible: options?.isVisible,
})

/** Define a settings control whose tab and target are preserved during navigation. */
export const buildControlDefinition = (
  id: string,
  tabId: BasicSettingsTabId,
  targetId: string,
  titleKey: string,
  order: number,
  options?: SearchDefinitionOptions,
): OptionsSearchItemDefinition => ({
  id,
  kind: "control",
  pageId: MENU_ITEM_IDS.BASIC,
  tabId,
  targetId,
  titleKey,
  descriptionKey: options?.descriptionKey,
  breadcrumbsKeys: options?.breadcrumbsKeys ?? [
    ...DEFAULT_BREADCRUMBS,
    `settings:tabs.${tabId}`,
  ],
  keywords: options?.keywords ?? [],
  keywordKeys: options?.keywordKeys,
  order,
  isVisible: options?.isVisible,
})

/** Define a control on a standalone page while retaining its search target and visibility rule. */
export const buildPageControlDefinition = (
  id: string,
  pageId: string,
  targetId: string,
  titleKey: string,
  order: number,
  options?: SearchDefinitionOptions,
): OptionsSearchItemDefinition => ({
  id,
  kind: "control",
  pageId,
  targetId,
  titleKey,
  descriptionKey: options?.descriptionKey,
  breadcrumbsKeys: options?.breadcrumbsKeys ?? [
    "ui:navigation.settings",
    `__page:${pageId}`,
  ],
  keywords: options?.keywords ?? [],
  keywordKeys: options?.keywordKeys,
  order,
  isVisible: options?.isVisible,
})
