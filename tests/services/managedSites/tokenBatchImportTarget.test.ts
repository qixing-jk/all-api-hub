import { describe, expect, it } from "vitest"

import { MANAGED_SITE_TYPES, SITE_TYPES } from "~/constants/siteType"
import type { ManagedSiteRuntimeConfig } from "~/services/managedSites/runtimeConfig"
import {
  createManagedSiteTokenBatchImportTarget,
  type ManagedSiteTokenBatchImportTarget,
} from "~/services/managedSites/tokenBatchImportTarget"

const runtimeConfigs: ManagedSiteRuntimeConfig[] = [
  {
    siteType: SITE_TYPES.NEW_API,
    config: {
      baseUrl: "https://new-api.example.invalid/",
      adminToken: "new-api-admin-token",
      userId: "101202603140001",
    },
  },
  {
    siteType: SITE_TYPES.VELOERA,
    config: {
      baseUrl: "https://veloera.example.invalid/",
      adminToken: "veloera-admin-token",
      userId: "102202603140002",
    },
  },
  {
    siteType: SITE_TYPES.DONE_HUB,
    config: {
      baseUrl: "https://done-hub.example.invalid/",
      adminToken: "done-hub-admin-token",
      userId: "103202603140003",
    },
  },
  {
    siteType: SITE_TYPES.OCTOPUS,
    config: {
      baseUrl: "https://octopus.example.invalid/",
      username: "octopus-admin",
      password: "octopus-password",
    },
  },
  {
    siteType: SITE_TYPES.AXON_HUB,
    config: {
      baseUrl: "https://axonhub.example.invalid/",
      email: "admin@axonhub.example.invalid",
      password: "axonhub-password",
    },
  },
  {
    siteType: SITE_TYPES.CLAUDE_CODE_HUB,
    config: {
      baseUrl: "https://claude-code-hub.example.invalid/",
      adminToken: "claude-code-hub-admin-token",
    },
  },
]

const getTarget = async (runtimeConfig: ManagedSiteRuntimeConfig) =>
  await createManagedSiteTokenBatchImportTarget(runtimeConfig)

const getRawTargetValues = (
  runtimeConfig: ManagedSiteRuntimeConfig,
): string[] => {
  switch (runtimeConfig.siteType) {
    case SITE_TYPES.OCTOPUS:
      return [
        runtimeConfig.config.baseUrl,
        runtimeConfig.config.username,
        runtimeConfig.config.password,
      ]
    case SITE_TYPES.AXON_HUB:
      return [
        runtimeConfig.config.baseUrl,
        runtimeConfig.config.email,
        runtimeConfig.config.password,
      ]
    case SITE_TYPES.CLAUDE_CODE_HUB:
      return [
        runtimeConfig.config.baseUrl,
        "admin",
        runtimeConfig.config.adminToken,
      ]
    default:
      return [
        runtimeConfig.config.baseUrl,
        runtimeConfig.config.userId,
        runtimeConfig.config.adminToken,
      ]
  }
}

const changeCompatibleIdentity = (
  runtimeConfig: ManagedSiteRuntimeConfig,
): ManagedSiteRuntimeConfig | null => {
  switch (runtimeConfig.siteType) {
    case SITE_TYPES.OCTOPUS:
      return {
        ...runtimeConfig,
        config: {
          ...runtimeConfig.config,
          username: "different-octopus-admin",
        },
      }
    case SITE_TYPES.AXON_HUB:
      return {
        ...runtimeConfig,
        config: {
          ...runtimeConfig.config,
          email: "different-admin@axonhub.example.invalid",
        },
      }
    case SITE_TYPES.CLAUDE_CODE_HUB:
      return null
    default:
      return {
        ...runtimeConfig,
        config: { ...runtimeConfig.config, userId: "999202603149999" },
      } as ManagedSiteRuntimeConfig
  }
}

