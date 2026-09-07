import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import { axonHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/axonHubMigration"
import { claudeCodeHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/claudeCodeHubMigration"
import { doneHubManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/doneHubMigration"
import { newApiManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/newApiMigration"
import * as octopusNative from "~/services/apiAdapters/managedResources/octopus"
import { octopusManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/octopusMigration"
import { veloeraManagedSiteMigrationCapability } from "~/services/apiAdapters/managedResources/veloeraMigration"
import type {
  ManagedSiteMigrationCapability,
  ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"

const targets: Partial<
  Record<ManagedSiteType, ManagedSiteMigrationCapability>
> = {
  [SITE_TYPES.NEW_API]: newApiManagedSiteMigrationCapability,
  [SITE_TYPES.VELOERA]: veloeraManagedSiteMigrationCapability,
  [SITE_TYPES.DONE_HUB]: doneHubManagedSiteMigrationCapability,
  [SITE_TYPES.OCTOPUS]: octopusManagedSiteMigrationCapability,
  [SITE_TYPES.AXON_HUB]: axonHubManagedSiteMigrationCapability,
  [SITE_TYPES.CLAUDE_CODE_HUB]: claudeCodeHubManagedSiteMigrationCapability,
}

const buildSource = (
  sourceSiteType: ManagedSiteType,
  resourceType: string | number,
): ManagedSiteMigrationSource => ({
  sourceSiteType,
  resourceType,
  baseUrl: "http://upstream.example.invalid",
  models: ["example-model"],
  groups: ["default"],
  priority: 0,
  weight: 1,
  status: "disabled",
  lossSignals: {
    hasModelMapping: false,
    hasStatusCodeMapping: false,
    hasAdvancedSettings: false,
    hasMultiKeyState: false,
  },
})

describe("native migration target preparation", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(
      octopusNative,
      "openOctopusNativeResourceOperations",
    ).mockResolvedValue({
      prepareMigrationBaseUrl: async (baseUrl: string) => baseUrl,
    } as never)
  })

  it.each([
    [SITE_TYPES.DONE_HUB, 28, SITE_TYPES.VELOERA, 43, false],
    [SITE_TYPES.VELOERA, 24, SITE_TYPES.DONE_HUB, 25, false],
    [SITE_TYPES.CLAUDE_CODE_HUB, "codex", SITE_TYPES.DONE_HUB, 59, false],
    [SITE_TYPES.DONE_HUB, 59, SITE_TYPES.CLAUDE_CODE_HUB, "codex", false],
    [SITE_TYPES.NEW_API, 49, SITE_TYPES.DONE_HUB, 38, false],
    [SITE_TYPES.DONE_HUB, 38, SITE_TYPES.NEW_API, 49, false],
    [SITE_TYPES.VELOERA, 24, SITE_TYPES.CLAUDE_CODE_HUB, "gemini", false],
    [
      SITE_TYPES.DONE_HUB,
      28,
      SITE_TYPES.CLAUDE_CODE_HUB,
      "openai-compatible",
      true,
    ],
    [SITE_TYPES.AXON_HUB, "deepseek_anthropic", SITE_TYPES.DONE_HUB, 28, true],
    [SITE_TYPES.NEW_API, 41, SITE_TYPES.AXON_HUB, "gemini", true],
    [SITE_TYPES.AXON_HUB, "gemini_vertex", SITE_TYPES.NEW_API, 24, true],
    [SITE_TYPES.OCTOPUS, 0, SITE_TYPES.AXON_HUB, "openai", false],
    [SITE_TYPES.OCTOPUS, 1, SITE_TYPES.AXON_HUB, "openai_responses", false],
    [SITE_TYPES.AXON_HUB, "openai_responses", SITE_TYPES.OCTOPUS, 1, false],
    [SITE_TYPES.OCTOPUS, 5, SITE_TYPES.NEW_API, 1, true],
  ] as const)(
    "maps native %s/%s to %s/%s and reports protocol changes",
    async (
      sourceSiteType,
      resourceType,
      targetSiteType,
      expectedType,
      remappedType,
    ) => {
      const prepared = await targets[targetSiteType]!.target!.prepare(
        buildSource(sourceSiteType, resourceType),
      )

      expect(prepared.projection).toMatchObject({
        type: expectedType,
        enabled: false,
        baseUrl: "http://upstream.example.invalid",
        models: ["example-model"],
      })
      expect(prepared.adjustments.remappedType).toBe(remappedType)
    },
  )

  it.each([
    [SITE_TYPES.NEW_API, 0, SITE_TYPES.CLAUDE_CODE_HUB],
    [SITE_TYPES.NEW_API, 999, SITE_TYPES.NEW_API],
    [SITE_TYPES.NEW_API, 57, SITE_TYPES.OCTOPUS],
    [SITE_TYPES.VELOERA, 49, SITE_TYPES.CLAUDE_CODE_HUB],
    [SITE_TYPES.VELOERA, 49, SITE_TYPES.DONE_HUB],
    [SITE_TYPES.DONE_HUB, 49, SITE_TYPES.CLAUDE_CODE_HUB],
    [SITE_TYPES.DONE_HUB, 31, SITE_TYPES.CLAUDE_CODE_HUB],
    [SITE_TYPES.AXON_HUB, "future-provider", SITE_TYPES.NEW_API],
    [SITE_TYPES.CLAUDE_CODE_HUB, "constructor", SITE_TYPES.NEW_API],
    [SITE_TYPES.CLAUDE_CODE_HUB, "__proto__", SITE_TYPES.NEW_API],
    [SITE_TYPES.CLAUDE_CODE_HUB, "toString", SITE_TYPES.NEW_API],
    [SITE_TYPES.SUB2API, "openai", SITE_TYPES.NEW_API],
    [SITE_TYPES.SUB2API, "anthropic", SITE_TYPES.CLAUDE_CODE_HUB],
  ] as const)(
    "blocks unregistered native conversion %s/%s to %s",
    async (sourceSiteType, resourceType, targetSiteType) => {
      await expect(
        targets[targetSiteType]!.target!.prepare(
          buildSource(sourceSiteType, resourceType),
        ),
      ).rejects.toThrow()
    },
  )
})
