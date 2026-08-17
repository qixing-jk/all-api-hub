import { describe, expect, it } from "vitest"

import {
  compareCredentialSecret,
  getCredentialAssociationForLocator,
  KEY_CREDENTIAL_ASSOCIATION_STATES,
  KEY_CREDENTIAL_SECRET_MATCHES,
} from "~/features/KeyManagement/credentialAssociations"
import { ACCOUNT_RUNTIME_KEY_SOURCES } from "~/services/accounts/accountRuntimeKeys"
import {
  API_CREDENTIAL_PROFILE_LINK_SOURCES,
  API_CREDENTIAL_PROFILE_LINK_STATES,
  type ApiCredentialProfileLink,
} from "~/types/apiCredentialProfiles"

const locator = {
  source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
  accountId: "account-example",
  siteType: "new-api" as const,
  tokenId: 42,
}

const createLink = (
  overrides: Partial<ApiCredentialProfileLink> = {},
): ApiCredentialProfileLink => ({
  id: "association-example",
  profileId: "profile-example",
  locator,
  state: API_CREDENTIAL_PROFILE_LINK_STATES.Active,
  linkedBy: API_CREDENTIAL_PROFILE_LINK_SOURCES.CreationResponse,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

describe("key credential association presentation", () => {
  it.each([
    ["complete-secret", "complete-secret"],
    ["sk-or-v1-••••example", "sk-or-v1-complete-example"],
    ["sk-maske****************7890", "sk-masked-value-7890"],
  ])("recognizes compatible %s evidence", (target, candidate) => {
    expect(compareCredentialSecret(target, candidate)).toBe(
      target.includes("*") || target.includes("•")
        ? KEY_CREDENTIAL_SECRET_MATCHES.Masked
        : KEY_CREDENTIAL_SECRET_MATCHES.Exact,
    )
  })

  it("rejects a candidate that conflicts with visible masked fragments", () => {
    expect(
      compareCredentialSecret("sk-or-v1-••••example", "sk-other-secret-7890"),
    ).toBe(KEY_CREDENTIAL_SECRET_MATCHES.Mismatch)
  })

  it.each(["", "****************", "••••••••"])(
    "keeps insufficient masked evidence unknown: %s",
    (target) => {
      expect(compareCredentialSecret(target, "complete-secret")).toBe(
        KEY_CREDENTIAL_SECRET_MATCHES.Unknown,
      )
    },
  )

  it("returns one navigable linked profile for a unique active pair", () => {
    expect(getCredentialAssociationForLocator([createLink()], locator)).toEqual(
      {
        status: KEY_CREDENTIAL_ASSOCIATION_STATES.Linked,
        associationId: "association-example",
        profileId: "profile-example",
      },
    )
  })

  it("fails closed when matching links require confirmation or conflict", () => {
    expect(
      getCredentialAssociationForLocator(
        [
          createLink({
            state: API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation,
          }),
        ],
        locator,
      ),
    ).toEqual({ status: KEY_CREDENTIAL_ASSOCIATION_STATES.NeedsConfirmation })

    expect(
      getCredentialAssociationForLocator(
        [createLink(), createLink({ id: "association-conflict" })],
        locator,
      ),
    ).toEqual({ status: KEY_CREDENTIAL_ASSOCIATION_STATES.NeedsConfirmation })
  })

  it("does not use a link that belongs to another account", () => {
    expect(
      getCredentialAssociationForLocator([createLink()], {
        ...locator,
        accountId: "another-account",
      }),
    ).toEqual({ status: KEY_CREDENTIAL_ASSOCIATION_STATES.Unlinked })
  })
})
