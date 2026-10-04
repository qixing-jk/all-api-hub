import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { SITE_TYPES } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/features/OptionsSearch/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/features/OptionsSearch/types"

const isGptLoad = (context: { managedSiteType: string }) =>
  context.managedSiteType === SITE_TYPES.GPT_LOAD
const breadcrumbs = [
  ...DEFAULT_BREADCRUMBS,
  "settings:tabs.managedSite",
  "settings:gptLoad.title",
]

export const managedSiteGptLoadSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:gpt-load",
    "managedSite",
    SETTINGS_ANCHORS.GPT_LOAD,
    "settings:gptLoad.title",
    358,
    {
      keywordKeys: ["common:actions.reset"],
      keywords: ["gpt-load", "self-hosted gateway", "负载均衡"],
      isVisible: isGptLoad,
    },
  ),
]

export const managedSiteGptLoadSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:gpt-load-base-url",
    "managedSite",
    SETTINGS_ANCHORS.GPT_LOAD_BASE_URL,
    "settings:gptLoad.fields.baseUrlLabel",
    700,
    {
      descriptionKey: "settings:gptLoad.fields.baseUrlDesc",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["gpt-load", "base url", "dashboard", "地址"],
      isVisible: isGptLoad,
    },
  ),
  buildControlDefinition(
    "control:gpt-load-management-key",
    "managedSite",
    SETTINGS_ANCHORS.GPT_LOAD_MANAGEMENT_KEY,
    "settings:gptLoad.fields.managementKeyLabel",
    702,
    {
      descriptionKey: "settings:gptLoad.fields.managementKeyDesc",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["gpt-load", "management key", "AUTH_KEY", "管理密钥"],
      isVisible: isGptLoad,
    },
  ),
  buildControlDefinition(
    "control:gpt-load-validate",
    "managedSite",
    SETTINGS_ANCHORS.GPT_LOAD_VALIDATE,
    "settings:gptLoad.validation.title",
    706,
    {
      descriptionKey: "settings:gptLoad.validation.description",
      breadcrumbsKeys: breadcrumbs,
      keywords: ["gpt-load", "validate", "connection", "验证"],
      isVisible: isGptLoad,
    },
  ),
]
