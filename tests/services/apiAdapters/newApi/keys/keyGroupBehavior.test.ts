import { describe, expect, it } from "vitest"

import type { AccountKeyProvisioningRequirement } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  createNewApiKeyGroupBehavior,
  NEW_API_KEY_GROUP_MODES,
} from "~/services/apiAdapters/newApi/keys/keyGroupBehavior"

const requirement = (
  requirementKey: string,
): AccountKeyProvisioningRequirement => ({
  requirementKey,
  displayName: "Group",
  provisioning: { kind: "automatic" },
})

describe("New API group requirement identity", () => {
  it("decodes a selected requirement produced by group discovery", async () => {
    const behavior = createNewApiKeyGroupBehavior()
    const requirements = await behavior.loadRequirements(
      async () => ({ "team / 中文": { ratio: 1, desc: "Team" } }),
      "Account",
    )
    expect(
      behavior.resolveRequirementGroup(
        requirements,
        "new-api-family:group:team%20%2F%20%E4%B8%AD%E6%96%87",
      ),
    ).toBe("team / 中文")
  })

  it("rejects a validly encoded group that was not discovered", () => {
    expect(() =>
      createNewApiKeyGroupBehavior().resolveRequirementGroup(
        [],
        "new-api-family:group:admin",
      ),
    ).toThrow("invalid_requirement_key")
  })

  it.each([
    "foreign:group:team",
    "new-api-family:group:",
    "new-api-family:group:%",
    "new-api-family:group:%74eam",
  ])("rejects malformed or noncanonical discovered identity %s", (key) => {
    expect(() =>
      createNewApiKeyGroupBehavior().resolveRequirementGroup(
        [requirement(key)],
        key,
      ),
    ).toThrow("invalid_requirement_key")
  })

  it("uses account placement without a group for providers that do not support groups", async () => {
    const behavior = createNewApiKeyGroupBehavior(NEW_API_KEY_GROUP_MODES.None)
    const requirements = await behavior.loadRequirements(async () => {
      throw new Error("must not fetch groups")
    }, "Account")
    expect(
      behavior.resolveRequirementGroup(
        requirements,
        "new-api-family:account-singleton",
      ),
    ).toBe("")
  })
})
