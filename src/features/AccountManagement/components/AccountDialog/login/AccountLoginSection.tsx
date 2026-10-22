import { useRef, useState, type Ref } from "react"
import { useTranslation } from "react-i18next"

import {
  FormField,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  ACCOUNT_LOGIN_METHODS,
  ACCOUNT_LOGIN_PROVIDER_LABELS,
  ACCOUNT_LOGIN_PROVIDERS,
  ACCOUNT_PASSWORD_IDENTITIES,
  isAccountLoginProvider,
} from "~/constants/accountLogin"
import { AccountFormSection } from "~/features/AccountManagement/components/AccountDialog/form/AccountFormSection"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { IncognitoAccessNotice } from "~/features/Permissions/components/IncognitoAccessNotice"
import type { LoginProviderClaimConflict } from "~/services/accountLogin/providerClaims"
import { isAgentRouterLoginUrl } from "~/services/accountLogin/providers/agentrouter/config"
import type { AccountSiteLoginConfig } from "~/services/accountSiteDefinitions"
import type { AccountLoginConfiguration } from "~/types/accountLogin"

export const ACCOUNT_LOGIN_SECTION_ID = "account-login-config"
const UNSET_LOGIN_METHOD = "unset"

/** Existing login configuration, owned by the account rather than its consumers. */
export function AccountLoginSection({
  continuous,
  siteUrl,
  passwordIdentity = ACCOUNT_PASSWORD_IDENTITIES.UsernameOrEmail,
  login,
  claimedLoginProviders = [],
  onChange,
  methodRef,
  open,
  onOpenChange,
}: {
  continuous?: boolean
  siteUrl?: string
  passwordIdentity?: AccountSiteLoginConfig["passwordIdentity"]
  login?: AccountLoginConfiguration
  claimedLoginProviders?: readonly LoginProviderClaimConflict[]
  onChange: (value: AccountLoginConfiguration | undefined) => void
  methodRef?: Ref<HTMLButtonElement>
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation(["accountDialog", "messages"])
  const passwordDraft = useRef(
    login?.credentials ?? { username: "", password: "" },
  )
  const [showPassword, setShowPassword] = useState(false)
  const credentials = login?.credentials ?? { username: "", password: "" }
  if (!isAgentRouterLoginUrl(siteUrl)) return null
  return (
    <AccountFormSection
      continuous={continuous}
      title={t("login.title")}
      defaultOpen
      open={open}
      onOpenChange={onOpenChange}
      testId={ACCOUNT_MANAGEMENT_TEST_IDS.accountFormSectionLogin}
      id={ACCOUNT_LOGIN_SECTION_ID}
    >
      <FormField label={t("login.method")} description={t("login.description")}>
        <Select
          value={login?.methodId ?? UNSET_LOGIN_METHOD}
          onValueChange={(methodId) => {
            if (login?.methodId === ACCOUNT_LOGIN_METHODS.Password)
              passwordDraft.current = credentials
            setShowPassword(false)
            if (methodId === UNSET_LOGIN_METHOD) onChange(undefined)
            else if (methodId === ACCOUNT_LOGIN_METHODS.Password)
              onChange({ methodId, credentials: passwordDraft.current })
            else if (isAccountLoginProvider(methodId)) onChange({ methodId })
          }}
        >
          <SelectTrigger ref={methodRef} aria-label={t("login.method")}>
            <SelectValue placeholder={t("login.notConfigured")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET_LOGIN_METHOD}>
              {t("login.notConfigured")}
            </SelectItem>
            <SelectItem value={ACCOUNT_LOGIN_METHODS.Password}>
              {t("login.passwordMethod")}
            </SelectItem>
            {[
              ACCOUNT_LOGIN_PROVIDERS.Github,
              ACCOUNT_LOGIN_PROVIDERS.LinuxDo,
            ].map((provider) => (
              <SelectItem
                key={provider}
                value={provider}
                disabled={
                  provider !== login?.methodId &&
                  claimedLoginProviders.some(
                    (claim) => claim.provider === provider,
                  )
                }
              >
                {ACCOUNT_LOGIN_PROVIDER_LABELS[provider]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {claimedLoginProviders.length > 0 && (
          <p className="text-muted-foreground mt-density-1 text-xs">
            {t("messages:errors.validation.loginProviderInUse", {
              provider: claimedLoginProviders
                .map((claim) => ACCOUNT_LOGIN_PROVIDER_LABELS[claim.provider])
                .join(" / "),
              account: claimedLoginProviders
                .map((claim) => claim.owner.site_name)
                .join(" / "),
            })}
          </p>
        )}
      </FormField>
      {login?.methodId === ACCOUNT_LOGIN_METHODS.Password && (
        <>
          <IncognitoAccessNotice />
          <FormField
            label={
              passwordIdentity === ACCOUNT_PASSWORD_IDENTITIES.Email
                ? t("login.email")
                : passwordIdentity === ACCOUNT_PASSWORD_IDENTITIES.Username
                  ? t("login.username")
                  : t("login.usernameOrEmail")
            }
            htmlFor="account-login-username"
            required
          >
            <Input
              id="account-login-username"
              autoComplete="username"
              value={credentials.username}
              onChange={(event) =>
                onChange({
                  methodId: ACCOUNT_LOGIN_METHODS.Password,
                  credentials: { ...credentials, username: event.target.value },
                })
              }
              required
            />
          </FormField>
          <FormField
            label={t("login.password")}
            htmlFor="account-login-password"
            description={t("login.passwordDescription")}
            required
          >
            <Input
              id="account-login-password"
              type="password"
              autoComplete="off"
              revealable
              revealed={showPassword}
              onRevealedChange={setShowPassword}
              revealLabels={{
                show: t("login.showPassword"),
                hide: t("login.hidePassword"),
              }}
              value={credentials.password}
              onChange={(event) =>
                onChange({
                  methodId: ACCOUNT_LOGIN_METHODS.Password,
                  credentials: { ...credentials, password: event.target.value },
                })
              }
              required
            />
          </FormField>
        </>
      )}
    </AccountFormSection>
  )
}
