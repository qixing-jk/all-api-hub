import type { AccountSiteType } from "~/constants/siteType"
import {
  buildAccountRuntimeKeyAccount,
  buildDisplayAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
  deriveServiceCredentialRuntimeKeyFields,
  formatAccountRuntimeKeySecretForSite,
  isAccountTokenRuntimeKey,
  isServiceCredentialRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { shouldDecorateAccountApiRequestWithAuthSession } from "~/services/accounts/accountSiteProfile"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  canCreateAccountApiTokens,
  canListAccountRuntimeKeys,
} from "~/services/accounts/keyProductCapabilities"
import { accountSub2ApiAuthSession } from "~/services/accounts/sub2apiAuthSession"
import { formatOptionalSkPrefixSiteToken } from "~/services/accountTokens/apiTokenKey"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import type { ServiceCredentialCapability } from "~/services/apiAdapters/contracts/serviceCredential"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import type { TokenProvisioningCapability } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { Sub2ApiAuthSessionRequest } from "~/services/apiService/sub2api/authSession"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import {
  AuthTypeEnum,
  type ApiToken,
  type DisplaySiteData,
  type SiteAccount,
} from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const logger = createLogger("DisplayAccountApiContext")

export const createMissingKeyManagementCapabilityError = (
  siteType: string,
): Error => new Error(`keyManagement is not implemented for ${siteType}`)

export const requireDisplayAccountKeyManagement = (
  account: Pick<DisplaySiteData, "siteType">,
  keyManagement: KeyManagementCapability | undefined,
): KeyManagementCapability => {
  if (!keyManagement) {
    throw createMissingKeyManagementCapabilityError(account.siteType)
  }

  return keyManagement
}

export const createMissingTokenProvisioningCapabilityError = (
  siteType: string,
) => new Error(`tokenProvisioning is not implemented for ${siteType}`)

export const requireDisplayAccountTokenProvisioning = (
  account: Pick<DisplaySiteData, "siteType">,
  tokenProvisioning: TokenProvisioningCapability | undefined,
): TokenProvisioningCapability => {
  if (!tokenProvisioning) {
    throw createMissingTokenProvisioningCapabilityError(account.siteType)
  }

  return tokenProvisioning
}

export class InvalidTokenPayloadError extends Error {
  readonly code = "INVALID_TOKEN_PAYLOAD"
  readonly accountId: string
  readonly baseUrl: string
  readonly siteType: string
  readonly responseType: string

  constructor(params: {
    accountId: string
    baseUrl: string
    siteType: string
    responseType: string
  }) {
    super("invalid_token_payload")
    this.name = "InvalidTokenPayloadError"
    this.accountId = params.accountId
    this.baseUrl = params.baseUrl
    this.siteType = params.siteType
    this.responseType = params.responseType
  }
}

export const getRuntimeKeyInventoryErrorMessage = (
  error: unknown,
  invalidPayloadFallback: string,
) =>
  error instanceof InvalidTokenPayloadError
    ? invalidPayloadFallback
    : getErrorMessage(error)

export const getInvalidTokenPayloadLogContext = (error: unknown) =>
  error instanceof InvalidTokenPayloadError
    ? {
        payloadAccountId: error.accountId,
        payloadBaseUrl: error.baseUrl,
        payloadSiteType: error.siteType,
        payloadResponseType: error.responseType,
      }
    : {}

export class StoredAccountApiContextError extends Error {
  readonly code:
    | "MISSING_ACCOUNT_ID"
    | "ACCOUNT_NOT_FOUND"
    | "MISSING_BASE_URL"
    | "MISSING_USER_ID"
    | "MISSING_CREDENTIAL"

  constructor(code: StoredAccountApiContextError["code"], message: string) {
    super(message)
    this.name = "StoredAccountApiContextError"
    this.code = code
  }
}

export interface DisplayAccountApiSnapshot {
  id: DisplaySiteData["id"]
  name?: DisplaySiteData["name"]
  siteType: DisplaySiteData["siteType"]
  baseUrl: DisplaySiteData["baseUrl"]
  authType: DisplaySiteData["authType"]
  userId: DisplaySiteData["userId"]
  token: DisplaySiteData["token"]
  cookieAuthSessionCookie?: DisplaySiteData["cookieAuthSessionCookie"]
  tagIds?: DisplaySiteData["tagIds"]
}

export interface AccountApiContext {
  accountId: string
  siteType: AccountSiteType
  request: ApiServiceRequest | Sub2ApiAuthSessionRequest
}

export interface DisplayAccountApiCapabilityContext extends AccountApiContext {
  capabilities: SiteTypeCapabilities
  keyManagement: KeyManagementCapability | undefined
  serviceCredential: ServiceCredentialCapability | undefined
  tokenProvisioning: TokenProvisioningCapability | undefined
}

interface StoredAccountApiRequestSource {
  id: SiteAccount["id"]
  site_url: SiteAccount["site_url"]
  site_type: SiteAccount["site_type"]
  authType: SiteAccount["authType"]
  account_info: SiteAccount["account_info"]
  cookieAuth?: SiteAccount["cookieAuth"]
}

