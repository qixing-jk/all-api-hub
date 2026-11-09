import {
  BROWSER_LOGIN_FAILURE_REASONS,
  BROWSER_LOGIN_PAGE_TIMEOUT_MS,
  BROWSER_LOGIN_SESSION_MODES,
  BROWSER_LOGIN_STATUS,
  LOGIN_VERIFICATION_REASONS,
  type BrowserLoginFailureReason,
} from "~/constants/browserLogin"
import {
  TURNSTILE_AUTO_ASSIST_MS,
  TURNSTILE_MANUAL_WAIT_MS,
} from "~/constants/turnstile"
import type {
  AccountLoginCredential,
  AccountLoginEvidence,
  AccountLoginResult,
} from "~/services/apiAdapters/contracts/accountLogin"
import {
  createBrowserLoginContext,
  type BrowserLoginContextOptions,
} from "~/services/browserLogin/browserLogin"
import { ProtectionPageTimeoutError } from "~/services/browsingContext/tempPage/tempContextProtectionGuards"
import type { AccountPasswordCredentials } from "~/types/accountLogin"
import { isRecord } from "~/utils/core/object"

import {
  PASSWORD_UI_KINDS,
  PASSWORD_UI_PHASES,
  PASSWORD_UI_REASONS,
  type PasswordUiPhase,
} from "./passwordUiProtocol"

interface BrowserPasswordFlow {
  id: string
  concurrencyKey: string
  displayName: string
  loginPath: string
  uiAction: string
  loginAction: string
  clearEvidenceAction: string
  credentials: AccountPasswordCredentials
  observeNativeLogin?: (
    tabId: number,
    origin: string,
    requestId: string,
  ) => Promise<NativeLoginObservation | null>
  captureCredential?: (
    tabId: number,
    origin: string,
  ) => Promise<AccountLoginCredential | null>
}

/** One native submission's projected response, owned by its browser attempt. */
export interface NativeLoginObservation {
  result: Promise<AccountLoginResult | null>
  dispose(): Promise<void>
}

/** Page preparation has not dispatched authentication. */
function pagePreparationFailure(error: unknown) {
  return error instanceof ProtectionPageTimeoutError
    ? {
        status: BROWSER_LOGIN_STATUS.InteractionRequired,
        reason: BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired,
      }
    : {
        status: BROWSER_LOGIN_STATUS.Failed,
        reason: BROWSER_LOGIN_FAILURE_REASONS.PageUnavailable,
      }
}

