import { useEffect, useRef, useState } from "react"

import {
  getNewApiTokenCatalogPermissions,
  NewApiTokenCreationUncertainError,
  type NewApiAccessTokenCreation,
  type NewApiTokenCapabilities,
  type NewApiTokenVerification,
} from "~/services/apiService/newApiFamily/accessTokens/creation"
import {
  NEW_API_TOKEN_ACCESS_SCOPES as ACCESS_SCOPES,
  NEW_API_TOKEN_VERIFICATION_METHODS as METHODS,
} from "~/services/apiService/newApiFamily/accessTokens/protocol"

import {
  classifyVerificationError,
  TOKEN_CREATION_FEEDBACK as FEEDBACK,
  secretErrors,
  type TokenCreationError,
} from "./tokenCreationFeedback"
import { SECONDS_PER_DAY, TOKEN_EXPIRY_MODES } from "./tokenExpiry"
import {
  availableTokenMethods,
  buildVerificationInput,
  DEFAULT_TOKEN_VERIFICATION_INPUT,
  hasVerificationInput,
} from "./tokenVerification"

const SLOW_VERIFICATION_CANCEL_MS = 1500

/** Owns the draft and keeps verification, issuance, and recovery in order. */
export function useNewApiTokenCreation({
  flow,
  onCreated,
  onReconnect,
  reconnecting,
  sessionRevision,
  siteOpening,
  onBusyChange,
  reviewing,
  onReviewingChange,
}: {
  flow: NewApiAccessTokenCreation
  onCreated: (token: string) => void
  onReconnect?: () => void
  reconnecting: boolean
  sessionRevision?: unknown
  siteOpening: boolean
  onBusyChange?: (busy: boolean) => void
  reviewing: boolean
  onReviewingChange: (reviewing: boolean) => void
}) {
  const [capabilities, setCapabilities] = useState<NewApiTokenCapabilities>()
  const [name, setName] = useState("All API Hub")
  const [days, setDays] = useState("")
  const [expiryMode, setExpiryMode] = useState<string>(TOKEN_EXPIRY_MODES.NEVER)
  const [scopes, setScopes] = useState<string[]>([])
  const [{ method, secret }, setVerificationInput] = useState(
    DEFAULT_TOKEN_VERIFICATION_INPUT,
  )
  const [provider, setProvider] = useState("")
  const [pending, setPending] = useState(false)
  const [showSlowCancel, setShowSlowCancel] = useState(false)
  const [created, setCreated] = useState(false)
  const [complete, setComplete] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [recoveryPending, setRecoveryPending] = useState(false)
  const [error, setError] = useState<TokenCreationError | "">("")
  const busy = useRef(false)
  const cancelledByUser = useRef(false)
  const initialized = useRef(false)
  const [revision, setRevision] = useState(0)
  const canCancelImmediately =
    !created && (method === METHODS.OAUTH || method === METHODS.PASSKEY)

  useEffect(() => {
    let active = true
    setError("")
    void flow
      .load()
      .then((value) => {
        if (!active) return
        setCapabilities(value)
        setUncertain(value.creationUncertain === true)
        if (value.creationUncertain) setError(FEEDBACK.UNCERTAIN)
        const isInitial = !initialized.current
        if (isInitial) {
          setDays(String(value.catalog.default_expiry_days))
          setScopes(
            getNewApiTokenCatalogPermissions(value.catalog).map(
              ({ scope }) => scope,
            ),
          )
          initialized.current = true
        }
        const methods = availableTokenMethods(value.verification)
        setVerificationInput((current) => {
          const nextMethod =
            !isInitial && methods.includes(current.method)
              ? current.method
              : (methods[0] ?? current.method)
          return nextMethod === current.method
            ? current
            : { method: nextMethod, secret: "" }
        })
        const providers = value.verification.oauth_providers
        setProvider((current) =>
          providers.some(({ slug }) => slug === current)
            ? current
            : (providers[0]?.slug ?? ""),
        )
      })
      .catch(() => {
        if (active) setError(FEEDBACK.UNAVAILABLE)
      })
    return () => {
      active = false
    }
  }, [flow, revision, sessionRevision])

  useEffect(() => {
    onBusyChange?.(pending || recoveryPending || (reviewing && reconnecting))
  }, [onBusyChange, pending, reconnecting, recoveryPending, reviewing])

  useEffect(() => {
    if (!pending || canCancelImmediately) return
    const timer = setTimeout(
      () => setShowSlowCancel(true),
      SLOW_VERIFICATION_CANCEL_MS,
    )
    return () => clearTimeout(timer)
  }, [pending, canCancelImmediately])

  const catalogPermissions = capabilities
    ? getNewApiTokenCatalogPermissions(capabilities.catalog)
    : []
  const catalogScopes = catalogPermissions.map(({ scope }) => scope)
  const grantedScopes = catalogScopes.filter(
    (scope) => scope === ACCESS_SCOPES.PROFILE_READ || scopes.includes(scope),
  )
  const availableMethods = capabilities
    ? availableTokenMethods(capabilities.verification)
    : []
  const blocked =
    pending || uncertain || reconnecting || reviewing || siteOpening
  const disabled = blocked || created
  const expiryDays = Number(
    expiryMode === TOKEN_EXPIRY_MODES.CUSTOM ? days : expiryMode,
  )
  const canSubmit =
    !blocked &&
    (created ||
      (Boolean(name.trim()) &&
        grantedScopes.includes(ACCESS_SCOPES.PROFILE_READ) &&
        (expiryMode === TOKEN_EXPIRY_MODES.NEVER ||
          (Number.isSafeInteger(expiryDays) && expiryDays >= 1)) &&
        availableMethods.includes(method) &&
        hasVerificationInput(method, secret, provider)))

  const submit = async () => {
    if (busy.current || !canSubmit) return
    busy.current = true
    cancelledByUser.current = false
    setPending(true)
    setError("")
    const input = buildVerificationInput(method, secret, provider)
    try {
      const result = created
        ? await flow.verifyCreated()
        : await flow.create(
            {
              name,
              scopes: grantedScopes,
              expires_at:
                expiryMode === TOKEN_EXPIRY_MODES.NEVER
                  ? 0
                  : Math.floor(Date.now() / 1000) +
                    expiryDays * SECONDS_PER_DAY,
            },
            input,
          )
      if (!created)
        setVerificationInput((current) => ({ ...current, secret: "" }))
      setCreated(true)
      if (result.verified) {
        onCreated(result.token)
        setComplete(true)
      } else setError(FEEDBACK.VALIDATION_FAILED)
    } catch (error) {
      if (error instanceof NewApiTokenCreationUncertainError) {
        setVerificationInput((current) => ({ ...current, secret: "" }))
        setUncertain(true)
        setError(FEEDBACK.UNCERTAIN)
      } else if (!cancelledByUser.current) {
        setError(
          created
            ? FEEDBACK.VALIDATION_FAILED
            : classifyVerificationError(error, method),
        )
      }
    } finally {
      cancelledByUser.current = false
      busy.current = false
      setPending(false)
      setShowSlowCancel(false)
    }
  }

  const retryLoad = () => {
    if (onReconnect) onReconnect()
    else setRevision((value) => value + 1)
  }
  const cancelVerification = () => {
    cancelledByUser.current = true
    flow.cancelVerification()
  }
  const clearCreated = () => {
    setCreated(false)
    if (!uncertain) setError("")
  }
  const finishReview = async (revokedCreated: boolean) => {
    if (revokedCreated) clearCreated()
    if (uncertain) {
      await flow.acknowledgeUncertain()
      setUncertain(false)
      setError("")
    } else if (!created) {
      setError("")
    }
    onReviewingChange(false)
  }

  return {
    capabilities,
    settings: { name, setName, days, setDays, expiryMode, setExpiryMode },
    permissions: { catalogPermissions, grantedScopes, setScopes },
    verification: {
      method,
      setMethod: (method: NewApiTokenVerification["method"]) =>
        setVerificationInput({ method, secret: "" }),
      provider,
      setProvider,
      secret,
      setSecret: (secret: string) => {
        setVerificationInput((current) => ({ ...current, secret }))
        setError((current) =>
          current && secretErrors.has(current) ? "" : current,
        )
      },
      secretInvalid: Boolean(error && secretErrors.has(error)),
    },
    hasAvailableMethods: availableMethods.length > 0,
    complete,
    created,
    disabled,
    pending,
    canSubmit,
    canCancel: pending && (canCancelImmediately || showSlowCancel),
    cancelVerification,
    error,
    retryLoad,
    submit,
    recovery: {
      uncertain,
      finishReview,
      clearCreated,
      setRecoveryPending,
    },
  }
}
