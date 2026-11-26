import { Fingerprint, Lock, ShieldCheck, UserCheck } from "lucide-react"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { InlineMessage, Input, Label } from "~/components/ui"
import type {
  NewApiTokenCapabilities,
  NewApiTokenVerification,
} from "~/services/apiService/newApiFamily/accessTokens/creation"
import { NEW_API_TOKEN_VERIFICATION_METHODS as METHODS } from "~/services/apiService/newApiFamily/accessTokens/protocol"

import { describeTokenMethods } from "./tokenVerification"

const methodIcons = {
  [METHODS.PASSWORD]: Lock,
  [METHODS.TWO_FACTOR]: ShieldCheck,
  [METHODS.OAUTH]: UserCheck,
  [METHODS.PASSKEY]: Fingerprint,
}

/** Shared factor selection for grant-bound creation and id-bound revocation. */
export function NewApiTokenVerificationFields({
  verification,
  method,
  setMethod,
  provider,
  setProvider,
  secret,
  setSecret,
  secretInvalid,
  feedbackMessage,
  feedbackTone = "destructive",
  disabled,
  onSubmit,
}: {
  verification: NewApiTokenCapabilities["verification"]
  method: NewApiTokenVerification["method"]
  setMethod: (value: NewApiTokenVerification["method"]) => void
  provider: string
  setProvider: (value: string) => void
  secret: string
  setSecret: (value: string) => void
  secretInvalid?: boolean
  feedbackMessage?: string
  feedbackTone?: "neutral" | "destructive"
  disabled: boolean
  onSubmit?: () => void
}) {
  const { t } = useTranslation("accountDialog")
  const id = useId()
  const methodLabels = {
    [METHODS.PASSWORD]: t("tokenCreation.methodPassword"),
    [METHODS.TWO_FACTOR]: t("tokenCreation.method2fa"),
    [METHODS.PASSKEY]: t("tokenCreation.methodPasskey"),
    [METHODS.OAUTH]: t("tokenCreation.methodOauth"),
  }
  const options = describeTokenMethods(verification).flatMap((option) => {
    const { kind } = option
    return kind === METHODS.OAUTH && verification.oauth_providers.length
      ? verification.oauth_providers.map((provider) => ({
          ...option,
          provider: provider.slug,
          label: provider.name,
          canVerify: option.canVerify && Boolean(provider.slug),
        }))
      : [
          {
            ...option,
            provider: "",
            label: kind ? methodLabels[kind] : option.method,
          },
        ]
  })
  const onlyOption = options.length === 1 ? options[0] : undefined
  const showOptions = options.length > 0 && !onlyOption?.canVerify
  const selected = options.find(
    (option) =>
      option.canVerify &&
      option.method === method &&
      (method !== METHODS.OAUTH || option.provider === provider),
  )
  const usePassword = selected?.method === METHODS.PASSWORD
  const showSecret = usePassword || selected?.method === METHODS.TWO_FACTOR
  const showSecretHelp = showSecret && !showOptions
  const feedbackId = `${id}-feedback`
  const secretDescription =
    [showSecretHelp && `${id}-secret-help`, feedbackMessage && feedbackId]
      .filter(Boolean)
      .join(" ") || undefined
  const feedback = feedbackMessage && (
    <InlineMessage
      id={feedbackId}
      role={feedbackTone === "neutral" ? "status" : "alert"}
      tone={feedbackTone}
      size="sm"
    >
      {feedbackMessage}
    </InlineMessage>
  )
  return (
    <section
      aria-labelledby={`${id}-verification`}
      className="space-y-3 border-t border-border-subtle pt-4 text-foreground"
    >
      <h3 id={`${id}-verification`} className="font-medium">
        {t("tokenCreation.verification")}
      </h3>
      {showSecretHelp && (
        <p id={`${id}-secret-help`} className="text-xs text-muted-foreground">
          {usePassword
            ? t("tokenCreation.passwordHelp")
            : t("tokenCreation.codeHelp")}
        </p>
      )}
      {showOptions && (
        <div
          role="radiogroup"
          aria-labelledby={`${id}-verification`}
          className="flex flex-wrap gap-2"
        >
          {options.map((option) => {
            const Icon = option.kind ? methodIcons[option.kind] : UserCheck
            return (
              <label
                key={`${option.method}:${option.provider}`}
                className="relative flex max-w-full cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:border-border-strong hover:text-foreground has-checked:border-primary has-checked:bg-primary/10 has-checked:font-medium has-checked:text-foreground has-checked:shadow-2xs has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-disabled:cursor-default has-disabled:opacity-50"
              >
                <input
                  type="radio"
                  name={`${id}-method`}
                  className="sr-only"
                  checked={selected === option}
                  disabled={disabled || !option.canVerify}
                  onChange={() => {
                    if (!option.kind) return
                    setMethod(option.kind)
                    if (option.method === METHODS.OAUTH)
                      setProvider(option.provider)
                    setSecret("")
                  }}
                />
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 wrap-anywhere">
                  {option.label}
                  {option.reason && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({option.reason})
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </div>
      )}
      {!showOptions && selected?.method === METHODS.OAUTH && (
        <InlineMessage
          role="note"
          size="sm"
          icon={<UserCheck className="size-3.5" />}
        >
          {t("tokenCreation.oauthConfirmation", { provider: selected.label })}
        </InlineMessage>
      )}
      {showSecret && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label
              htmlFor={`${id}-secret`}
              className={showOptions ? undefined : "sr-only"}
            >
              {usePassword
                ? t("tokenCreation.password")
                : t("tokenCreation.code")}
            </Label>
            <Input
              key={method}
              id={`${id}-secret`}
              aria-describedby={secretDescription}
              aria-invalid={secretInvalid || undefined}
              variant={secretInvalid ? "error" : undefined}
              type={usePassword ? "password" : "text"}
              revealable={usePassword}
              revealLabels={{
                show: t("login.showPassword"),
                hide: t("login.hidePassword"),
              }}
              autoComplete={usePassword ? "current-password" : "one-time-code"}
              inputMode={usePassword ? undefined : "numeric"}
              leftIcon={
                usePassword ? (
                  <Lock aria-hidden="true" className="size-4" />
                ) : (
                  <ShieldCheck aria-hidden="true" className="size-4" />
                )
              }
              placeholder={
                usePassword
                  ? t("tokenCreation.passwordPlaceholder")
                  : t("tokenCreation.codePlaceholder")
              }
              disabled={disabled}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              onKeyDown={(event) => {
                if (
                  !onSubmit ||
                  disabled ||
                  event.key !== "Enter" ||
                  event.nativeEvent.isComposing
                )
                  return
                event.preventDefault()
                onSubmit()
              }}
            />
            {feedback}
          </div>
        </div>
      )}
      {selected?.method === METHODS.PASSKEY && (
        <InlineMessage role="note" size="sm">
          {t("tokenCreation.passkeyHint")}
        </InlineMessage>
      )}
      {!showSecret && feedback}
    </section>
  )
}
