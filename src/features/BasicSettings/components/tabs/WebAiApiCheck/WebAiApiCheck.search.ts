import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/features/OptionsSearch/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/features/OptionsSearch/types"

import { WEB_AI_API_CHECK_TARGET_IDS } from "./searchTargets"

export const webAiApiCheckSearchSections: OptionsSearchItemDefinition[] = [
  buildSectionDefinition(
    "section:web-ai-api-check",
    "webAiApiCheck",
    "web-ai-api-check",
    "webAiApiCheck:settings.title",
    320,
    { keywordKeys: ["common:actions.reset"] },
  ),
]

export const webAiApiCheckSearchControls: OptionsSearchItemDefinition[] = [
  ...(
    [
      ["siteScope", "title"],
      ["includedSites", "whitelist"],
      ["excludedSites", "blacklist"],
    ] as const
  ).map(([target, label], index) =>
    buildControlDefinition(
      `control:web-ai-api-check-${target}`,
      "webAiApiCheck",
      WEB_AI_API_CHECK_TARGET_IDS[target],
      `webAiApiCheck:settings.siteRules.${label}`,
      627 + index,
      {
        keywordKeys: ["webAiApiCheck:settings.siteRules.priority"],
        keywords: [
          "api check",
          "website",
          "allowlist",
          "blocklist",
          "exclude",
          "domain",
        ],
        descriptionKey: "webAiApiCheck:settings.siteRules.description",
      },
    ),
  ),
  buildControlDefinition(
    "control:web-ai-api-check-context-menu",
    "webAiApiCheck",
    WEB_AI_API_CHECK_TARGET_IDS.contextMenu,
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
    WEB_AI_API_CHECK_TARGET_IDS.autoDetect,
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
    "control:web-ai-api-check-enhanced-auto-detect",
    "webAiApiCheck",
    WEB_AI_API_CHECK_TARGET_IDS.enhancedAutoDetect,
    "webAiApiCheck:settings.autoDetect.enhanced.enable",
    622,
    {
      descriptionKey: "webAiApiCheck:settings.autoDetect.enhanced.enableDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.webAiApiCheck",
        "webAiApiCheck:settings.title",
      ],
      keywords: ["api check", "enhanced", "auto detect"],
    },
  ),
  buildControlDefinition(
    "control:web-ai-api-check-key-cleanup-patterns",
    "webAiApiCheck",
    WEB_AI_API_CHECK_TARGET_IDS.keyCleanupPatterns,
    "webAiApiCheck:settings.keyCleanup.patterns",
    625,
    {
      descriptionKey: "webAiApiCheck:settings.keyCleanup.patternsDesc",
      breadcrumbsKeys: [
        ...DEFAULT_BREADCRUMBS,
        "settings:tabs.webAiApiCheck",
        "webAiApiCheck:settings.title",
      ],
      keywords: ["api check", "api key", "cleanup", "regex", "patterns"],
    },
  ),
]
