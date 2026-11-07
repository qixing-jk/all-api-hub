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
  Switch,
} from "~/components/ui"
import {
  ACCOUNT_LOGIN_CONFIGURATION_KINDS,
  ACCOUNT_LOGIN_PROVIDER_LABELS,
  ACCOUNT_PASSWORD_IDENTITIES,
} from "~/constants/accountLogin"
import { AccountFormSection } from "~/features/AccountManagement/components/AccountDialog/form/AccountFormSection"
import { ACCOUNT_FORM_SECTION_ELEMENT_IDS } from "~/features/AccountManagement/components/AccountDialog/form/accountFormSections"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { IncognitoAccessNotice } from "~/features/Permissions/components/IncognitoAccessNotice"
import { supportsAccountCookieRecovery } from "~/services/accountCredentialRecovery/policy"
import { getAccountLoginMethods } from "~/services/accountLogin/capabilities"
import type { LoginProviderClaimConflict } from "~/services/accountLogin/providerClaims"
import type { AccountSiteType } from "~/services/accountSiteDefinitions"
import type { AuthTypeEnum } from "~/types"
import type { AccountLoginConfiguration } from "~/types/accountLogin"

export const ACCOUNT_LOGIN_SECTION_ID =
  ACCOUNT_FORM_SECTION_ELEMENT_IDS["account-login"]
const UNSET_LOGIN_METHOD = "unset"

/** Existing login configuration, owned by the account rather than its consumers. */
export function AccountLoginSection({
  continuous,
  siteUrl,
  siteType,
  authType,
  login,
  claimedLoginProviders = [],
  onChange,
  methodRef,
  open,
  onOpenChange,
}: {
  continuous?: boolean
  siteUrl?: string
  siteType?: AccountSiteType
  authType: AuthTypeEnum
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
  const target = {
    authType,
    site_type: siteType,
    site_url: siteUrl ?? "",
    account_info: {},
  }
  const methods = getAccountLoginMethods(target)
    .slice()
    .sort(
      (a, b) =>
        Number(
          b.configuration.kind === ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password,
        ) -
        Number(
          a.configuration.kind === ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password,
        ),
    )
  const selectedMethod = methods.find((method) => method.id === login?.methodId)
  const passwordIdentity =
    selectedMethod?.configuration.kind ===
    ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password
      ? selectedMethod.configuration.identity
      : undefined
  const supportsRecovery = supportsAccountCookieRecovery(target)
  if (methods.length === 0) return null
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
      <FormField
        label={t("login.method")}
        description={
          supportsRecovery
            ? t("login.recoveryConfigurationDescription")
            : t("login.description")
        }
      >
        <Select
          value={login?.methodId ?? UNSET_LOGIN_METHOD}
          onValueChange={(methodId) => {
            if (passwordIdentity) passwordDraft.current = credentials
            setShowPassword(false)
            if (methodId === UNSET_LOGIN_METHOD) onChange(undefined)
            else if (methods.some((method) => method.id === methodId))
              onChange({
                methodId,
                ...(methods.find((method) => method.id === methodId)
                  ?.configuration.kind ===
                ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password
                  ? { credentials: passwordDraft.current }
                  : {}),
                ...(login?.automaticRecovery === undefined
                  ? {}
                  : { automaticRecovery: login.automaticRecovery }),
              })
          }}
        >
          <SelectTrigger ref={methodRef} aria-label={t("login.method")}>
            <SelectValue placeholder={t("login.notConfigured")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET_LOGIN_METHOD}>
              {t("login.notConfigured")}
            </SelectItem>
            {login && !selectedMethod && (
              <SelectItem value={login.methodId} disabled>
                {login.methodId}
              </SelectItem>
            )}
            {methods.map((method) => (
              <SelectItem
                key={method.id}
                value={method.id}
                disabled={
                  method.id !== login?.methodId &&
                  claimedLoginProviders.some(
                    (claim) => claim.provider === method.id,
                  )
                }
              >
                {method.configuration.kind ===
                ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password
                  ? t("login.passwordMethod")
                  : method.label}
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
      {supportsRecovery && (
        <FormField
          label={t("login.automaticRecovery")}
          htmlFor="account-login-automatic-recovery"
          description={t("login.automaticRecoveryDescription")}
          labelAction={
            <Switch
              id="account-login-automatic-recovery"
              aria-label={t("login.automaticRecovery")}
              checked={login?.automaticRecovery === true}
              disabled={
                !login || !supportsAccountCookieRecovery(target, login.methodId)
              }
              onChange={(automaticRecovery) => {
                if (login) onChange({ ...login, automaticRecovery })
              }}
            />
          }
        >
          {null}
        </FormField>
      )}
      {login && passwordIdentity && (
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
                  ...login,
                  methodId: login.methodId,
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
                  ...login,
                  methodId: login.methodId,
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
