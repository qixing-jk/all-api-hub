import type { AccountSiteType } from "~/constants/siteType"

type CredentialScope = Readonly<{ url: string; siteType: AccountSiteType }>
type LoadedKimiAuth = Readonly<{
  accessToken: string
  refreshToken?: string
  organizationId?: string
}>

/** Owns credential provenance and the original authentication evidence used at save. */
export function createAccountCredentialEvidence() {
  let evidence: Readonly<{
    scope: CredentialScope | null
    hasAccessToken: boolean
    loadedKimiAuth: LoadedKimiAuth | undefined
  }> = { scope: null, hasAccessToken: false, loadedKimiAuth: undefined }

  return {
    read: () => evidence,
    observeAccessToken(value: string) {
      evidence = { ...evidence, hasAccessToken: Boolean(value.trim()) }
    },
    rememberCredential(value: string, scope: CredentialScope) {
      const hasAccessToken = Boolean(value.trim())
      evidence = {
        ...evidence,
        hasAccessToken,
        scope: hasAccessToken ? { ...scope } : null,
      }
    },
    rememberScope(scope: CredentialScope) {
      evidence = { ...evidence, scope: { ...scope } }
    },
    acceptLoadedCredential({
      accessToken,
      scope,
      loadedKimiAuth,
    }: {
      accessToken: string
      scope: CredentialScope
      loadedKimiAuth: LoadedKimiAuth | undefined
    }) {
      evidence = {
        scope: { ...scope },
        hasAccessToken: Boolean(accessToken.trim()),
        loadedKimiAuth: loadedKimiAuth ? { ...loadedKimiAuth } : undefined,
      }
    },
    reset() {
      evidence = {
        scope: null,
        hasAccessToken: false,
        loadedKimiAuth: undefined,
      }
    },
  }
}
