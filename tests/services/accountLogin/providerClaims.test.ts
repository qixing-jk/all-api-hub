import { describe, expect, it } from "vitest"

import { ACCOUNT_LOGIN_PROVIDERS } from "~/constants/accountLogin"
import { SITE_TYPES } from "~/constants/siteType"
import {
  findLoginProviderConflict,
  getLoginProviderClaim,
  getLoginProviderClaimedByAnother,
  getLoginProviderConflictMessageParams,
  resolveLoginProviderClaims,
  resolveLoginProviderOwners,
} from "~/services/accountLogin/providerClaims"
import {
  LOGIN_PROVIDER_EVIDENCE_OUTCOMES,
  type LoginProviderEvidenceMap,
} from "~/services/accountLogin/providerEvidence"
import { AuthTypeEnum } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

/** Distinguishes "leave the login provider unset" from a real provider value. */
const NO_PROVIDER = Symbol("no-provider")

function agentRouterAccount(
  id: string,
  overrides: {
    provider?: unknown
    automaticExecutionEnabled?: boolean
    disabled?: boolean
    siteUrl?: string
  } = {},
) {
  const {
    provider = ACCOUNT_LOGIN_PROVIDERS.Github,
    automaticExecutionEnabled = true,
    disabled = false,
    siteUrl = "https://agentrouter.org",
  } = overrides

  return buildSiteAccount({
    id,
    site_name: `Account ${id}`,
    site_url: siteUrl,
    site_type: SITE_TYPES.NEW_API,
    authType: AuthTypeEnum.AccessToken,
    disabled,
    checkIn: {
      ...buildCheckInConfig({ automaticExecutionEnabled }),
      ...(provider === NO_PROVIDER
        ? {}
        : { loginCheckIn: { provider: provider as never } }),
    },
  })
}

