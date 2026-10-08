import {
  ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS,
  ACCOUNT_KEY_PROVISIONING_PLACEMENT_KINDS as placementKinds,
  ACCOUNT_KEY_PROVISIONING_UNKNOWN_PLACEMENT_REASONS as unknownReasons,
  type AccountKeyProvisioningPlacement,
  type AccountKeyProvisioningRequirement,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { NewApiFamilyTokenTransport } from "~/services/apiAdapters/newApi/keys/keyVariant"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"

const SINGLETON_REQUIREMENT_KEY = "new-api-family:account-singleton"
const GROUP_REQUIREMENT_PREFIX = "new-api-family:group:"

export const NEW_API_KEY_GROUP_MODES = {
  None: "none",
  Optional: "optional",
  Required: "required",
} as const

type NewApiKeyGroupMode =
  (typeof NEW_API_KEY_GROUP_MODES)[keyof typeof NEW_API_KEY_GROUP_MODES]

/** Encodes upstream group names into stable opaque requirement identities. */
const encodeGroupRequirementKey = (group: string): string =>
  `${GROUP_REQUIREMENT_PREFIX}${encodeURIComponent(group)}`

/** Keeps requirements, placement and editor group rules behind one family seam. */
export function createNewApiKeyGroupBehavior(
  mode: NewApiKeyGroupMode = NEW_API_KEY_GROUP_MODES.Optional,
) {
  return {
    editable: mode !== NEW_API_KEY_GROUP_MODES.None,
    nullable: mode === NEW_API_KEY_GROUP_MODES.Optional,
    followsAccount: mode !== NEW_API_KEY_GROUP_MODES.None,
    async loadRequirements(
      loadGroups: () => ReturnType<
        NewApiFamilyTokenTransport["fetchUserGroups"]
      >,
      accountName: string,
    ): Promise<readonly AccountKeyProvisioningRequirement[]> {
      if (mode === NEW_API_KEY_GROUP_MODES.None) {
        return [
          {
            requirementKey: SINGLETON_REQUIREMENT_KEY,
            displayName: accountName,
            provisioning: {
              kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
            },
          },
        ]
      }
      const groups = Object.keys(await loadGroups())
        .map((group) => group.trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))
      if (new Set(groups).size !== groups.length)
        throw new Error("duplicate_group_requirement")
      return groups.map((group) => ({
        requirementKey: encodeGroupRequirementKey(group),
        displayName: group,
        provisioning: {
          kind: ACCOUNT_KEY_REQUIREMENT_PROVISIONING_KINDS.Automatic,
        },
      }))
    },
    resolveRequirementGroup(
      requirements: readonly AccountKeyProvisioningRequirement[],
      requirementKey: string,
    ): string {
      if (
        !requirements.some((entry) => entry.requirementKey === requirementKey)
      )
        throw new Error("invalid_requirement_key")
      if (mode === NEW_API_KEY_GROUP_MODES.None) return ""
      if (!requirementKey.startsWith(GROUP_REQUIREMENT_PREFIX))
        throw new Error("invalid_requirement_key")
      try {
        const group = decodeURIComponent(
          requirementKey.slice(GROUP_REQUIREMENT_PREFIX.length),
        )
        if (!group || encodeGroupRequirementKey(group) !== requirementKey)
          throw new Error("invalid_requirement_key")
        return group
      } catch {
        throw new Error("invalid_requirement_key")
      }
    },
    resolvePlacement(
      token: NewApiToken,
      requirementByName: ReadonlyMap<string, string>,
      inheritedGroup: string | null,
    ): AccountKeyProvisioningPlacement {
      if (mode === NEW_API_KEY_GROUP_MODES.None)
        return {
          kind: placementKinds.Requirement,
          requirementKeys: [SINGLETON_REQUIREMENT_KEY],
        }
      const group = token.group?.trim() || ""
      const effectiveGroup = group || inheritedGroup || ""
      const requirementKey = requirementByName.get(effectiveGroup)
      if (requirementKey)
        return {
          kind: placementKinds.Requirement,
          requirementKeys: [requirementKey],
        }
      if (group)
        return {
          kind: placementKinds.Orphaned,
          placementKey: encodeGroupRequirementKey(group),
          displayName: group,
        }
      return {
        kind: placementKinds.Unknown,
        reasonCode: unknownReasons.InheritedAccountGroupUnavailable,
      }
    },
    matchesCreatedPlacement(
      token: NewApiToken,
      requirementKey: string,
    ): boolean {
      return mode === NEW_API_KEY_GROUP_MODES.None
        ? requirementKey === SINGLETON_REQUIREMENT_KEY
        : encodeGroupRequirementKey(token.group?.trim() || "") ===
            requirementKey
    },
  }
}
