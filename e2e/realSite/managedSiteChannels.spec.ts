import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import type { UserPreferences } from "~/services/preferences/preferencesSchema"
import { test } from "~~/e2e/fixtures/extensionTest"
import {
  buildManagedSiteE2ePrefix,
  runManagedSiteChannelsCrudScenario,
  runManagedSiteCredentialImportScenario,
} from "~~/e2e/scenarios/managedSiteChannels"
import { runNewApiAdvancedChannelScenario } from "~~/e2e/scenarios/newApiAdvancedChannel"
import { runNewApiMultiKeyRealSiteScenario } from "~~/e2e/scenarios/newApiMultiKeyRealSite"
import { runRealSiteMultiKeyEditorScenario } from "~~/e2e/scenarios/realSiteMultiKeyEditor"
import {
  forceExtensionLanguage,
  seedUserPreferences,
  stubLlmMetadataIndex,
} from "~~/e2e/utils/commonUserFlows"
import { getServiceWorker } from "~~/e2e/utils/extensionState"
import { buildRealSiteRunId } from "~~/e2e/utils/realSite/keyManagement"
import {
  getManagedSiteRealSiteSkipReason,
  resolveAxonHubManagedSiteConfig,
  resolveClaudeCodeHubManagedSiteConfig,
  resolveDoneHubManagedSiteConfig,
  resolveNewApiManagedSiteConfig,
  resolveOctopusManagedSiteConfig,
  resolveOmniRouteManagedSiteConfig,
  resolveSub2ApiManagedSiteConfig,
  resolveVeloeraManagedSiteConfig,
} from "~~/e2e/utils/realSite/managedSiteConfig"
import { readEnv } from "~~/e2e/utils/realSite/shared"
import { resolveRealSiteUpstream } from "~~/scripts/utils/real-site-upstream.mjs"

// Authenticated channel details must not enter diagnostic artifacts.
test.use({ trace: "off", video: "off", screenshot: "off" })

type ManagedSiteE2eTarget = {
  label: string
  siteType: ManagedSiteType
  preferenceKey: keyof UserPreferences
  resolveConfig: () => unknown
}

const managedSiteTargets = [
  {
    label: "New API",
    siteType: SITE_TYPES.NEW_API,
    preferenceKey: "newApi",
    resolveConfig: resolveNewApiManagedSiteConfig,
  },
  {
    label: "Veloera",
    siteType: SITE_TYPES.VELOERA,
    preferenceKey: "veloera",
    resolveConfig: resolveVeloeraManagedSiteConfig,
  },
  {
    label: "DoneHub",
    siteType: SITE_TYPES.DONE_HUB,
    preferenceKey: "doneHub",
    resolveConfig: resolveDoneHubManagedSiteConfig,
  },
  {
    label: "Octopus",
    siteType: SITE_TYPES.OCTOPUS,
    preferenceKey: "octopus",
    resolveConfig: resolveOctopusManagedSiteConfig,
  },
  {
    label: "AxonHub",
    siteType: SITE_TYPES.AXON_HUB,
    preferenceKey: "axonHub",
    resolveConfig: resolveAxonHubManagedSiteConfig,
  },
  {
    label: "Claude Code Hub",
    siteType: SITE_TYPES.CLAUDE_CODE_HUB,
    preferenceKey: "claudeCodeHub",
    resolveConfig: resolveClaudeCodeHubManagedSiteConfig,
  },
  {
    label: "Sub2API",
    siteType: SITE_TYPES.SUB2API,
    preferenceKey: "sub2apiManagedSite",
    resolveConfig: resolveSub2ApiManagedSiteConfig,
  },
  {
    label: "OmniRoute",
    siteType: SITE_TYPES.OMNIROUTE,
    preferenceKey: "omniroute",
    resolveConfig: resolveOmniRouteManagedSiteConfig,
  },
] as const satisfies readonly ManagedSiteE2eTarget[]

const selectedManagedSiteTarget = readEnv("AAH_E2E_MANAGED_SITE_TARGET")
const selectedManagedSiteTargets = managedSiteTargets.filter(
  (candidate) =>
    !selectedManagedSiteTarget ||
    selectedManagedSiteTarget === candidate.siteType,
)

if (selectedManagedSiteTarget && selectedManagedSiteTargets.length === 0) {
  throw new Error(
    `AAH_E2E_MANAGED_SITE_TARGET=${selectedManagedSiteTarget} does not match any managed-site E2E target. Expected one of: ${managedSiteTargets
      .map((target) => target.siteType)
      .join(", ")}`,
  )
}

test.describe.configure({
  mode: "parallel",
})

