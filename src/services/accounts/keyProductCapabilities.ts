import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum, type DisplaySiteData, type SiteAccount } from "~/types"

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

type AccountKeyProductCapabilities = {
  runtimeKeys: {
    list: boolean
    resolveSecret: boolean
  }
  apiTokens: {
    create: boolean
    update: boolean
    delete: boolean
  }
  tokenMetadata: {
    fetchAvailableModels: boolean
    fetchUserGroups: boolean
  }
  serviceCredential: {
    fetch: boolean
    rotate: boolean
  }
  defaultTokenAutomation: {
    run: boolean
  }
}

type AccountKeyProductCapabilityContext = Pick<
  DisplaySiteData,
  | "id"
  | "siteType"
  | "baseUrl"
  | "authType"
  | "userId"
  | "token"
  | "cookieAuthSessionCookie"
  | "disabled"
>

const NO_ACCOUNT_KEY_PRODUCT_CAPABILITIES: AccountKeyProductCapabilities = {
  runtimeKeys: {
    list: false,
    resolveSecret: false,
  },
  apiTokens: {
    create: false,
    update: false,
    delete: false,
  },
  tokenMetadata: {
    fetchAvailableModels: false,
    fetchUserGroups: false,
  },
  serviceCredential: {
    fetch: false,
    rotate: false,
  },
  defaultTokenAutomation: {
    run: false,
  },
}

/**
 * Product-level readiness for account key features. This intentionally covers
 * account/auth completeness only; backend feature support is projected below.
 */
export const canUseAccountKeyProductCapabilities = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount => {
  if (!account || account.disabled === true) {
    return false
  }

  if (account.authType === AuthTypeEnum.None) {
    return false
  }

  const hasToken = hasNonEmptyString(account.token)
  const hasCookie = hasNonEmptyString(account.cookieAuthSessionCookie)

  if (
    !hasNonEmptyString(account.id) ||
    !hasNonEmptyString(account.baseUrl) ||
    !hasNonEmptyString(account.siteType) ||
    !hasNonEmptyString(account.userId)
  ) {
    return false
  }

  if (account.authType === AuthTypeEnum.AccessToken) {
    return hasToken
  }

  if (account.authType === AuthTypeEnum.Cookie) {
    return hasToken || hasCookie
  }

  return false
}

export const createStoredAccountKeyProductContext = (
  account: SiteAccount,
): AccountKeyProductCapabilityContext => ({
  id: account.id,
  siteType: account.site_type,
  baseUrl: account.site_url,
  authType: account.authType,
  userId: account.account_info?.id ?? "",
  token: account.account_info?.access_token ?? "",
  cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
  disabled: account.disabled,
})

export const getAccountKeyProductCapabilities = (
  account: AccountKeyProductCapabilityContext | null | undefined,
): AccountKeyProductCapabilities => {
  if (!canUseAccountKeyProductCapabilities(account)) {
    return NO_ACCOUNT_KEY_PRODUCT_CAPABILITIES
  }

  const accountCapabilities = getSiteTypeCapabilities(account.siteType).account
  const keyManagement = accountCapabilities?.keyManagement
  const serviceCredential = accountCapabilities?.serviceCredential
  const hasKeyManagement = Boolean(keyManagement)
  const hasServiceCredential = Boolean(serviceCredential)
  const hasTokenProvisioning = Boolean(accountCapabilities?.tokenProvisioning)

  return {
    runtimeKeys: {
      list: hasKeyManagement || hasServiceCredential,
      resolveSecret: hasKeyManagement || hasServiceCredential,
    },
    apiTokens: {
      create: hasKeyManagement,
      update: hasKeyManagement,
      delete: hasKeyManagement,
    },
    tokenMetadata: {
      fetchAvailableModels: hasKeyManagement,
      fetchUserGroups: Boolean(keyManagement?.userGroups),
    },
    serviceCredential: {
      fetch: hasServiceCredential,
      rotate: Boolean(serviceCredential?.rotate),
    },
    defaultTokenAutomation: {
      run: hasKeyManagement && hasTokenProvisioning,
    },
  }
}

export const canListAccountRuntimeKeys = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).runtimeKeys.list

export const canResolveAccountRuntimeKeySecret = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).runtimeKeys.resolveSecret

export const canCreateAccountApiTokens = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).apiTokens.create

export const canUpdateAccountApiTokens = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).apiTokens.update

export const canFetchAccountTokenModels = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).tokenMetadata.fetchAvailableModels

export const canFetchAccountTokenGroups = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).tokenMetadata.fetchUserGroups

export const canRotateAccountServiceCredential = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).serviceCredential.rotate

export const canRunAccountDefaultTokenAutomation = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).defaultTokenAutomation.run
