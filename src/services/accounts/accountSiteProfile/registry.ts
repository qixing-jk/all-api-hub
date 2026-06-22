import type { AccountSiteType } from "~/constants/siteType"
import { getAccountSiteProductProfileOverride } from "~/services/accountSiteDefinitions"

import type {
  AccountSiteProductProfile,
  AccountSiteProductProfileOverride,
} from "./contracts"
import { DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE } from "./profiles"

type DeepMutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[]
    ? U[]
    : T[P] extends object
      ? DeepMutable<T[P]>
      : T[P]
}

const cloneAccountSiteProductProfile = (
  profile: AccountSiteProductProfile,
): AccountSiteProductProfile => ({
  siteType: profile.siteType,
  auth: {
    ...profile.auth,
    allowedAuthTypes: [...profile.auth.allowedAuthTypes],
    defaultAuthHostnames: [...profile.auth.defaultAuthHostnames],
  },
  authSession: { ...profile.authSession },
  createdToken: { ...profile.createdToken },
  identity: {
    ...profile.identity,
    storedUserIdentityFields: [...profile.identity.storedUserIdentityFields],
  },
  modelList: { ...profile.modelList },
  supplementalAuth: { ...profile.supplementalAuth },
  tokenForm: { ...profile.tokenForm },
  urls: {
    ...profile.urls,
    recognizedHostnames: [...profile.urls.recognizedHostnames],
  },
})

const mergeReadonlyArray = <T>(
  overrideValue: readonly T[] | undefined,
  defaultValue: readonly T[],
): T[] => [...(overrideValue ?? defaultValue)]

const mergeAccountSiteProductProfile = (
  siteType: AccountSiteType,
  override: AccountSiteProductProfileOverride | undefined,
): AccountSiteProductProfile => {
  const merged: DeepMutable<AccountSiteProductProfile> = {
    siteType,
    auth: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.auth,
      ...override?.auth,
      allowedAuthTypes: mergeReadonlyArray(
        override?.auth?.allowedAuthTypes,
        DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.auth.allowedAuthTypes,
      ),
      defaultAuthHostnames: mergeReadonlyArray(
        override?.auth?.defaultAuthHostnames,
        DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.auth.defaultAuthHostnames,
      ),
    },
    authSession: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.authSession,
      ...override?.authSession,
    },
    createdToken: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.createdToken,
      ...override?.createdToken,
    },
    identity: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.identity,
      ...override?.identity,
      storedUserIdentityFields: mergeReadonlyArray(
        override?.identity?.storedUserIdentityFields,
        DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.identity.storedUserIdentityFields,
      ),
    },
    modelList: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.modelList,
      ...override?.modelList,
    },
    supplementalAuth: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.supplementalAuth,
      ...override?.supplementalAuth,
    },
    tokenForm: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.tokenForm,
      ...override?.tokenForm,
    },
    urls: {
      ...DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.urls,
      ...override?.urls,
      recognizedHostnames: mergeReadonlyArray(
        override?.urls?.recognizedHostnames,
        DEFAULT_ACCOUNT_SITE_PRODUCT_PROFILE.urls.recognizedHostnames,
      ),
    },
  }

  return merged
}

/**
 * Resolves saved-account product policy for the requested account site type.
 */
export function getAccountSiteProductProfile(
  siteType: AccountSiteType,
): AccountSiteProductProfile {
  return cloneAccountSiteProductProfile(
    mergeAccountSiteProductProfile(
      siteType,
      getAccountSiteProductProfileOverride(siteType),
    ),
  )
}
