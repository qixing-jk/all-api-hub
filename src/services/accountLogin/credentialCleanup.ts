import { BROWSER_LOGIN_STATUS } from "~/constants/browserLogin"
import type {
  AccountLoginCredential,
  AccountLoginResult,
  AccountLoginTarget,
} from "~/services/apiAdapters/contracts/accountLogin"
import { getAccountLoginCapability } from "~/services/apiAdapters/registry"

/** Only credentials created by this attempt are eligible for rollback. */
export function getIssuedAccountLoginCredential(
  result: AccountLoginResult,
): AccountLoginCredential | undefined {
  if (
    result.status === BROWSER_LOGIN_STATUS.Authenticated &&
    result.evidence?.credentialIssued === true
  )
    return result.credential
}

/** Call only for credentials this login operation issued and has not persisted. */
export async function discardAccountLoginCredential(
  account: AccountLoginTarget,
  credential: AccountLoginCredential,
): Promise<void> {
  await getAccountLoginCapability(account)?.discardCredential?.(
    account,
    credential,
  )
}
