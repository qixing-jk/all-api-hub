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
  isVisible?: (context: OptionsSearchContext) => boolean
}

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
  order,
  isVisible: options?.isVisible,
})

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
  order,
  isVisible: options?.isVisible,
})

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
  order,
  isVisible: options?.isVisible,
})

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
  order,
  isVisible: options?.isVisible,
})
