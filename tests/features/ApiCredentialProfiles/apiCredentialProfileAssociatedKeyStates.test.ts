import { describe, expect, it } from "vitest"

import { buildApiCredentialProfileAssociatedKeyStates } from "~/features/ApiCredentialProfiles/utils/apiCredentialProfileAssociatedKeyStates"
import { API_CREDENTIAL_PROFILE_LINK_STATES } from "~/types/apiCredentialProfiles"

function createLink(
  id: string,
  profileId: string,
  state:
    | "active"
    | "needs-confirmation" = API_CREDENTIAL_PROFILE_LINK_STATES.Active,
) {
  return {
    id,
    profileId,
    state,
    locator: {
      source: "account_token" as const,
      accountId: "account-example",
      siteType: "new-api" as const,
      tokenId: Number(id.at(-1)),
    },
    linkedBy: "user" as const,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe("buildApiCredentialProfileAssociatedKeyStates", () => {
  it("exposes one active association as an exact key deep link", () => {
    expect(
      buildApiCredentialProfileAssociatedKeyStates(
        [createLink("association-1", "profile-1")],
        new Map([["account-example", "Example account"]]),
      ),
    ).toEqual({
      "profile-1": {
        status: "linked",
        items: [
          expect.objectContaining({
            associationId: "association-1",
            accountName: "Example account",
            locator: expect.objectContaining({ tokenId: 1 }),
            state: API_CREDENTIAL_PROFILE_LINK_STATES.Active,
          }),
        ],
      },
    })
  })

  it("keeps multiple active remote resources linked to one credential", () => {
    expect(
      buildApiCredentialProfileAssociatedKeyStates([
        createLink(
          "association-1",
          "profile-1",
          API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation,
        ),
        createLink("association-2", "profile-2"),
        createLink("association-3", "profile-2"),
      ]),
    ).toEqual({
      "profile-1": {
        status: "needs-confirmation",
        items: [expect.objectContaining({ associationId: "association-1" })],
      },
      "profile-2": {
        status: "linked",
        items: [
          expect.objectContaining({ associationId: "association-2" }),
          expect.objectContaining({ associationId: "association-3" }),
        ],
      },
    })
  })

  it("keeps locator-only fallback when the local account no longer exists", () => {
    const state = buildApiCredentialProfileAssociatedKeyStates([
      createLink("association-1", "profile-1"),
    ])

    expect(state["profile-1"]?.items[0]).not.toHaveProperty("accountName")
  })
})
