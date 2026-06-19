import type {
  ApiServiceRequest,
  CreateTokenRequest,
  CreateTokenResult,
  UserGroupInfo,
} from "~/services/apiService/common/type"
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

export type KeyManagementCapability = {
  fetchTokens(
    request: ApiServiceRequest,
    options?: FetchAccountTokensOptions,
  ): Promise<ApiToken[]>
  createToken(
    request: ApiServiceRequest,
    tokenData: CreateTokenRequest,
  ): Promise<CreateTokenResult>
  resolveTokenKey<TToken extends Pick<ApiToken, "id" | "key">>(
    request: ResolveTokenSecretRequest<TToken>,
  ): Promise<string>
  deleteToken(request: DeleteTokenRequest): Promise<boolean | void>
  fetchUserGroups(
    request: ApiServiceRequest,
  ): Promise<Record<string, UserGroupInfo>>
  fetchAvailableModels(request: ApiServiceRequest): Promise<string[]>
}
