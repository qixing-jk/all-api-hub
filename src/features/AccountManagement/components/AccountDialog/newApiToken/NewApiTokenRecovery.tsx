import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import type { NewApiAccessTokenCreation } from "~/services/apiService/newApiFamily/accessTokens/creation"

import { NewApiTokenVerificationFields } from "./NewApiTokenVerificationFields"
import {
  availableTokenMethods,
  buildVerificationInput,
  DEFAULT_TOKEN_VERIFICATION_INPUT,
  hasVerificationInput,
} from "./tokenVerification"

const RECOVERY_ACTIONS = { REVOKE: "revoke", REVIEW: "review" } as const
type RecoveryAction = (typeof RECOVERY_ACTIONS)[keyof typeof RECOVERY_ACTIONS]

/** Bounded recovery for an uncertain issuance or a full token list; never auto-select a token. */
export function NewApiTokenRecovery({
  flow,
  onReviewed,
  onPendingChange,
  onReconnect,
  reconnecting,
  sessionRevision,
}: {
  flow: NewApiAccessTokenCreation
  onReviewed: (revokedCreated: boolean) => void
  onPendingChange?: (pending: boolean) => void
  onReconnect?: () => void
  reconnecting?: boolean
  sessionRevision?: unknown
}) {
  const { t } = useTranslation("accountDialog")
  const headingId = useId()
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
  const [revoked, setRevoked] = useState(false)
  const [revokedCreated, setRevokedCreated] = useState(false)
  const [revision, setRevision] = useState(0)
  const busy = useRef(false)
  useEffect(() => {
    let active = true
    setFailed(false)
    void flow
      .loadRecovery()
      .then((value) => {
        if (!active) return
        setData(value)
        const [first] = availableTokenMethods(value.verification)
        if (first)
          setVerificationInput((current) =>
            first === current.method ? current : { method: first, secret: "" },
          )
        setProvider(value.verification.oauth_providers[0]?.slug ?? "")
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [flow, revision, sessionRevision])
  const revoke = async () => {
    if (busy.current || selected == null) return
    busy.current = true
    setPendingAction(RECOVERY_ACTIONS.REVOKE)
    onPendingChange?.(true)
    setFailed(false)
    setRevoked(false)
    const input = buildVerificationInput(method, secret, provider)
    try {
      if (await flow.revokeToken(selected, input)) setRevokedCreated(true)
      setVerificationInput((current) => ({ ...current, secret: "" }))
      setData(await flow.loadRecovery())
      setSelected(undefined)
      setRevoked(true)
    } catch {
      setFailed(true)
    } finally {
      busy.current = false
      setPendingAction(undefined)
      onPendingChange?.(false)
    }
  }
  return (
    <section
      className="space-y-3 border-t border-border-subtle pt-4"
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="font-medium">
        {t("tokenCreation.reviewTokens")}
      </h3>
      <p>{t("tokenCreation.recoveryHint")}</p>
      {failed && <p role="alert">{t("tokenCreation.recoveryFailed")}</p>}
      {failed && onReconnect && (
        <Button
          type="button"
          disabled={pending || reconnecting}
          onClick={onReconnect}
        >
          {t("tokenCreation.reconnect")}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => setRevision((value) => value + 1)}
      >
        {t("common:actions.refresh")}
      </Button>
      {data && (
        <>
          <fieldset disabled={pending} className="space-y-2">
            {data.items.length === 0 && <p>{t("tokenCreation.noTokens")}</p>}
            {data.items.map((item) => (
              <label key={item.id} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="token-to-revoke"
                  checked={selected === item.id}
                  onChange={() => {
                    setSelected(item.id)
                    setVerificationInput((current) => ({
                      ...current,
                      secret: "",
                    }))
                    setRevoked(false)
                  }}
                />
                <span>
                  {item.name} · #{item.id} · {item.token_hint}
                  <br />
                  {new Date(item.created_at * 1000).toLocaleString()} ·{" "}
                  {item.scopes.join(", ")}
                </span>
              </label>
            ))}
            {selected != null && (
              <NewApiTokenVerificationFields
                verification={data.verification}
                method={method}
                setMethod={(method) =>
                  setVerificationInput({ method, secret: "" })
                }
                provider={provider}
                setProvider={setProvider}
                secret={secret}
                setSecret={(secret) =>
                  setVerificationInput((current) => ({ ...current, secret }))
                }
                disabled={pending}
              />
            )}
          </fieldset>
          <Button
            type="button"
            variant="destructive"
            loading={revoking}
            onClick={() => void revoke()}
            disabled={
              pending ||
              selected == null ||
              !availableTokenMethods(data.verification).includes(method) ||
              !hasVerificationInput(method, secret, provider)
            }
          >
            {t("tokenCreation.revokeSelected")}
          </Button>
          {revoking && (
            <Button
              type="button"
              variant="outline"
              onClick={() => flow.cancelVerification()}
            >
              {t("common:actions.cancel")}
            </Button>
          )}
          {revoked && <p role="status">{t("tokenCreation.revoked")}</p>}
          <Button
            type="button"
            disabled={pending || failed}
            onClick={() => {
              if (busy.current) return
              busy.current = true
              setPendingAction(RECOVERY_ACTIONS.REVIEW)
              onPendingChange?.(true)
              void flow
                .reviewRecovery()
                .then((absent) => onReviewed(revokedCreated || absent))
                .catch(() => setFailed(true))
                .finally(() => {
                  busy.current = false
                  setPendingAction(undefined)
                  onPendingChange?.(false)
                })
            }}
          >
            {t("tokenCreation.reviewComplete")}
          </Button>
        </>
      )}
    </section>
  )
}