interface AccountApiRequestSource {
  id: unknown
  siteUrl: unknown
  siteType: AccountSiteType
  authType: AuthTypeEnum
  userId: unknown
  accessToken: unknown
  cookie: unknown
}

const createAccountApiContextFromSource = (
  source: AccountApiRequestSource,
): AccountApiContext => {
  if (!hasNonEmptyString(source.id)) {
    throw new StoredAccountApiContextError(
      "MISSING_ACCOUNT_ID",
      "account_api_context_missing_account_id",
    )
  }

  if (!hasNonEmptyString(source.siteUrl)) {
    throw new StoredAccountApiContextError(
      "MISSING_BASE_URL",
      "account_api_context_missing_base_url",
    )
  }

  if (!hasNonEmptyString(source.userId)) {
    throw new StoredAccountApiContextError(
      "MISSING_USER_ID",
      "account_api_context_missing_user_id",
    )
  }

  const accessToken =
    typeof source.accessToken === "string" ? source.accessToken : ""
  const cookie = typeof source.cookie === "string" ? source.cookie : undefined

  if (
    source.authType === AuthTypeEnum.None ||
    (source.authType === AuthTypeEnum.AccessToken &&
      !hasNonEmptyString(accessToken))
  ) {
    throw new StoredAccountApiContextError(
      "MISSING_CREDENTIAL",
      "account_api_context_missing_credential",
    )
  }

  if (
    source.authType === AuthTypeEnum.Cookie &&
    !hasNonEmptyString(accessToken) &&
    !hasNonEmptyString(cookie)
  ) {
    throw new StoredAccountApiContextError(
      "MISSING_CREDENTIAL",
      "account_api_context_missing_credential",
    )
  }

  const request: ApiServiceRequest = {
    baseUrl: source.siteUrl,
    accountId: source.id,
    auth: {
      authType: source.authType,
      userId: source.userId,
      accessToken,
      cookie,
    },
  }

  return {
    accountId: source.id,
    siteType: source.siteType,
    request: withDisplayAccountAuthSession(
      { siteType: source.siteType },
      request,
    ),
  }
}

export const createAccountApiRequestFromStoredAccount = (
  account: StoredAccountApiRequestSource,
): AccountApiContext =>
  createAccountApiContextFromSource({
    id: account.id,
    siteUrl: account.site_url,
    siteType: account.site_type,
    authType: account.authType,
    userId: account.account_info?.id,
    accessToken: account.account_info?.access_token ?? "",
    cookie: account.cookieAuth?.sessionCookie,
  })

/**
 * Resolve the latest stored account and build its account API request context.
 */
export async function resolveStoredAccountApiContext(
  accountId: string,
): Promise<AccountApiContext> {
  if (!hasNonEmptyString(accountId)) {
    throw new StoredAccountApiContextError(
      "MISSING_ACCOUNT_ID",
      "account_api_context_missing_account_id",
    )
  }

  const account = await accountStorage.getAccountById(accountId)

  if (!account) {
    throw new StoredAccountApiContextError(
      "ACCOUNT_NOT_FOUND",
      "account_api_context_account_not_found",
    )
  }

  return createAccountApiRequestFromStoredAccount(account)
}

const withDisplayAccountAuthSession = (
  account: Pick<DisplaySiteData, "siteType">,
  request: ApiServiceRequest,
): ApiServiceRequest | Sub2ApiAuthSessionRequest => {
  if (!shouldDecorateAccountApiRequestWithAuthSession(account.siteType)) {
    return request
  }

  return {
    ...request,
    sub2apiAuthSession: accountSub2ApiAuthSession,
  } satisfies Sub2ApiAuthSessionRequest
}

/**
 * Build the request DTO for a display account snapshot.
 */
export const createDisplayAccountRequestContext = (
  account: DisplayAccountApiSnapshot,
): AccountApiContext =>
  createAccountApiContextFromSource({
    id: account.id,
    siteUrl: account.baseUrl,
    siteType: account.siteType,
    authType: account.authType,
    userId: account.userId,
    accessToken: account.token,
    cookie: account.cookieAuthSessionCookie,
  })

/**
 * Resolve the site adapter and request DTO for a display account.
 */
export const createDisplayAccountApiContext = (
  account: DisplayAccountApiSnapshot,
): DisplayAccountApiCapabilityContext => {
  const capabilities = getSiteTypeCapabilities(account.siteType)
  const context = createDisplayAccountRequestContext(account)
  const accountCapabilities = capabilities.account

  return {
    ...context,
    capabilities,
    keyManagement: accountCapabilities?.keyManagement,
    serviceCredential: accountCapabilities?.serviceCredential,
    tokenProvisioning: accountCapabilities?.tokenProvisioning,
  }
}

export interface ResolveDisplayAccountTokenForSecretOptions {
  abortSignal?: AbortSignal
}

/**
 * Fetches the current token inventory for a display account.
 */
