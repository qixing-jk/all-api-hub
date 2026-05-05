import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const claudeCodeRouterSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:claude-code-router",
    "claudeCodeRouter",
    "claude-code-router",
    "settings:claudeCodeRouter.title",
    380,
    {
      keywords: ["claude-code-router", "router"],
    },
  ),
]

export const claudeCodeRouterSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:claude-code-router-base-url",
    "claudeCodeRouter",
    "claude-code-router-base-url",
    "settings:claudeCodeRouter.baseUrlLabel",
    683,
    {
      descriptionKey: "settings:claudeCodeRouter.urlDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.claudeCodeRouter",
        "settings:claudeCodeRouter.title",
      ],
      keywords: ["claude", "router", "base url"],
    },
  ),
  buildControlDefinition(
    "control:claude-code-router-api-key",
    "claudeCodeRouter",
    "claude-code-router-api-key",
    "settings:claudeCodeRouter.apiKeyLabel",
    684,
    {
      descriptionKey: "settings:claudeCodeRouter.keyDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.claudeCodeRouter",
        "settings:claudeCodeRouter.title",
      ],
      keywords: ["claude", "router", "api key"],
    },
  ),
]
