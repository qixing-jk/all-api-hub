import { useTranslation } from "react-i18next"

import { NEW_API_TOKEN_ACCESS_SCOPES as ACCESS_SCOPES } from "~/services/apiService/newApiFamily/accessTokens/protocol"

/** Share the site's permission labels across issuance and review. */
export function useNewApiTokenScopeLabels() {
  const { t } = useTranslation("accountDialog")
  return new Map<string, string>([
    [ACCESS_SCOPES.PROFILE_READ, t("tokenCreation.profileRead")],
    [ACCESS_SCOPES.PROFILE_WRITE, t("tokenCreation.profileWrite")],
    [ACCESS_SCOPES.API_KEY_READ, t("tokenCreation.keyRead")],
    [ACCESS_SCOPES.API_KEY_WRITE, t("tokenCreation.keyWrite")],
    [ACCESS_SCOPES.API_KEY_REVEAL, t("tokenCreation.keyReveal")],
    [ACCESS_SCOPES.USAGE_READ, t("tokenCreation.usageRead")],
    [ACCESS_SCOPES.WALLET_READ, t("tokenCreation.walletRead")],
    [ACCESS_SCOPES.WALLET_WRITE, t("tokenCreation.walletWrite")],
    [ACCESS_SCOPES.SECURITY_READ, t("tokenCreation.securityRead")],
    [ACCESS_SCOPES.SECURITY_WRITE, t("tokenCreation.securityWrite")],
  ])
}
