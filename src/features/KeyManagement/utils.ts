import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  buildServiceCredentialRuntimeKey,
  getAccountRuntimeKeyLocator,
  isAccountRuntimeKeyLocatorEqual,
  type AccountRuntimeKey,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import type { AccountKeyResourceRef } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { DisplaySiteData } from "~/types"
import { maskSecretForDisplay } from "~/utils/core/formatters"

import {
  KEY_MANAGEMENT_LOAD_STATUSES,
  type KeyManagementEntry,
  type ServiceCredentialState,
} from "./types"

/** Matches a rendered native resource against a persisted opaque locator. */
export const isAccountKeyResourceLocatorMatch = (
  ref: AccountKeyResourceRef,
  locator: AccountRuntimeKeyLocator,
) =>
  isAccountRuntimeKeyLocatorEqual(
    { source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource, ref },
    locator,
  )

/** Matches a rendered runtime key against its persisted source identity. */
export const isAccountRuntimeKeyLocatorMatch = (
  runtimeKey: AccountRuntimeKey,
  locator: AccountRuntimeKeyLocator,
) =>
  isAccountRuntimeKeyLocatorEqual(
    getAccountRuntimeKeyLocator(runtimeKey),
    locator,
  )

const buildAccountRuntimeKeyEntryIdentityKey = (runtimeKeyId: string) =>
  ["runtime_key", runtimeKeyId].join(":")

export const buildServiceCredentialKeyManagementEntry = (params: {
  account: DisplaySiteData
  serviceCredential: ServiceCredentialState | undefined
  canRotate: boolean
}): KeyManagementEntry | null => {
  const { account, serviceCredential, canRotate } = params
  if (
    serviceCredential?.status !== KEY_MANAGEMENT_LOAD_STATUSES.Loaded ||
    !serviceCredential.credential
  ) {
    return null
  }

  const runtimeKey = buildServiceCredentialRuntimeKey(
    account,
    serviceCredential.credential,
    { canRotate },
  )

  return {
    id: buildAccountRuntimeKeyEntryIdentityKey(runtimeKey.id),
    runtimeKey,
    uiState: {
      isRotating: serviceCredential.isRotating === true,
    },
  }
}

export const formatKey = (
  key: string,
  tokenIdentityKey: string,
  visibleKeys: Set<string>,
) => {
  if (visibleKeys.has(tokenIdentityKey)) {
    return key
  }
  return maskSecretForDisplay(key)
}
