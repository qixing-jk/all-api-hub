import type {
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
} from "~/services/accountTokens/tokenProvisioningModel"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken } from "~/types"

export type FetchAccountTokensOptions = {
  page?: number
  size?: number
}

export type ResolveTokenSecretRequest<
  TToken extends Pick<ApiToken, "id" | "key"> = Pick<ApiToken, "id" | "key">,
> = {
  request: ApiServiceRequest
  token: TToken
}

export type DeleteTokenRequest = {
  request: ApiServiceRequest
  tokenId: number
}

export type UpdateTokenRequest = {
  request: ApiServiceRequest
  tokenId: number
  tokenData: CreateTokenRequest
}

export type UserGroupsCapability = {
  fetch(request: ApiServiceRequest): Promise<Record<string, UserGroupInfo>>
}

export const INVENTORY_GROUP_KINDS = {
  Named: "named",
  FollowsAccount: "follows-account",
  Ungrouped: "ungrouped",
  Unavailable: "unavailable",
  NotApplicable: "not-applicable",
  Unknown: "unknown",
} as const

export type InventoryGroupKind =
  (typeof INVENTORY_GROUP_KINDS)[keyof typeof INVENTORY_GROUP_KINDS]

export type InventoryGroupState =
  | {
      kind: typeof INVENTORY_GROUP_KINDS.Named
      name: string
    }
  | {
      kind: Exclude<InventoryGroupKind, typeof INVENTORY_GROUP_KINDS.Named>
    }

export type InventoryGroupToken = Pick<ApiToken, "group"> & {
  sub2api_group_id?: number | null
}

export type InventoryGroupCapability = {
  resolve(token: InventoryGroupToken): InventoryGroupState
}

export const resolveNamedInventoryGroup = (
  token: InventoryGroupToken,
  emptyKind: Exclude<InventoryGroupKind, typeof INVENTORY_GROUP_KINDS.Named>,
): InventoryGroupState => {
  const name = token.group?.trim()

  return name
    ? { kind: INVENTORY_GROUP_KINDS.Named, name }
    : { kind: emptyKind }
}

export const INVENTORY_SECRET_AVAILABILITIES = {
  Recoverable: "recoverable",
  CreateResponseOnly: "create-response-only",
  Unavailable: "unavailable",
} as const

export type InventorySecretAvailability =
  (typeof INVENTORY_SECRET_AVAILABILITIES)[keyof typeof INVENTORY_SECRET_AVAILABILITIES]

export type KeyManagementCapability = {
  fetchTokens(
    request: ApiServiceRequest,
    options?: FetchAccountTokensOptions,
  ): Promise<ApiToken[]>
  fetchAllTokens?(request: ApiServiceRequest): Promise<ApiToken[]>
  createToken(
    request: ApiServiceRequest,
    tokenData: CreateTokenRequest,
  ): Promise<CreateTokenResult>
  updateToken(request: UpdateTokenRequest): Promise<boolean | void>
  resolveTokenKey<TToken extends Pick<ApiToken, "id" | "key">>(
    request: ResolveTokenSecretRequest<TToken>,
  ): Promise<string>
  deleteToken(request: DeleteTokenRequest): Promise<boolean | void>
  fetchAvailableModels(request: ApiServiceRequest): Promise<string[]>
  inventorySecretAvailability?: InventorySecretAvailability
  inventoryGroup?: InventoryGroupCapability
  userGroups?: UserGroupsCapability
}

export const getInventorySecretAvailability = (
  capability: Pick<KeyManagementCapability, "inventorySecretAvailability">,
): InventorySecretAvailability =>
  capability.inventorySecretAvailability ??
  INVENTORY_SECRET_AVAILABILITIES.Recoverable
