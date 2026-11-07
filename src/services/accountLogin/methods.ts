import {
  ACCOUNT_LOGIN_CONFIGURATION_KINDS,
  ACCOUNT_LOGIN_METHODS,
  ACCOUNT_PASSWORD_IDENTITIES,
  type AccountPasswordIdentity,
} from "~/constants/accountLogin"
import type { AccountLoginMethodDefinition } from "~/services/apiAdapters/contracts/accountLogin"

/** Describes the existing account password schema for native-login adapters. */
export function passwordLoginMethod(
  identity: AccountPasswordIdentity = ACCOUNT_PASSWORD_IDENTITIES.UsernameOrEmail,
): AccountLoginMethodDefinition {
  return {
    id: ACCOUNT_LOGIN_METHODS.Password,
    label: "Password",
    configuration: {
      kind: ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password,
      identity,
    },
  }
}
