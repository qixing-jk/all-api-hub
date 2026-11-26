import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { Button, InlineMessage } from "~/components/ui"
import type { NewApiAccessTokenCreation } from "~/services/apiService/newApiFamily/accessTokens/creation"
import {
  NEW_API_TOKEN_SESSION_ERRORS as SESSION_ERRORS,
  type NewApiTokenSessionError,
} from "~/services/apiService/newApiFamily/accessTokens/sessionError"

import { NewApiTokenVerificationFields } from "./NewApiTokenVerificationFields"
import {
  classifyVerificationError,
  TOKEN_CREATION_FEEDBACK as FEEDBACK,
  type TokenCreationError,
} from "./tokenCreationFeedback"
import {
  availableTokenMethods,
  buildVerificationInput,
  DEFAULT_TOKEN_VERIFICATION_INPUT,
  hasVerificationInput,
} from "./tokenVerification"
import { useNewApiTokenScopeLabels } from "./useNewApiTokenScopeLabels"

const RECOVERY_ACTIONS = { REVOKE: "revoke", REVIEW: "review" } as const
type RecoveryAction = (typeof RECOVERY_ACTIONS)[keyof typeof RECOVERY_ACTIONS]

/** Review the site's list and optionally revoke a manually selected token. */
export function NewApiTokenRecovery({
  flow,
  draftName,
  footer,
  uncertain = false,
  onReviewed,
  onRevokedCreated,
  onReturnToAccount,
  onPendingChange,
  onReconnect,
  reconnecting = false,
  reconnectError,
  sessionRevision,
}: {
  flow: NewApiAccessTokenCreation
  draftName?: string
  footer?: HTMLElement | null
  uncertain?: boolean
  onReviewed: (revokedCreated: boolean) => void | Promise<void>
  onRevokedCreated?: () => void
  onReturnToAccount?: () => void
  onPendingChange?: (pending: boolean) => void
  onReconnect?: () => void
  reconnecting?: boolean
  reconnectError?: NewApiTokenSessionError
  sessionRevision?: unknown
}) {
  const { t, i18n } = useTranslation("accountDialog")
  const listId = useId()
  const scopeLabels = useNewApiTokenScopeLabels()
  const [data, setData] =
    useState<Awaited<ReturnType<NewApiAccessTokenCreation["loadRecovery"]>>>()
  const [selected, setSelected] = useState<number>()
  const [{ method, secret }, setVerificationInput] = useState(
    DEFAULT_TOKEN_VERIFICATION_INPUT,
  )
  const [provider, setProvider] = useState("")
  const [pendingAction, setPendingAction] = useState<RecoveryAction>()
  const pending = pendingAction !== undefined
  const revoking = pendingAction === RECOVERY_ACTIONS.REVOKE
  const [failed, setFailed] = useState(false)
  const [revokeError, setRevokeError] = useState<TokenCreationError>()
  const [loading, setLoading] = useState(true)
  const [revoked, setRevoked] = useState(false)
  const [revokedCreated, setRevokedCreated] = useState(false)
  const [revision, setRevision] = useState(0)
  const busy = useRef(false)
  const selectedRadio = useRef<HTMLInputElement>(null)
  const success = useRef<HTMLDivElement>(null)
  const revokeMessage = useRef<HTMLDivElement>(null)
  const listBusy = loading || reconnecting
  const selectedToken = data?.items.find((item) => item.id === selected)
  const reloadRequired = reconnectError?.code === SESSION_ERRORS.RELOAD_REQUIRED
  const revokeVerificationCopy: Partial<Record<TokenCreationError, string>> = {
    [FEEDBACK.INVALID_PASSWORD]: t("tokenCreation.invalidPassword"),
    [FEEDBACK.INVALID_CODE]: t("tokenCreation.invalidCode"),
    [FEEDBACK.CANCELLED]: t("tokenCreation.cancelled"),
    [FEEDBACK.TIMEOUT]: t("tokenCreation.timeout"),
    [FEEDBACK.LOCKED]: t("tokenCreation.locked"),
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    setRevokeError(undefined)
    setRevoked(false)
    void flow
      .loadRecovery()
      .then((value) => {
        if (!active) return
        setData(value)
        setSelected((id) =>
          value.items.some((item) => item.id === id) ? id : undefined,
        )
        const [first] = availableTokenMethods(value.verification)
        if (first) setVerificationInput({ method: first, secret: "" })
        setProvider(value.verification.oauth_providers[0]?.slug ?? "")
      })
      .catch(() => {
        if (!active) return
        setData(undefined)
        setSelected(undefined)
        setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [flow, revision, sessionRevision])

  useEffect(() => {
    if (revoked) success.current?.focus()
  }, [revoked])
  useEffect(() => {
    if (revokeError) revokeMessage.current?.focus()
  }, [revokeError])

  const refresh = () => {
    setLoading(true)
    setRevision((value) => value + 1)
  }
  const select = (id: number | undefined) => {
    setSelected(id)
    setVerificationInput((current) => ({ ...current, secret: "" }))
    setRevoked(false)
    setRevokeError(undefined)
  }
  const revoke = async () => {
    if (busy.current || listBusy || !selectedToken) return
    busy.current = true
    setPendingAction(RECOVERY_ACTIONS.REVOKE)
    onPendingChange?.(true)
    setFailed(false)
    setRevoked(false)
    setRevokeError(undefined)
    const input = buildVerificationInput(method, secret, provider)
    try {
      if (await flow.revokeToken(selectedToken.id, input)) {
        setRevokedCreated(true)
        onRevokedCreated?.()
      }
      select(undefined)
      setData(await flow.loadRecovery())
      setRevoked(true)
    } catch (error) {
      const reason = classifyVerificationError(error, method)
      if (!revokeVerificationCopy[reason]) setFailed(true)
      setRevokeError(reason)
    } finally {
      busy.current = false
      setPendingAction(undefined)
      onPendingChange?.(false)
    }
  }
  const confirmReview = async () => {
    if (busy.current || listBusy || failed || !data) return
    busy.current = true
    setPendingAction(RECOVERY_ACTIONS.REVIEW)
    onPendingChange?.(true)
    try {
      const absent = await flow.reviewRecovery()
      await onReviewed(revokedCreated || absent)
    } catch {
      setFailed(true)
    } finally {
      busy.current = false
      setPendingAction(undefined)
      onPendingChange?.(false)
    }
  }

  const actions = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {onReturnToAccount && (
        <Button
          type="button"
          variant="ghost"
          disabled={pending || reconnecting}
          onClick={onReturnToAccount}
        >
          {t("tokenCreation.useExistingToken")}
        </Button>
      )}
      <Button
        type="button"
        variant={selectedToken ? "outline" : "default"}
        loading={pendingAction === RECOVERY_ACTIONS.REVIEW}
        disabled={pending || failed || listBusy || !data}
        onClick={() => void confirmReview()}
      >
        {uncertain
          ? t("tokenCreation.reviewAllowRetry")
          : t("tokenCreation.reviewComplete")}
      </Button>
    </div>
  )

  return (
    <section
      className="space-y-4 text-sm"
      aria-label={t("tokenCreation.reviewTokens")}
    >
      {uncertain && (
        <p className="font-medium wrap-anywhere">
          {t("tokenCreation.reviewDraft", { name: draftName })}
        </p>
      )}
      <p className="text-muted-foreground">{t("tokenCreation.recoveryHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={listBusy}
          disabled={pending || listBusy}
          onClick={refresh}
        >
          {t("common:actions.refresh")}
        </Button>
        {failed && onReconnect && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending || listBusy}
            onClick={onReconnect}
          >
            {reloadRequired
              ? t("tokenCreation.connection.reloadAndRetry")
              : t("tokenCreation.reconnect")}
          </Button>
        )}
      </div>
      {failed && (!selectedToken || !revokeError || reconnectError) && (
        <InlineMessage role="alert" tone="destructive">
          {reloadRequired
            ? t("tokenCreation.connection.reloadRequired")
            : reconnectError?.code === SESSION_ERRORS.IDENTITY_MISMATCH
              ? t("tokenCreation.connection.identityMismatch")
              : t("tokenCreation.recoveryFailed")}
        </InlineMessage>
      )}
      {revoked && (
        <InlineMessage ref={success} tabIndex={-1} tone="success">
          {t("tokenCreation.revoked")}
        </InlineMessage>
      )}
      {data && data.items.length === 0 && (
        <p role="status" className="text-muted-foreground">
          {t("tokenCreation.noTokens")}
        </p>
      )}
      {data && data.items.length > 0 && (
        <fieldset
          aria-label={t("tokenCreation.reviewTokens")}
          disabled={pending || listBusy}
          className="min-w-0 divide-y divide-border-subtle border-y border-border-subtle"
        >
          {data.items.map((item) => {
            const id = `${listId}-${item.id}`
            return (
              <div
                key={item.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-1.5 py-3"
              >
                <input
                  id={id}
                  ref={selected === item.id ? selectedRadio : undefined}
                  type="radio"
                  className="mt-0.5"
                  name={listId}
                  checked={selected === item.id}
                  onChange={() => select(item.id)}
                />
                <label htmlFor={id} className="min-w-0 wrap-anywhere">
                  <span className="block font-medium">
                    {item.name} · #{item.id}
                    {item.token_hint && ` · ${item.token_hint}`}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {new Date(item.created_at * 1000).toLocaleString(
                      i18n?.language,
                    )}
                  </span>
                </label>
                <details className="col-start-2 min-w-0 text-xs text-muted-foreground">
                  <summary className="w-fit cursor-pointer font-medium text-foreground">
                    {t("tokenCreation.permissions")} ({item.scopes.length})
                  </summary>
                  <ul className="mt-2 grid gap-x-4 gap-y-1 ps-3 wrap-anywhere sm:grid-cols-2">
                    {item.scopes.map((scope) => (
                      <li key={scope}>{scopeLabels[scope] ?? scope}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )
          })}
        </fieldset>
      )}
      {data && selectedToken && (
        <div className="space-y-3">
          <NewApiTokenVerificationFields
            verification={data.verification}
            method={method}
            setMethod={(method) => setVerificationInput({ method, secret: "" })}
            provider={provider}
            setProvider={setProvider}
            secret={secret}
            setSecret={(secret) => {
              setVerificationInput((current) => ({ ...current, secret }))
              if (
                revokeError === FEEDBACK.INVALID_PASSWORD ||
                revokeError === FEEDBACK.INVALID_CODE
              )
                setRevokeError(undefined)
            }}
            disabled={pending || listBusy}
            secretInvalid={
              revokeError === FEEDBACK.INVALID_PASSWORD ||
              revokeError === FEEDBACK.INVALID_CODE
            }
            feedbackRef={revokeMessage}
            feedbackTone={
              revokeError === FEEDBACK.CANCELLED ? "neutral" : "destructive"
            }
            feedbackMessage={
              revokeError
                ? (revokeVerificationCopy[revokeError] ??
                  t("tokenCreation.recoveryFailed"))
                : undefined
            }
            heading={t("tokenCreation.revokeHeading")}
            introduction={t("tokenCreation.revokeWarning", {
              name: selectedToken.name,
            })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              loading={revoking}
              onClick={() => void revoke()}
              disabled={
                pending ||
                listBusy ||
                !availableTokenMethods(data.verification).includes(method) ||
                !hasVerificationInput(method, secret, provider)
              }
            >
              {t("tokenCreation.revokeSelected")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending && !revoking}
              onClick={() => {
                if (revoking) {
                  flow.cancelVerification()
                  return
                }
                selectedRadio.current?.focus()
                select(undefined)
                if (failed) refresh()
              }}
            >
              {t(
                revoking
                  ? "common:actions.cancel"
                  : "tokenCreation.cancelTokenSelection",
              )}
            </Button>
          </div>
        </div>
      )}
      {footer ? createPortal(actions, footer) : actions}
    </section>
  )
}
