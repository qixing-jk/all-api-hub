import { CLAUDE_CODE_HUB } from "~/constants/siteType"
import {
  buildControlDefinition,
  buildSectionDefinition,
  DEFAULT_BREADCRUMBS,
} from "~/entrypoints/options/search/registryHelpers"
import type { OptionsSearchItemDefinition } from "~/entrypoints/options/search/types"

export const managedSiteClaudeCodeHubSearchSections: OptionsSearchItemDefinition[] =
  [
    buildSectionDefinition(
      "section:claude-code-hub",
      "managedSite",
      "claude-code-hub",
      "settings:claudeCodeHub.title",
      346,
      {
        keywords: ["claude-code-hub", "claude code hub"],
        isVisible: (context) => context.managedSiteType === CLAUDE_CODE_HUB,
      },
    ),
  ]

export const managedSiteClaudeCodeHubSearchControls: OptionsSearchItemDefinition[] =
  [
    buildControlDefinition(
      "control:claude-code-hub-base-url",
      "managedSite",
      "claude-code-hub-base-url",
      "settings:claudeCodeHub.fields.baseUrlLabel",
      676,
      {
        descriptionKey: "settings:claudeCodeHub.fields.baseUrlDesc",
        breadcrumbsKeys: [
          ...DEFAULT_BREADCRUMBS,
          "settings:tabs.managedSite",
          "settings:claudeCodeHub.title",
        ],
        keywords: ["claude-code-hub", "claude code hub", "base url"],
        isVisible: (context) => context.managedSiteType === CLAUDE_CODE_HUB,
      },
    ),
    buildControlDefinition(
      "control:claude-code-hub-admin-token",
      "managedSite",
      "claude-code-hub-admin-token",
      "settings:claudeCodeHub.fields.adminTokenLabel",
      677,
      {
        descriptionKey: "settings:claudeCodeHub.fields.adminTokenDesc",
        breadcrumbsKeys: [
          ...DEFAULT_BREADCRUMBS,
          "settings:tabs.managedSite",
          "settings:claudeCodeHub.title",
        ],
        keywords: ["claude-code-hub", "claude code hub", "token"],
        isVisible: (context) => context.managedSiteType === CLAUDE_CODE_HUB,
      },
    ),
    buildControlDefinition(
      "control:claude-code-hub-validate-config",
      "managedSite",
      "claude-code-hub-validate-config",
      "settings:claudeCodeHub.validation.title",
      678,
      {
        descriptionKey: "settings:claudeCodeHub.validation.description",
        breadcrumbsKeys: [
          ...DEFAULT_BREADCRUMBS,
          "settings:tabs.managedSite",
          "settings:claudeCodeHub.title",
        ],
        keywords: ["claude-code-hub", "claude code hub", "validate"],
        isVisible: (context) => context.managedSiteType === CLAUDE_CODE_HUB,
      },
    ),
    buildControlDefinition(
      "control:claude-code-hub-unsupported-note",
      "managedSite",
      "claude-code-hub-unsupported-note",
      "settings:claudeCodeHub.unsupported.title",
      679,
      {
        descriptionKey: "settings:claudeCodeHub.unsupported.description",
        breadcrumbsKeys: [
          ...DEFAULT_BREADCRUMBS,
          "settings:tabs.managedSite",
          "settings:claudeCodeHub.title",
        ],
        keywords: ["claude-code-hub", "claude code hub", "unsupported"],
        isVisible: (context) => context.managedSiteType === CLAUDE_CODE_HUB,
      },
    ),
  ]
