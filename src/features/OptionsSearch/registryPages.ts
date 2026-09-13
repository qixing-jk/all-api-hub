import { getOptionsPageMenuIds } from "~/constants/optionsMenuDefinitions"

import { BASIC_SETTINGS_TAB_ORDER } from "./basicSettingsMeta"
import { buildPageDefinition, buildTabDefinition } from "./registryHelpers"

export const PAGE_DEFINITIONS = getOptionsPageMenuIds().map((id, index) =>
  buildPageDefinition(id, index),
)

export const TAB_DEFINITIONS = BASIC_SETTINGS_TAB_ORDER.map((tabId, index) =>
  buildTabDefinition(tabId, 100 + index),
)