/** Native execution shares session scheduling, while retaining its own result contract. */
export function createBrowserPasswordContext(
  flow: BrowserPasswordFlow,
  options: BrowserLoginContextOptions = {},
) {
  return createBrowserLoginContext<AccountLoginEvidence>(
    {
      ...flow,
      preferIncognito: true,
      joinConcurrent: false,
      failure: () => ({ status: BROWSER_LOGIN_STATUS.Failed }),
      async execute(session) {
        const { input } = session
        let nativeObservation: NativeLoginObservation | null = null
        let nativeSettled = false
        let nativeResult: AccountLoginResult | null = null
        if (!input.expectedIdentity)
          return { status: BROWSER_LOGIN_STATUS.Failed }
        try {
          await session.waitForPageReady()
        } catch (error) {
          return pagePreparationFailure(error)
        }
        try {
          const context = {
            origin: input.origin,
            expectedIdentity: input.expectedIdentity,
            sessionMode: input.sessionMode ?? BROWSER_LOGIN_SESSION_MODES.Reuse,
          }
          let response = await session.send(flow.uiAction, {
            ...context,
            phase: PASSWORD_UI_PHASES.Prepare,
            canResetSession: await session.canResetSession(),
          })
          if (
            isRecord(response) &&
            response.status === BROWSER_LOGIN_STATUS.InteractionRequired &&
            response.reason ===
              BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired
          ) {
            // A rejected preflight has not submitted credentials. Give the real
            // login page one chance to refresh its browser protection state.
            try {
              await session.navigate(new URL(flow.loginPath, input.origin).href)
              await session.waitForPageReady()
            } catch (error) {
              return pagePreparationFailure(error)
            }
            response = await session.send(flow.uiAction, {
              ...context,
              phase: PASSWORD_UI_PHASES.Prepare,
              canResetSession: await session.canResetSession(),
            })
          }
          if (
            isRecord(response) &&
            response.kind === PASSWORD_UI_KINDS.Reload
          ) {
            await session.navigate(new URL(flow.loginPath, input.origin).href)
            await session.waitForTab(
              (tab) =>
                tab.status === "complete" &&
                tab.url?.startsWith(input.origin + "/") === true,
              BROWSER_LOGIN_PAGE_TIMEOUT_MS,
            )
            await session.waitForPageReady()
            response = await session.send(flow.uiAction, {
              ...context,
              phase: PASSWORD_UI_PHASES.Prepare,
              canResetSession: false,
            })
          }
          if (
            isRecord(response) &&
            response.kind === PASSWORD_UI_KINDS.Fallback
          ) {
            // Only a pre-submission, verification-free native preparation may opt in.
            response = await session.send(flow.loginAction, {
              ...context,
              credentials: flow.credentials,
            })
            if (
              isRecord(response) &&
              response.status === BROWSER_LOGIN_STATUS.InteractionRequired
            )
              response = { kind: PASSWORD_UI_KINDS.Manual }
          }
          if (
            isRecord(response) &&
            (
              [
                PASSWORD_UI_KINDS.Ready,
                PASSWORD_UI_KINDS.Manual,
              ] as readonly string[]
            ).includes(String(response.kind))
          ) {
            let phase: PasswordUiPhase =
              response.kind === PASSWORD_UI_KINDS.Ready
                ? PASSWORD_UI_PHASES.Submit
                : response.reason === PASSWORD_UI_REASONS.Session
                  ? PASSWORD_UI_PHASES.Prepare
                  : PASSWORD_UI_PHASES.Observe
            let submitted = false
            let reminded = false
            const started = Date.now()
            let deadline = started + TURNSTILE_MANUAL_WAIT_MS
            while (
              Date.now() <= Math.max(deadline, session.interactionDeadline())
            ) {
              await session.assertOrigin()
              if (nativeResult) {
                response = nativeResult
                break
              }
              if (phase === PASSWORD_UI_PHASES.Submit) {
                // Login evidence proves this check-in, but does not replace
                // verification that a captured Cookie authenticates requests.
                if (
                  !input.captureCredential &&
                  !nativeObservation &&
                  flow.observeNativeLogin
                ) {
                  nativeObservation = await flow.observeNativeLogin(
                    session.tabId,
                    input.origin,
                    input.requestId,
                  )
                  void nativeObservation?.result.then(
                    (result) => {
                      nativeResult = result
                      nativeSettled = true
                    },
                    () => {
                      nativeSettled = true
                    },
                  )
                }
                // Never send a second submit, even if navigation destroys its reply.
                submitted = true
                try {
                  response = await session.send(flow.uiAction, {
                    ...context,
                    phase,
                    credentials: flow.credentials,
                  })
                } catch {
                  response = { kind: PASSWORD_UI_KINDS.Submitted }
                }
                phase = PASSWORD_UI_PHASES.Observe
                deadline = Date.now() + TURNSTILE_MANUAL_WAIT_MS
              } else if (nativeObservation && !nativeSettled) {
                // The native request owns its response. Do not race it with
                // another session API call while it is still in flight.
                response = { kind: PASSWORD_UI_KINDS.Pending }
              } else {
                try {
                  response = await session.send(flow.uiAction, {
                    ...context,
                    phase,
                    canResetSession: false,
                  })
                } catch {
                  response = { kind: PASSWORD_UI_KINDS.Pending }
                }
              }
              if (isRecord(response) && "status" in response) break
              if (phase === PASSWORD_UI_PHASES.Prepare && isRecord(response)) {
                if (response.kind === PASSWORD_UI_KINDS.Ready) {
                  phase = PASSWORD_UI_PHASES.Submit
                  continue
                }
                if (
                  response.kind === PASSWORD_UI_KINDS.Manual &&
                  response.reason !== PASSWORD_UI_REASONS.Session
                )
                  phase = PASSWORD_UI_PHASES.Observe
                // A manual handoff never re-enters the API fallback.
              }
              if (
                !reminded &&
                Date.now() - started >= TURNSTILE_AUTO_ASSIST_MS
              ) {
                reminded = true
                await session.requestAssist(
                  phase === PASSWORD_UI_PHASES.Prepare
                    ? LOGIN_VERIFICATION_REASONS.Session
                    : LOGIN_VERIFICATION_REASONS.Login,
                )
              }
              await new Promise((resolve) => setTimeout(resolve, 750))
            }
            if (
              (!isRecord(response) || !("status" in response)) &&
              nativeObservation
            ) {
              if (nativeResult) response = nativeResult
              else {
                // A page may retain its transport before observation was armed.
                // End capture before one final read-only session verification;
                // never replay submission or poll alongside the native request.
                await nativeObservation.dispose()
                nativeObservation = null
                await session.assertOrigin()
                response =
                  nativeResult ??
                  (await session.send(flow.uiAction, {
                    ...context,
                    phase: PASSWORD_UI_PHASES.Observe,
                    canResetSession: false,
                  }))
              }
            }
            if (!isRecord(response) || !("status" in response))
              return {
                status: submitted
                  ? BROWSER_LOGIN_STATUS.Uncertain
                  : BROWSER_LOGIN_STATUS.InteractionRequired,
              }
          }
          if (!isRecord(response))
            return { status: BROWSER_LOGIN_STATUS.Uncertain }
          if (response.status === BROWSER_LOGIN_STATUS.Authenticated) {
            if (response.identity !== input.expectedIdentity)
              return { status: BROWSER_LOGIN_STATUS.IdentityMismatch }
            return {
              status: BROWSER_LOGIN_STATUS.Authenticated,
              identity: input.expectedIdentity,
              evidence:
                isRecord(response.evidence) &&
                typeof response.evidence.checkedIn === "boolean"
                  ? { checkedIn: response.evidence.checkedIn }
                  : {},
            }
          }
          switch (response.status) {
            case BROWSER_LOGIN_STATUS.Cancelled:
            case BROWSER_LOGIN_STATUS.Unsupported:
            case BROWSER_LOGIN_STATUS.Failed:
            case BROWSER_LOGIN_STATUS.IdentityMismatch:
            case BROWSER_LOGIN_STATUS.InteractionRequired:
            case BROWSER_LOGIN_STATUS.Uncertain:
              return {
                status: response.status,
                ...(Object.values(BROWSER_LOGIN_FAILURE_REASONS).includes(
                  response.reason as BrowserLoginFailureReason,
                )
                  ? { reason: response.reason as BrowserLoginFailureReason }
                  : {}),
              }
            default:
              return { status: BROWSER_LOGIN_STATUS.Uncertain }
          }
        } catch (error) {
          // A dispatched authentication mutation may have succeeded. Never replay it.
          return {
            status: BROWSER_LOGIN_STATUS.Uncertain,
            ...(error instanceof ProtectionPageTimeoutError
              ? { reason: BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired }
              : {}),
          }
        } finally {
          await nativeObservation?.dispose().catch(() => {})
        }
      },
    },
    options,
  )
}
