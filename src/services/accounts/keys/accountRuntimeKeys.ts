import type { AccountSiteType } from "~/constants/siteType"
import { isProviderConfirmedAccountCredential } from "~/services/accounts/keys/accountCredentialIdentityFacts"
import {
  UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
  type AccountRuntimeKeyModelAccess,
} from "~/services/accounts/keys/runtimeKeyModelAccess"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import {
  formatOptionalSkPrefixSiteTokenAuthKey,
  formatOptionalSkPrefixSiteTokenComparableKey,
  hasOptionalSkPrefixSiteTokenSemantics,
} from "~/services/accountTokens/apiTokenKey"
import type { KeyMaskEvidence } from "~/services/accountTokens/keyMaskEvidence"
import {
  ACCOUNT_KEY_RESOURCE_STATUSES,
  type AccountKeyResourceFacts,
  type AccountKeyResourceRef,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import { DEFAULT_MODEL_GROUP } from "~/services/models/constants"
import type { DisplaySiteData } from "~/types"

export const ACCOUNT_RUNTIME_KEY_SOURCES = {
  AccountToken: "account_token",
  AccountKeyResource: "account_key_resource",
  ServiceCredential: "service_credential",
} as const

type AccountRuntimeKeySource =
  (typeof ACCOUNT_RUNTIME_KEY_SOURCES)[keyof typeof ACCOUNT_RUNTIME_KEY_SOURCES]

/** Provider-neutral persisted identity for one account runtime key source. */
export type AccountRuntimeKeyLocator =
  | {
      readonly source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken
      readonly accountId: string
      readonly siteType: AccountSiteType
      readonly tokenId: number
    }
  | {
      readonly source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource
      readonly ref: AccountKeyResourceRef
    }
  | {
      readonly source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential
      readonly accountId: string
      readonly siteType: AccountSiteType
      readonly service: AccountServiceCredential["service"]
    }

/** Returns the owning local account id for every persisted key locator shape. */
export const getAccountRuntimeKeyLocatorAccountId = (
  locator: AccountRuntimeKeyLocator,
): string =>
  locator.source === ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource
    ? locator.ref.accountId
    : locator.accountId

/** Returns a stable provider-neutral identity for one persisted key locator. */
export const getAccountRuntimeKeyLocatorIdentity = (
  locator: AccountRuntimeKeyLocator,
): string => {
  switch (locator.source) {
    case ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken: {
      // Released account-token associations refer to these providers' single
      // account scope. Preserve their identity when inventory becomes native.
      const legacyScope = getAccountSiteDefinition(
        locator.siteType,
      )?.legacyAccountTokenScope
      if (legacyScope) {
        return JSON.stringify([
          ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
          locator.accountId,
          locator.siteType,
          legacyScope,
          String(locator.tokenId),
        ])
      }
      return JSON.stringify([
        locator.source,
        locator.accountId,
        locator.siteType,
        locator.tokenId,
      ])
    }
    case ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource:
      return JSON.stringify([
        locator.source,
        locator.ref.accountId,
        locator.ref.siteType,
        locator.ref.scopeKey,
        locator.ref.resourceId,
      ])
    case ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential:
      return JSON.stringify([
        locator.source,
        locator.accountId,
        locator.siteType,
        locator.service,
      ])
  }
}

/** Compares two locators without exposing provider-specific values to callers. */
export const isAccountRuntimeKeyLocatorEqual = (
  left: AccountRuntimeKeyLocator,
  right: AccountRuntimeKeyLocator,
) =>
  getAccountRuntimeKeyLocatorIdentity(left) ===
  getAccountRuntimeKeyLocatorIdentity(right)

export const ACCOUNT_RUNTIME_KEY_STATUSES = {
  Active: "active",
  Inactive: "inactive",
  Unknown: "unknown",
} as const

type AccountRuntimeKeyStatus =
  (typeof ACCOUNT_RUNTIME_KEY_STATUSES)[keyof typeof ACCOUNT_RUNTIME_KEY_STATUSES]

type AccountRuntimeKeyAccount = Pick<
  DisplaySiteData,
  | "authType"
  | "baseUrl"
  | "cookieAuthSessionCookie"
  | "id"
  | "name"
  | "siteType"
  | "tagIds"
  | "token"
  | "userId"
>

type AccountRuntimeKeyAccountSource = Omit<
  AccountRuntimeKeyAccount,
  "name" | "tagIds"
> &
  Partial<Pick<AccountRuntimeKeyAccount, "name" | "tagIds">>

type AccountRuntimeKeyCapabilities = {
  copy: boolean
  export: boolean
  verify: boolean
  fetchRuntimeModels: boolean
  rotate: boolean
  updateToken: boolean
  deleteToken: boolean
  /**
   * Whether the provider treats this credential as an inference key.
   *
   * Management keys can often call inference endpoints too, but they carry
   * authority over other credentials. Excluding them keeps selection, export
   * and default provisioning on ordinary inference keys.
   */
  inference: boolean
}

type AccountRuntimeKeyBase = {
  id: string
  source: AccountRuntimeKeySource
  account: AccountRuntimeKeyAccount
  accountId: string
  accountName: string
  siteType: AccountSiteType
  label: string
  secret: string
  keyMask?: KeyMaskEvidence
  baseUrl: string
  status: AccountRuntimeKeyStatus
  capabilities: AccountRuntimeKeyCapabilities
  modelAccess: AccountRuntimeKeyModelAccess
  createdAt?: number
  notes?: string
}

export type ServiceCredentialRuntimeKey = AccountRuntimeKeyBase & {
  source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential
  service: AccountServiceCredential["service"]
  credential: AccountServiceCredential
}

export type AccountKeyResourceRuntimeKey = AccountRuntimeKeyBase & {
  source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource
  resourceRef: AccountKeyResourceRef
  legacyTokenId?: number
  /** True when this resource is the credential the account itself uses. */
  accountCredential?: boolean
}

export type AccountRuntimeKey =
  | AccountKeyResourceRuntimeKey
  | ServiceCredentialRuntimeKey

/** Projects a runtime key into its provider-neutral persisted identity. */
export const getAccountRuntimeKeyLocator = (
  runtimeKey: AccountRuntimeKey,
): AccountRuntimeKeyLocator => {
  switch (runtimeKey.source) {
    case ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource:
      return { source: runtimeKey.source, ref: runtimeKey.resourceRef }
    case ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential:
      return {
        source: runtimeKey.source,
        accountId: runtimeKey.accountId,
        siteType: runtimeKey.siteType,
        service: runtimeKey.service,
      }
  }
}

const buildServiceCredentialRuntimeKeyId = (
  accountId: string,
  service: AccountServiceCredential["service"],
) => `${ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential}:${accountId}:${service}`

const encodeRuntimeKeyIdentityPart = (value: string) =>
  encodeURIComponent(value)

export const buildAccountKeyResourceRuntimeKeyId = (
  ref: AccountKeyResourceRef,
) =>
  [
    ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
    ref.accountId,
    ref.siteType,
    ref.scopeKey,
    ref.resourceId,
  ]
    .map(encodeRuntimeKeyIdentityPart)
    .join(":")

/** Builds a collision-safe resource identity scoped to one managed-site target. */
export const buildTargetScopedAccountKeyResourceId = (
  targetFingerprint: string,
  ref: AccountKeyResourceRef,
) =>
  JSON.stringify([targetFingerprint, buildAccountKeyResourceRuntimeKeyId(ref)])

export const buildAccountRuntimeKeyAccount = (
  account: AccountRuntimeKeyAccountSource,
): AccountRuntimeKeyAccount => ({
  ...account,
  name: account.name || account.id,
  tagIds: account.tagIds ?? [],
})

export const deriveServiceCredentialRuntimeKeyFields = (
  credential: AccountServiceCredential,
  fallbackBaseUrl: string,
) => ({
  secret: credential.isAuthenticated ? credential.key : "",
  baseUrl: credential.baseUrl || fallbackBaseUrl,
  status: credential.isAuthenticated
    ? ACCOUNT_RUNTIME_KEY_STATUSES.Active
    : ACCOUNT_RUNTIME_KEY_STATUSES.Inactive,
})

export const isServiceCredentialRuntimeKey = (
  runtimeKey: AccountRuntimeKey,
): runtimeKey is ServiceCredentialRuntimeKey =>
  runtimeKey.source === ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential

export const isAccountKeyResourceRuntimeKey = (
  runtimeKey: AccountRuntimeKey,
): runtimeKey is AccountKeyResourceRuntimeKey =>
  runtimeKey.source === ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource

export const hasUsableAccountRuntimeKeySecret = (
  runtimeKey: Pick<AccountRuntimeKey, "secret" | "status">,
) =>
  runtimeKey.status === ACCOUNT_RUNTIME_KEY_STATUSES.Active &&
  runtimeKey.secret.trim().length > 0

const isActiveAccountRuntimeKey = (
  runtimeKey: Pick<AccountRuntimeKey, "status">,
) => runtimeKey.status === ACCOUNT_RUNTIME_KEY_STATUSES.Active

export const isSelectableAccountRuntimeKey = (runtimeKey: AccountRuntimeKey) =>
  isAccountKeyResourceRuntimeKey(runtimeKey) ||
  hasUsableAccountRuntimeKeySecret(runtimeKey)

/** Whether the credential may serve inference requests, not only management. */
export const isInferenceCapableAccountRuntimeKey = (runtimeKey: {
  capabilities?: Partial<Pick<AccountRuntimeKeyCapabilities, "inference">>
}) => runtimeKey.capabilities?.inference !== false

/** Apply the owner-projected model policy to every runtime credential. */
export const isAccountRuntimeKeyCompatibleWithModel = (
  runtimeKey: AccountRuntimeKey,
  model: { id: string; enableGroups?: readonly string[] | null },
): boolean => {
  const modelId = model.id.trim()
  if (
    !modelId ||
    !isActiveAccountRuntimeKey(runtimeKey) ||
    !isSelectableAccountRuntimeKey(runtimeKey)
  ) {
    return false
  }

  const { groups, allowedModelIds, deniedModelIds } = runtimeKey.modelAccess
  if (deniedModelIds?.includes(modelId)) return false
  if (groups !== null && Array.isArray(model.enableGroups)) {
    const enabledGroups = new Set(
      model.enableGroups.map((group) => group.trim() || DEFAULT_MODEL_GROUP),
    )
    if (!groups.some((group) => enabledGroups.has(group))) return false
  }
  return allowedModelIds === null || allowedModelIds.includes(modelId)
}

export const sortAccountRuntimeKeysActiveFirst = <
  TRuntimeKey extends Pick<AccountRuntimeKey, "status">,
>(
  runtimeKeys: TRuntimeKey[],
) =>
  [...runtimeKeys].sort(
    (a, b) =>
      Number(!isActiveAccountRuntimeKey(a)) -
      Number(!isActiveAccountRuntimeKey(b)),
  )

export const findDefaultSelectableAccountRuntimeKey = (
  runtimeKeys: AccountRuntimeKey[],
) =>
  // Inference capability gates every branch: a management key must never be
  // proposed as the default inference credential, even when it is the only one.
  runtimeKeys.find(
    (runtimeKey) =>
      isActiveAccountRuntimeKey(runtimeKey) &&
      isInferenceCapableAccountRuntimeKey(runtimeKey) &&
      isSelectableAccountRuntimeKey(runtimeKey),
  ) ??
  runtimeKeys.find(
    (runtimeKey) =>
      isInferenceCapableAccountRuntimeKey(runtimeKey) &&
      isAccountKeyResourceRuntimeKey(runtimeKey),
  ) ??
  null

export const appendOrReplaceAccountRuntimeKey = (
  runtimeKeys: AccountRuntimeKey[],
  runtimeKey: AccountRuntimeKey,
) => [...runtimeKeys.filter(({ id }) => id !== runtimeKey.id), runtimeKey]

const getAccountRuntimeKeyBase = (
  account: AccountRuntimeKeyAccount,
  fields: Pick<AccountRuntimeKeyBase, "id" | "label" | "secret"> & {
    baseUrl?: string
    status: AccountRuntimeKeyStatus
    capabilities: AccountRuntimeKeyCapabilities
    modelAccess?: AccountRuntimeKeyModelAccess
    createdAt?: number
    notes?: string
  },
): Omit<AccountRuntimeKeyBase, "source"> => ({
  ...fields,
  modelAccess: fields.modelAccess ?? UNRESTRICTED_RUNTIME_KEY_MODEL_ACCESS,
  account,
  accountId: account.id,
  accountName: account.name,
  siteType: account.siteType,
  baseUrl: fields.baseUrl || account.baseUrl,
})

const ACCOUNT_RUNTIME_KEY_BASE_CAPABILITIES = {
  copy: true,
  export: true,
  verify: true,
  fetchRuntimeModels: true,
  inference: true,
} as const

export const buildServiceCredentialRuntimeKey = (
  account: AccountRuntimeKeyAccount,
  credential: AccountServiceCredential,
  options: { canRotate?: boolean } = {},
): ServiceCredentialRuntimeKey => ({
  ...getAccountRuntimeKeyBase(account, {
    id: buildServiceCredentialRuntimeKeyId(account.id, credential.service),
    label: credential.label,
    ...deriveServiceCredentialRuntimeKeyFields(credential, account.baseUrl),
    capabilities: {
      ...ACCOUNT_RUNTIME_KEY_BASE_CAPABILITIES,
      rotate: options.canRotate === true,
      updateToken: false,
      deleteToken: false,
    },
  }),
  source: ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
  service: credential.service,
  credential,
})

export const buildAccountKeyResourceRuntimeKey = (
  account: AccountRuntimeKeyAccountSource,
  resource: {
    ref: AccountKeyResourceRef
    label: string
    secret: string
    keyMask?: KeyMaskEvidence
    /** Client-facing address for credential-routed providers; defaults to the account origin. */
    baseUrl?: string
    modelAccess?: AccountRuntimeKeyModelAccess
    status?: AccountRuntimeKeyStatus
    createdAt?: number
    notes?: string
    legacyTokenId?: number
    /** Provider-declared inference eligibility; omitted keeps the base default. */
    inference?: boolean
    /** True when this resource is the credential the account itself stores. */
    accountCredential?: boolean
  },
): AccountKeyResourceRuntimeKey => {
  const runtimeKeyAccount = buildAccountRuntimeKeyAccount(account)
  return {
    ...getAccountRuntimeKeyBase(runtimeKeyAccount, {
      id: buildAccountKeyResourceRuntimeKeyId(resource.ref),
      label: resource.label,
      secret: resource.secret,
      ...(resource.keyMask ? { keyMask: resource.keyMask } : {}),
      ...(resource.baseUrl ? { baseUrl: resource.baseUrl } : {}),
      modelAccess: resource.modelAccess,
      createdAt: resource.createdAt,
      notes: resource.notes,
      status:
        resource.status ??
        (resource.secret.trim()
          ? ACCOUNT_RUNTIME_KEY_STATUSES.Active
          : ACCOUNT_RUNTIME_KEY_STATUSES.Inactive),
      capabilities: {
        ...ACCOUNT_RUNTIME_KEY_BASE_CAPABILITIES,
        ...(resource.inference === undefined
          ? {}
          : { inference: resource.inference }),
        rotate: false,
        updateToken: false,
        deleteToken: false,
      },
    }),
    source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
    resourceRef: resource.ref,
    legacyTokenId: resource.legacyTokenId,
    ...(resource.accountCredential ? { accountCredential: true } : {}),
  }
}

/** Projects runtime policy and any verified snapshot plaintext into the credential interface. */
export const buildAccountKeyResourceRuntimeKeyFromFacts = (
  account: AccountRuntimeKeyAccountSource,
  facts: AccountKeyResourceFacts,
  secret = facts.runtimeSecret ?? "",
): AccountKeyResourceRuntimeKey =>
  buildAccountKeyResourceRuntimeKey(account, {
    ...facts.runtimeKey,
    ref: facts.ref,
    label: facts.displayName,
    secret,
    keyMask: facts.keyMask,
    ...(isProviderConfirmedAccountCredential(facts.accountCredentialIdentity)
      ? { accountCredential: true }
      : {}),
    status:
      facts.status === ACCOUNT_KEY_RESOURCE_STATUSES.Enabled
        ? ACCOUNT_RUNTIME_KEY_STATUSES.Active
        : facts.status === ACCOUNT_KEY_RESOURCE_STATUSES.Unknown
          ? "unknown"
          : ACCOUNT_RUNTIME_KEY_STATUSES.Inactive,
  })

/** Stable external selection identity, retaining IDs emitted before native migration. */
export const getAccountRuntimeKeyExportId = (
  key: AccountRuntimeKey,
): string => {
  if (isAccountKeyResourceRuntimeKey(key) && key.legacyTokenId !== undefined)
    return String(key.legacyTokenId)
  return key.id
}

/** Projects inventory fragments through the same auth formatting as the resolved secret. */
export const formatAccountRuntimeKeyMaskForSite = (
  runtimeKey: AccountRuntimeKey,
): KeyMaskEvidence | undefined => {
  const mask = runtimeKey.keyMask
  if (!mask || !hasOptionalSkPrefixSiteTokenSemantics(runtimeKey.siteType))
    return mask
  return {
    ...mask,
    // Auth formatting may add sk-. A partial "s"/"sk" inventory prefix cannot
    // tell whether the raw credential already has it; retain only guaranteed bytes.
    prefix: mask.prefix.startsWith("sk-")
      ? mask.prefix
      : "sk-".startsWith(mask.prefix)
        ? "sk-"
        : `sk-${mask.prefix}`,
  }
}

/** Formats the runtime secret without changing the provider's original credential. */
export const formatAccountRuntimeKeySecretForSite = <
  TRuntimeKey extends AccountRuntimeKey,
>(
  runtimeKey: TRuntimeKey,
): TRuntimeKey => ({
  ...runtimeKey,
  secret: formatOptionalSkPrefixSiteTokenAuthKey(
    runtimeKey.secret,
    runtimeKey.siteType,
  ),
})

const isCollectedRuntimeKeySecret = (
  value: string | undefined,
): value is string => value !== undefined && value !== ""

export const collectAccountRuntimeKeySecrets = (
  runtimeKeys: AccountRuntimeKey[],
) => [
  ...new Set(
    runtimeKeys
      .flatMap((runtimeKey) => [
        runtimeKey.secret,
        formatOptionalSkPrefixSiteTokenAuthKey(
          runtimeKey.secret,
          runtimeKey.siteType,
        ),
        formatOptionalSkPrefixSiteTokenComparableKey(
          runtimeKey.secret,
          runtimeKey.siteType,
        ),
        isServiceCredentialRuntimeKey(runtimeKey)
          ? runtimeKey.credential.key
          : undefined,
        runtimeKey.account.token,
        runtimeKey.account.cookieAuthSessionCookie,
      ])
      .filter(isCollectedRuntimeKeySecret),
  ),
]
