import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const webAiApiCheckSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:web-ai-api-check",
    "webAiApiCheck",
    "web-ai-api-check",
    "webAiApiCheck:settings.title",
    320,
  ),
]

export const webAiApiCheckSearchControls: OptionsSearchItemDefinition[] = [
  buildControlDefinition(
    "control:web-ai-api-check-context-menu",
    "webAiApiCheck",
    "web-ai-api-check-context-menu",
    "webAiApiCheck:settings.contextMenu.enable",
    620,
    {
      descriptionKey: "webAiApiCheck:settings.contextMenu.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.webAiApiCheck",
        "webAiApiCheck:settings.title",
      ],
      keywords: ["api check", "context menu", "web ai"],
    },
  ),
  buildControlDefinition(
    "control:web-ai-api-check-auto-detect",
    "webAiApiCheck",
    "web-ai-api-check-auto-detect",
    "webAiApiCheck:settings.autoDetect.enable",
    621,
    {
      descriptionKey: "webAiApiCheck:settings.autoDetect.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.webAiApiCheck",
        "webAiApiCheck:settings.title",
      ],
      keywords: ["api check", "auto detect", "regex"],
    },
  ),
  buildControlDefinition(
    "control:web-ai-api-check-whitelist-patterns",
    "webAiApiCheck",
    "web-ai-api-check-whitelist-patterns",
    "webAiApiCheck:settings.autoDetect.whitelist.patterns",
    622,
    {
      descriptionKey:
        "webAiApiCheck:settings.autoDetect.whitelist.patternsDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.webAiApiCheck",
        "webAiApiCheck:settings.title",
      ],
      keywords: ["api check", "whitelist", "patterns", "regex"],
    },
  ),
]