export async function fetchDisplayAccountTokens(
  account: DisplayAccountApiSnapshot,
): Promise<ApiToken[]> {
  const { keyManagement, request } = createDisplayAccountApiContext(account)
  const tokensResponse = await requireDisplayAccountKeyManagement(
    account,
    keyManagement,
  ).fetchTokens(request)

  if (Array.isArray(tokensResponse)) {
    return tokensResponse
  }

  logger.warn("Token response is not an array", {
    accountId: account.id,
    baseUrl: account.baseUrl,
    responseType: typeof tokensResponse,
    siteType: account.siteType,
  })

  throw new InvalidTokenPayloadError({
    accountId: account.id,
    baseUrl: account.baseUrl,
    siteType: account.siteType,
    responseType: typeof tokensResponse,
  })
}

/**
 * Fetch account runtime keys for verification/model probing flows.
 *
 * Token CRUD-capable sites use key management inventory. Sites like SharedChat
 * expose an account-bound singleton service key instead, so runtime probes can
 * still verify the key without pretending token CRUD is supported.
 */
export async function fetchDisplayAccountRuntimeKeys(
  account: DisplayAccountApiSnapshot,
): Promise<AccountRuntimeKey[]> {
  const { keyManagement, serviceCredential, request } =
    createDisplayAccountApiContext(account)
  const runtimeKeyAccount = buildAccountRuntimeKeyAccount(account)

  if (keyManagement || !serviceCredential) {
    const tokens = await fetchDisplayAccountTokens(account)
    return tokens.map((token) =>
      buildDisplayAccountTokenRuntimeKey(runtimeKeyAccount, token),
    )
  }

  const credential = await serviceCredential.fetch(request)
  if (!credential.key.trim()) return []

  return [
    buildServiceCredentialRuntimeKey(runtimeKeyAccount, credential, {
      canRotate: typeof serviceCredential.rotate === "function",
    }),
  ]
}

/**
 * Resolves a token into a transient clone with a usable secret key for the
 * current display-account context, without mutating the shared inventory item.
 */
export async function resolveDisplayAccountTokenForSecret<
  TToken extends ApiToken,
>(
  account: DisplayAccountApiSnapshot,
  token: TToken,
  options: ResolveDisplayAccountTokenForSecretOptions = {},
): Promise<TToken> {
  const { keyManagement, serviceCredential, request } =
    createDisplayAccountApiContext(account)
  const resolutionRequest = options.abortSignal
    ? { ...request, abortSignal: options.abortSignal }
    : request
  let resolvedKey: string

  if (keyManagement) {
    resolvedKey = await keyManagement.resolveTokenKey({
      request: resolutionRequest,
      token,
    })
  } else if (serviceCredential) {
    resolvedKey = (await serviceCredential.fetch(resolutionRequest)).key
  } else {
    resolvedKey = await requireDisplayAccountKeyManagement(
      account,
      keyManagement,
    ).resolveTokenKey({ request: resolutionRequest, token })
  }

  return formatOptionalSkPrefixSiteToken(
    resolvedKey === token.key ? token : { ...token, key: resolvedKey },
    account.siteType,
  )
}

/**
 * Resolves a runtime-key clone with the latest usable secret for its source.
 */
export async function resolveDisplayAccountRuntimeKeySecret<
  TRuntimeKey extends AccountRuntimeKey,
>(
  account: DisplayAccountApiSnapshot,
  runtimeKey: TRuntimeKey,
  options: ResolveDisplayAccountTokenForSecretOptions = {},
): Promise<TRuntimeKey> {
  if (isAccountTokenRuntimeKey(runtimeKey)) {
    const resolvedToken = await resolveDisplayAccountTokenForSecret(
      account,
      runtimeKey.token,
      options,
    )
    return formatAccountRuntimeKeySecretForSite({
      ...runtimeKey,
      token: resolvedToken,
      secret: resolvedToken.key,
    })
  }

  if (isServiceCredentialRuntimeKey(runtimeKey)) {
    const { serviceCredential, request } =
      createDisplayAccountApiContext(account)
    const resolutionRequest = options.abortSignal
      ? { ...request, abortSignal: options.abortSignal }
      : request
    if (!serviceCredential) {
      throw new Error(
        `serviceCredential is not implemented for ${account.siteType}`,
      )
    }

    const credential = await serviceCredential.fetch(resolutionRequest)

    return formatAccountRuntimeKeySecretForSite({
      ...runtimeKey,
      credential,
      ...deriveServiceCredentialRuntimeKeyFields(credential, account.baseUrl),
    })
  }

  return runtimeKey
}

/**
 * Guard used by token-management entry points before create/list actions.
 */
export const canManageDisplayAccountTokens = (
  account: DisplaySiteData | null | undefined,
): account is DisplaySiteData => canListAccountRuntimeKeys(account)

/**
 * Guard used by token-creation entry points before showing or enabling create
 * controls. Service-credential-only backends can expose usable runtime keys
 * without supporting token CRUD.
 */
export const canCreateDisplayAccountTokens = (
  account: DisplaySiteData | null | undefined,
): account is DisplaySiteData => canCreateAccountApiTokens(account)