describe("AgentRouter login provider claims", () => {
  it("claims the provider of an enabled automatic AgentRouter account", () => {
    expect(
      getLoginProviderClaim(
        agentRouterAccount("a", {
          provider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
        }),
      ),
    ).toBe(ACCOUNT_LOGIN_PROVIDERS.LinuxDo)
  })

  it("claims the provider of an enabled automatic mirror account", () => {
    expect(
      getLoginProviderClaim(
        agentRouterAccount("a", {
          siteUrl: "https://ps.air-outer.com",
          provider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
        }),
      ),
    ).toBe(ACCOUNT_LOGIN_PROVIDERS.LinuxDo)
  })

  it.each([
    ["a disabled account", { disabled: true }],
    [
      "an account without automatic execution",
      { automaticExecutionEnabled: false },
    ],
    ["an account without a selected provider", { provider: NO_PROVIDER }],
    ["an account with an unknown provider", { provider: "untrusted" }],
    ["another site", { siteUrl: "https://other.example" }],
  ])("does not claim anything for %s", (_case, overrides) => {
    expect(getLoginProviderClaim(agentRouterAccount("a", overrides))).toBeNull()
  })

  it("keeps the lowest account id as the owner of a duplicated claim", () => {
    const owners = resolveLoginProviderOwners([
      agentRouterAccount("b"),
      agentRouterAccount("a"),
      agentRouterAccount("c", {
        provider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
      }),
    ])

    expect(owners.get(ACCOUNT_LOGIN_PROVIDERS.Github)?.id).toBe("a")
    expect(owners.get(ACCOUNT_LOGIN_PROVIDERS.LinuxDo)?.id).toBe("c")
  })

  const evidence = (
    entries: Record<
      string,
      { outcome: "success" | "identity_mismatch"; at: number }
    >,
  ): LoginProviderEvidenceMap =>
    Object.fromEntries(
      Object.entries(entries).map(([id, entry]) => [
        id,
        {
          provider: ACCOUNT_LOGIN_PROVIDERS.Github,
          outcome:
            entry.outcome === "success"
              ? LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success
              : LOGIN_PROVIDER_EVIDENCE_OUTCOMES.IdentityMismatch,
          at: entry.at,
        },
      ]),
    )

  it("prefers an account the browser identity actually logged in as", () => {
    const owners = resolveLoginProviderOwners(
      // The id tiebreak would otherwise pick "a".
      [agentRouterAccount("a"), agentRouterAccount("b")],
      evidence({ b: { outcome: "success", at: 100 } }),
    )

    expect(owners.get(ACCOUNT_LOGIN_PROVIDERS.Github)?.id).toBe("b")
  })

  it("prefers an untried account over one the login rejected", () => {
    const owners = resolveLoginProviderOwners(
      [agentRouterAccount("b"), agentRouterAccount("a")],
      evidence({ a: { outcome: "identity_mismatch", at: 100 } }),
    )

    expect(owners.get(ACCOUNT_LOGIN_PROVIDERS.Github)?.id).toBe("b")
  })

  it("prefers the freshest successful login between two proven accounts", () => {
    const owners = resolveLoginProviderOwners(
      [agentRouterAccount("b"), agentRouterAccount("a")],
      evidence({
        a: { outcome: "success", at: 100 },
        b: { outcome: "success", at: 200 },
      }),
    )

    expect(owners.get(ACCOUNT_LOGIN_PROVIDERS.Github)?.id).toBe("b")
  })

  it("converges on the working account after a rejected first attempt", () => {
    const accounts = [agentRouterAccount("a"), agentRouterAccount("b")]

    // "a" holds the provider by the id tiebreak, then proves the browser
    // identity is not its own. Ownership must move to "b" so it can be tried.
    const afterRejection = resolveLoginProviderOwners(
      accounts,
      evidence({ a: { outcome: "identity_mismatch", at: 1 } }),
    )
    expect(afterRejection.get(ACCOUNT_LOGIN_PROVIDERS.Github)?.id).toBe("b")

    // "b" then proves it does own the identity, so ownership stays put.
    const afterSuccess = resolveLoginProviderOwners(
      accounts,
      evidence({
        a: { outcome: "identity_mismatch", at: 1 },
        b: { outcome: "success", at: 2 },
      }),
    )
    expect(afterSuccess.get(ACCOUNT_LOGIN_PROVIDERS.Github)?.id).toBe("b")
  })

  it("ignores evidence for a provider the account no longer claims", () => {
    const owners = resolveLoginProviderOwners(
      [agentRouterAccount("a"), agentRouterAccount("b")],
      {
        b: {
          provider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
          outcome: LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success,
          at: 100,
        },
      },
    )

    expect(owners.get(ACCOUNT_LOGIN_PROVIDERS.Github)?.id).toBe("a")
  })

  it("promotes the next claim when the owner stops claiming", () => {
    const owners = resolveLoginProviderOwners([
      agentRouterAccount("a", { disabled: true }),
      agentRouterAccount("b"),
      agentRouterAccount("c"),
    ])

    expect(owners.get(ACCOUNT_LOGIN_PROVIDERS.Github)?.id).toBe("b")
  })

  it("names the owner only for the account that does not hold the claim", () => {
    const owner = agentRouterAccount("a")
    const duplicate = agentRouterAccount("b")
    const owners = resolveLoginProviderOwners([owner, duplicate])

    expect(getLoginProviderClaimedByAnother(owner, owners)).toBeNull()
    expect(getLoginProviderClaimedByAnother(duplicate, owners)).toBe(
      ACCOUNT_LOGIN_PROVIDERS.Github,
    )
  })

  it.each([
    ["ownership was not resolved", undefined],
    ["the provider has no owner", new Map()],
  ])("keeps an account unblocked when %s", (_case, owners) => {
    expect(
      getLoginProviderClaimedByAnother(
        agentRouterAccount("a"),
        owners as never,
      ),
    ).toBeNull()
  })

  it("reports a conflict only for the account that does not own the claim", () => {
    const accounts = [agentRouterAccount("a"), agentRouterAccount("b")]
    const claimedGithub = buildCheckInConfig({
      automaticExecutionEnabled: true,
      loginCheckIn: { provider: ACCOUNT_LOGIN_PROVIDERS.Github },
    })

    expect(
      findLoginProviderConflict({
        accounts,
        siteUrl: "https://agentrouter.org",
        checkIn: claimedGithub,
      }),
    ).toMatchObject({ provider: ACCOUNT_LOGIN_PROVIDERS.Github })

    expect(
      findLoginProviderConflict({
        accounts,
        siteUrl: "https://agentrouter.org",
        checkIn: claimedGithub,
        accountId: "a",
      }),
    ).toBeNull()
  })

  it.each([
    [
      "another site",
      {
        siteUrl: "https://other.example",
        checkIn: buildCheckInConfig({
          loginCheckIn: { provider: ACCOUNT_LOGIN_PROVIDERS.Github },
        }),
      },
    ],
    [
      "a config without automatic execution",
      {
        siteUrl: "https://agentrouter.org",
        checkIn: buildCheckInConfig({
          automaticExecutionEnabled: false,
          loginCheckIn: { provider: ACCOUNT_LOGIN_PROVIDERS.Github },
        }),
      },
    ],
    [
      "a config without a provider",
      {
        siteUrl: "https://agentrouter.org",
        checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
      },
    ],
  ])("does not report a conflict for %s", (_case, input) => {
    expect(
      findLoginProviderConflict({
        accounts: [agentRouterAccount("a")],
        ...input,
      }),
    ).toBeNull()
  })

  it("keeps the editing account out of its own claimed provider list", () => {
    const accounts = [
      agentRouterAccount("a"),
      agentRouterAccount("b", {
        provider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
      }),
    ]

    expect(resolveLoginProviderClaims({ accounts, accountId: "a" })).toEqual([
      {
        provider: ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
        owner: { id: "b", site_name: "Account b" },
      },
    ])
  })

  it("names the account that currently holds the claim in the settings UI", () => {
    const accounts = [agentRouterAccount("a"), agentRouterAccount("b")]

    // Before any login attempt the id tiebreak holds the claim.
    expect(resolveLoginProviderClaims({ accounts, accountId: "a" })).toEqual([])

    // Once "b" is the one the browser identity logged in as, editing "a"
    // reports "b" as the holder.
    expect(
      resolveLoginProviderClaims({
        accounts,
        accountId: "a",
        evidence: evidence({ b: { outcome: "success", at: 100 } }),
      }),
    ).toEqual([
      {
        provider: ACCOUNT_LOGIN_PROVIDERS.Github,
        owner: { id: "b", site_name: "Account b" },
      },
    ])
  })

  it("names the provider in the conflict message parameters", () => {
    expect(
      getLoginProviderConflictMessageParams(ACCOUNT_LOGIN_PROVIDERS.LinuxDo),
    ).toEqual({ provider: "Linux DO" })
  })
})
