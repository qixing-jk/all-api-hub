import * as accountBootstrap from "~/services/apiService/newApiFamily/default/accountBootstrap"

import {
  createNewApiKeyGroupBehavior,
  NEW_API_KEY_GROUP_MODES,
} from "../keyGroupBehavior"
import {
  type CredentialPayload,
  type TrimString,
} from "../variantOperations/credentials"
import type { NewApiVariantRegistration } from "../variantRegistration"

export const modelflareVariant: NewApiVariantRegistration = {
  key: {
    initialQuota: -1,
    defaultCreation: "select-requirement",
    group: createNewApiKeyGroupBehavior(NEW_API_KEY_GROUP_MODES.Required),
  },
  credentials: {
    fetchUserInfo: async (...args) =>
      normalizeModelFlareLabel(
        await accountBootstrap.defaultAccountBootstrapImplementation.fetchUserInfo(
          ...args,
        ),
      ),
    getOrCreateAccessToken: async (...args) =>
      normalizeModelFlareLabel(
        await accountBootstrap.defaultAccountBootstrapImplementation.getOrCreateAccessToken(
          ...args,
        ),
      ),
    readUsername: readModelFlareUsername,
  },
}

/** Reads the account label while retaining the explicit username's precedence. */
function readModelFlareUsername(
  payload: CredentialPayload,
  trimString: TrimString,
): string {
  const user =
    payload.user && typeof payload.user === "object"
      ? (payload.user as { display_name?: unknown })
      : undefined
  return trimString(payload.username) || trimString(user?.display_name)
}

/** Normalizes the label before acquisition and completion consume the same facts. */
function normalizeModelFlareLabel<T extends CredentialPayload>(payload: T): T {
  return {
    ...payload,
    username: readModelFlareUsername(payload, (value) =>
      typeof value === "string" ? value.trim() : "",
    ),
  }
}