describe("managed-site token batch import target", () => {
  it("covers every managed-site runtime config shape with one captured snapshot", async () => {
    const targets = await Promise.all(runtimeConfigs.map(getTarget))

    expect(runtimeConfigs.map(({ siteType }) => siteType)).toEqual(
      MANAGED_SITE_TYPES,
    )
    targets.forEach((target, index) => {
      const runtimeConfig = runtimeConfigs[index]!
      expect(target.service.siteType).toBe(runtimeConfig.siteType)
      expect(target.config).toBe(runtimeConfig.config)
      expect(target.targetSummary).toEqual({
        siteType: runtimeConfig.siteType,
        baseUrl: runtimeConfig.config.baseUrl.replace(/\/+$/, ""),
        compatibleUserId:
          runtimeConfig.siteType === SITE_TYPES.OCTOPUS
            ? runtimeConfig.config.username
            : runtimeConfig.siteType === SITE_TYPES.AXON_HUB
              ? runtimeConfig.config.email
              : runtimeConfig.siteType === SITE_TYPES.CLAUDE_CODE_HUB
                ? "admin"
                : runtimeConfig.config.userId,
      })
      expect(target.targetFingerprint).toMatch(/^[a-f0-9]{64}$/)
    })
  })

  it("gives equivalent normalized base URLs the same fingerprint", async () => {
    const base: ManagedSiteRuntimeConfig = {
      siteType: SITE_TYPES.NEW_API,
      config: {
        baseUrl: "https://target.example.invalid/api/v1/models?probe=true",
        adminToken: "secret-one",
        userId: "501",
      },
    }
    const equivalent: ManagedSiteRuntimeConfig = {
      siteType: SITE_TYPES.NEW_API,
      config: {
        ...base.config,
        baseUrl: "https://target.example.invalid/api/",
      },
    }

    await expect(getTarget(base)).resolves.toMatchObject({
      targetFingerprint: (await getTarget(equivalent)).targetFingerprint,
    })
  })

  it("changes the fingerprint when site type or normalized URL changes", async () => {
    const base: ManagedSiteRuntimeConfig = {
      siteType: SITE_TYPES.NEW_API,
      config: {
        baseUrl: "https://target.example.invalid/api",
        adminToken: "secret-one",
        userId: "501",
      },
    }
    const baseFingerprint = (await getTarget(base)).targetFingerprint

    const changedTargets: ManagedSiteRuntimeConfig[] = [
      {
        siteType: SITE_TYPES.DONE_HUB,
        config: { ...base.config },
      },
      {
        siteType: SITE_TYPES.NEW_API,
        config: {
          ...base.config,
          baseUrl: "https://other-target.example.invalid/api",
        },
      },
    ]

    for (const changedTarget of changedTargets) {
      expect((await getTarget(changedTarget)).targetFingerprint).not.toBe(
        baseFingerprint,
      )
    }
  })

  it.each(runtimeConfigs.filter(changeCompatibleIdentity))(
    "changes the fingerprint with the configurable compatible identity for $siteType",
    async (runtimeConfig) => {
      const changedRuntimeConfig = changeCompatibleIdentity(runtimeConfig)!

      expect(
        (await getTarget(changedRuntimeConfig)).targetFingerprint,
      ).not.toBe((await getTarget(runtimeConfig)).targetFingerprint)
    },
  )

  it.each(runtimeConfigs)(
    "does not include credentials in the identity for $siteType",
    async (runtimeConfig) => {
      const changedConfig = { ...runtimeConfig.config }
      if ("adminToken" in changedConfig) {
        changedConfig.adminToken = "replacement-admin-token"
      }
      if ("password" in changedConfig) {
        changedConfig.password = "replacement-password"
      }

      const changedTarget = await getTarget({
        siteType: runtimeConfig.siteType,
        config: changedConfig,
      } as ManagedSiteRuntimeConfig)

      expect(changedTarget.targetFingerprint).toBe(
        (await getTarget(runtimeConfig)).targetFingerprint,
      )
    },
  )

  it.each(runtimeConfigs)(
    "keeps raw target identity and credentials out of the $siteType fingerprint",
    async (runtimeConfig) => {
      const target: ManagedSiteTokenBatchImportTarget =
        await getTarget(runtimeConfig)

      for (const rawValue of getRawTargetValues(runtimeConfig)) {
        expect(target.targetFingerprint).not.toContain(rawValue)
      }
    },
  )
})
