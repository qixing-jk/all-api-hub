import { menuItems } from "../constants"
import { BASIC_SETTINGS_TAB_ORDER } from "./basicSettingsMeta"
import { buildPageDefinition, buildTabDefinition } from "./registryHelpers"
import type { OptionsSearchContext } from "./types"

export const PAGE_DEFINITIONS = menuItems.map((item, index) => ({
  ...buildPageDefinition(item.id, index),
  isVisible:
    item.id === "autoCheckin"
      ? (context: OptionsSearchContext) => context.autoCheckinEnabled
      : undefined,
}))

export const TAB_DEFINITIONS = BASIC_SETTINGS_TAB_ORDER.map((tabId, index) =>
  buildTabDefinition(tabId, 100 + index),
)