test.describe("real-site E2E: managed-site channel management", () => {
  test.beforeEach(async ({ context, page }) => {
    await forceExtensionLanguage(page, "en")
    await stubLlmMetadataIndex(context)
  })

  for (const target of selectedManagedSiteTargets) {
    const managedSite = target.resolveConfig()
    const credentialImportTestName = `${target.label} imports standalone credentials and detects duplicates`

    if (target.siteType === SITE_TYPES.NEW_API) {
      test("New API persists multi-key edits and cleans temporary channels", async ({
        context,
        page,
        extensionId,
      }) => {
        test.setTimeout(180_000)
        const resolved = resolveNewApiManagedSiteConfig()
        test.skip(!resolved.config, "New API real-site environment is missing")
        if (!resolved.config) return
        await seedUserPreferences(await getServiceWorker(context), {
          managedSiteType: SITE_TYPES.NEW_API,
          newApi: resolved.config,
          autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
          openChangelogOnUpdate: false,
        })
        await runNewApiMultiKeyRealSiteScenario({
          context,
          page,
          extensionId,
          config: resolved.config,
        })
      })
      test.describe("New API advanced persistence", () => {
        test("saves and clears advanced fields without losing unrelated settings", async ({
          context,
          page,
          extensionId,
        }) => {
          test.setTimeout(120_000)
          const resolved = resolveNewApiManagedSiteConfig()
          test.skip(
            !resolved.config,
            "New API real-site environment is missing",
          )
          if (!resolved.config) return
          await seedUserPreferences(await getServiceWorker(context), {
            managedSiteType: SITE_TYPES.NEW_API,
            newApi: resolved.config,
            autoFillCurrentSiteUrlOnAccountAdd: false,
            autoProvisionKeyOnAccountAdd: false,
            openChangelogOnUpdate: false,
          })
          await runNewApiAdvancedChannelScenario({
            context,
            page,
            extensionId,
            config: resolved.config,
          })
        })
      })
    }

    if (!managedSite.config) {
      const skipReason = getManagedSiteRealSiteSkipReason({
        label: target.label,
        missingEnvKeys: managedSite.missingEnvKeys,
      })

      if (
        target.siteType === SITE_TYPES.AXON_HUB ||
        target.siteType === SITE_TYPES.OCTOPUS
      ) {
        test.skip(
          `${target.label} persists multi-key edits and cleans temporary channels`,
          { annotation: { type: "skip", description: skipReason } },
          async () => {},
        )
      }
      test.skip(
        `${target.label} covers channel CRUD/search`,
        { annotation: { type: "skip", description: skipReason } },
        async () => {},
      )
      test.skip(
        credentialImportTestName,
        { annotation: { type: "skip", description: skipReason } },
        async () => {},
      )
      test.skip(
        `${target.label} preserves unrelated fields after renaming`,
        { annotation: { type: "skip", description: skipReason } },
        async () => {},
      )
      continue
    }

    if (
      target.siteType === SITE_TYPES.AXON_HUB ||
      target.siteType === SITE_TYPES.OCTOPUS
    ) {
      test(`${target.label} persists multi-key edits and cleans temporary channels`, async ({
        context,
        page,
        extensionId,
      }) => {
        test.setTimeout(180_000)
        const config = managedSite.config!
        await seedUserPreferences(await getServiceWorker(context), {
          managedSiteType: target.siteType,
          [target.preferenceKey]: config,
          autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
          openChangelogOnUpdate: false,
        })
        const supported = await runRealSiteMultiKeyEditorScenario({
          page,
          extensionId,
          siteType: target.siteType as
            | typeof SITE_TYPES.AXON_HUB
            | typeof SITE_TYPES.OCTOPUS,
          baseUrl: config.baseUrl,
        })
        test.skip(
          !supported,
          "This Octopus deployment exposes the single-key protocol",
        )
      })
    }

    test(`${target.label} covers channel CRUD/search`, async ({
      context,
      extensionId,
      page,
    }) => {
      const serviceWorker = await getServiceWorker(context)
      const config = managedSite.config!
      const runId = buildRealSiteRunId()
      const runPrefix = buildManagedSiteE2ePrefix({
        label: target.label.replace(/\s+/g, ""),
        runId,
      })

      await seedUserPreferences(serviceWorker, {
        managedSiteType: target.siteType,
        [target.preferenceKey]: config,
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        openChangelogOnUpdate: false,
      })

      await runManagedSiteChannelsCrudScenario({
        page,
        extensionId,
        siteType: target.siteType,
        label: target.label,
        runPrefix,
      })
    })

    test(`${target.label} preserves unrelated fields after renaming`, async ({
      context,
      extensionId,
      page,
    }) => {
      const config = managedSite.config!
      const runPrefix = buildManagedSiteE2ePrefix({
        label: `${target.label.replace(/\s+/g, "")} Preserve`,
        runId: buildRealSiteRunId(),
      })
      await seedUserPreferences(await getServiceWorker(context), {
        managedSiteType: target.siteType,
        [target.preferenceKey]: config,
        autoFillCurrentSiteUrlOnAccountAdd: false,
        autoProvisionKeyOnAccountAdd: false,
        openChangelogOnUpdate: false,
      })
      await runManagedSiteChannelsCrudScenario({
        page,
        extensionId,
        siteType: target.siteType,
        label: target.label,
        runPrefix,
        cleanupPrefix: runPrefix,
        verifyRenamePreservation: { baseUrl: config.baseUrl },
      })
    })

    test(
      credentialImportTestName,
      async ({ context, extensionId, page }, testInfo) => {
        test.setTimeout(180_000)
        const upstream = resolveRealSiteUpstream()
        test.skip(
          !upstream.config,
          `Shared inference credentials missing: ${upstream.missingEnvKeys.join(", ")}`,
        )
        if (!upstream.config) return
        const runPrefix = buildManagedSiteE2ePrefix({
          label: `${target.label.replace(/\s+/g, "")} Import`,
          runId: buildRealSiteRunId(),
        })
        await testInfo.attach("temporary-resources", {
          body: JSON.stringify({ channelPrefix: runPrefix }),
          contentType: "application/json",
        })
        await seedUserPreferences(await getServiceWorker(context), {
          managedSiteType: target.siteType,
          [target.preferenceKey]: managedSite.config,
          autoCheckin: { globalEnabled: false, pretriggerDailyOnUiOpen: false },
          openChangelogOnUpdate: false,
        })
        await runManagedSiteCredentialImportScenario({
          page,
          extensionId,
          siteType: target.siteType,
          label: target.label,
          runPrefix,
          upstream: upstream.config,
        })
      },
    )
  }
})
