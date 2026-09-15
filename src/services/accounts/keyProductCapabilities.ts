import type { SiteType } from "~/constants/siteType"
import {
  getInventorySecretAvailability,
  INVENTORY_SECRET_AVAILABILITIES,
} from "~/services/apiAdapters/contracts/inventorySecret"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum, type DisplaySiteData, type SiteAccount } from "~/types"

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

type AccountKeyProductCapabilities = {
  resourceKeys: {
    list: boolean
    create: boolean
    update: boolean
    delete: boolean
  }
  runtimeKeys: {
    list: boolean
    resolveSecret: boolean
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
  resourceKeys: {
    list: false,
    create: false,
    update: false,
    delete: false,
  },
  runtimeKeys: {
    list: false,
    resolveSecret: false,
  },
  serviceCredential: {
    fetch: false,
    rotate: false,
  },
  defaultTokenAutomation: {
    run: false,
  },
}

const supportsRecoverableRuntimeKeySecrets = (
  accountCapabilities: ReturnType<typeof getSiteTypeCapabilities>["account"],
): boolean => {
  const keyManagement = accountCapabilities?.keyResourceManagement

  if (keyManagement) {
    return (
      getInventorySecretAvailability(keyManagement) ===
      INVENTORY_SECRET_AVAILABILITIES.Recoverable
    )
  }

  return Boolean(accountCapabilities?.serviceCredential)
}

/**
 * Product-level readiness for account key features. This intentionally covers
 * account/auth completeness only; backend feature support is projected below.
 */
const canUseAccountKeyProductCapabilities = <
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

/** Whether the provider exposes native account key creation. */
export const supportsAccountKeyCreation = (siteType: SiteType) =>
  Boolean(getSiteTypeCapabilities(siteType).account?.keyResourceManagement)

/** Whether existing account runtime keys can yield a usable plaintext secret. */
export const supportsRecoverableAccountRuntimeKeySecrets = (
  siteType: SiteType,
) =>
  supportsRecoverableRuntimeKeySecrets(
    getSiteTypeCapabilities(siteType).account,
  )

export const getAccountKeyProductCapabilities = (
  account: AccountKeyProductCapabilityContext | null | undefined,
): AccountKeyProductCapabilities => {
  if (!canUseAccountKeyProductCapabilities(account)) {
    return NO_ACCOUNT_KEY_PRODUCT_CAPABILITIES
  }

  const accountCapabilities = getSiteTypeCapabilities(account.siteType).account
  const hasKeyResources = Boolean(accountCapabilities?.keyResourceManagement)
  const serviceCredential = accountCapabilities?.serviceCredential
  const hasServiceCredential = Boolean(serviceCredential)
  const defaultCreation =
    accountCapabilities?.keyResourceManagement?.defaultCreation
  const canResolveRuntimeSecret =
    supportsRecoverableRuntimeKeySecrets(accountCapabilities)

  return {
    resourceKeys: {
      list: hasKeyResources,
      create: hasKeyResources,
      update: hasKeyResources,
      delete: hasKeyResources,
    },
    runtimeKeys: {
      list: hasKeyResources || hasServiceCredential,
      resolveSecret: canResolveRuntimeSecret,
    },
    serviceCredential: {
      fetch: hasServiceCredential,
      rotate: Boolean(serviceCredential?.rotate),
    },
    defaultTokenAutomation: {
      run: Boolean(defaultCreation && defaultCreation !== "requires-input"),
    },
  }
}

export const canListAccountRuntimeKeys = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).runtimeKeys.list

export const canListAccountKeyResources = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).resourceKeys.list

export const canResolveAccountRuntimeKeySecret = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).runtimeKeys.resolveSecret

export const canCreateAccountKeyResources = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).resourceKeys.create

export const canRunAccountDefaultTokenAutomation = <
  TAccount extends AccountKeyProductCapabilityContext,
>(
  account: TAccount | null | undefined,
): account is TAccount =>
  getAccountKeyProductCapabilities(account).defaultTokenAutomation.run
