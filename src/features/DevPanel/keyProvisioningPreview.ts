import { CHECK_IN_SELECTION_MODES } from "~/constants/checkIn"
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { prepareDefaultAccountKeyCreationInSession } from "~/services/accounts/keys/accountKeyCreation"
import {
  createAccountKeyProvisioningPlanner,
  type AccountKeyProvisioningPlan,
} from "~/services/accounts/keys/accountKeyProvisioning"
import { AccountKeyResourceError } from "~/services/apiAdapters/contracts/accountKeyResource"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"

import {
  createKeyProvisioningFixtureSession,
  getKeyProvisioningFixture,
} from "./keyProvisioningFixtures"

export const KEY_PROVISIONING_PREVIEW_SCENARIOS = [
  "normal",
  "single-target",
  "covered",
  "uncertain",
  "option-failure",
  "inventory-failure",
] as const
export type KeyProvisioningPreviewScenario =
  (typeof KEY_PROVISIONING_PREVIEW_SCENARIOS)[number]

export const DEFAULT_PREVIEW_SITE_TYPE = SITE_TYPES.NEW_API

/** Native fixture metadata describes the inputs the shared planner may present. */
export function getKeyProvisioningPreviewProfile(
  siteType: AccountSiteType,
  mode: AccountKeyAutoProvisionMode,
) {
  const resources =
    getSiteTypeCapabilities(siteType).account?.keyResourceManagement
  const fixture = getKeyProvisioningFixture(siteType)
  return {
    supported: Boolean(resources && fixture),
    supportsInput: Boolean(
      fixture?.supportsInputForAllGroups ||
        (mode === "default" &&
          resources?.defaultCreation === "select-requirement"),
    ),
    description:
      !resources || !fixture
        ? "This type uses existing service credentials or does not support key management; no new keys are created."
        : fixture.description ??
          (mode === "all-groups"
            ? "Fill missing group requirements, or prepare one default key when there are no group requirements."
            : "Skip existing valid keys; open the editor for required inputs or multiple candidate groups."),
  }
}

/** Local-only owner: never inserted into account storage or sent to a real adapter session. */
export function createKeyProvisioningPreviewAccount(
  siteType: AccountSiteType,
): DisplaySiteData {
  return {
    id: `dev-key-preview-${siteType}`,
    name: `Preview · ${siteType}`,
    username: "preview",
    baseUrl: "https://key-preview.example.invalid",
    siteType,
    token: "",
    userId: "preview",
    authType: AuthTypeEnum.None,
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    todayStatsAvailability: {
      consumption: { status: "unavailable", reason: "not_collected" },
      requests: { status: "unavailable", reason: "not_collected" },
      tokens: { status: "unavailable", reason: "not_collected" },
      income: { status: "unavailable", reason: "not_collected" },
    },
    health: { status: SiteHealthStatus.Healthy },
    checkIn: {
      automaticExecutionEnabled: false,
      methodKnowledge: { methods: {} },
      selection: { mode: CHECK_IN_SELECTION_MODES.Automatic },
    },
  }
}

/** Real planning runs over local native fixtures; no preview-specific target or entry planning exists. */
export async function prepareKeyProvisioningPreview(
  account: DisplaySiteData,
  mode: AccountKeyAutoProvisionMode,
  options: {
    scenario?: KeyProvisioningPreviewScenario
    delayMs?: number
    signal?: AbortSignal
    onCreated?: (label: string) => void
  } = {},
): Promise<AccountKeyProvisioningPlan> {
  options.signal?.throwIfAborted()
  const resources = getSiteTypeCapabilities(account.siteType).account
    ?.keyResourceManagement
  if (!resources || options.scenario === "inventory-failure")
    throw new AccountKeyResourceError({ code: "unavailable" })
  const session = await createKeyProvisioningFixtureSession(
    account,
    resources,
    mode,
    options,
  )
  return createAccountKeyProvisioningPlanner({
    identity: account.id,
    label: account.name,
    session,
    hasUsableRuntimeKey: async () => options.scenario === "covered",
    prepareDefaultCreation: (operationOptions) =>
      prepareDefaultAccountKeyCreationInSession(
        session,
        resources.defaultCreation ?? "requires-input",
        operationOptions,
      ),
  })(mode, { signal: options.signal })
}
