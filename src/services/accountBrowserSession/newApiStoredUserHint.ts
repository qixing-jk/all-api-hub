import {
  getAccountSiteDefinition,
  type AccountSiteDefinitionOnboardingMetadata,
  type AccountSiteType,
} from "~/services/accountSiteDefinitions"
import { isRecord } from "~/utils/core/object"

import { readIdentityStorageRecord } from "./localIdentityState"

type PrimaryUserStorage = NonNullable<
  AccountSiteDefinitionOnboardingMetadata["browserUserStorage"]
>
type StoredUserHint = {
  kind: PrimaryUserStorage | "compatible-user"
  isPresent(): boolean
  read(): Record<string, unknown> | null
}

/** Reads only local identity hints, without authenticating or recovering a session. */
function createStoredUserHint(
  kind: StoredUserHint["kind"],
  key: string,
  selectUser: (
    record: Record<string, unknown> | null,
  ) => Record<string, unknown> | null,
): StoredUserHint {
  return {
    kind,
    isPresent: () => localStorage.getItem(key) !== null,
    read: () => selectUser(readIdentityStorageRecord(key)),
  }
}

export const compatibleStoredUserHint = createStoredUserHint(
  "compatible-user",
  "user",
  (record) => record,
)

// https://api.apiyi.com/ (v29.8.9) and https://api2.laozhang.ai/ (v31.1.5)
// store their dashboard user in USER_STATE.user. Callers select identity fields;
// the page's X-S-Token is unnecessary for cookie API reads.
export const apiyiStoredUserHint = createStoredUserHint(
  "apiyi",
  "USER_STATE",
  (record) => (isRecord(record?.user) ? record.user : null),
)

// The current V-API dashboard at https://gpt.ge uses this Zustand envelope.
// Older deployments continue through the compatible `user` store.
export const vApiStoredUserHint = createStoredUserHint(
  "v-api",
  "user-storage",
  (record) => {
    const state = record?.state
    return isRecord(state) && isRecord(state.user) ? state.user : null
  },
)

const primaryStores: Record<PrimaryUserStorage, StoredUserHint> = {
  apiyi: apiyiStoredUserHint,
  "v-api": vApiStoredUserHint,
}

/** Shares the declared store between onboarding selection and passive verification. */
export function resolveNewApiStoredUserHint(siteType?: AccountSiteType) {
  const storage = siteType
    ? getAccountSiteDefinition(siteType)?.onboarding?.browserUserStorage
    : undefined
  return storage ? primaryStores[storage] : compatibleStoredUserHint
}
