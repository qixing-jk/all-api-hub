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
import { getBrowserLoginPageFailureReason } from "~/services/browserLogin/pageProtection"
import type { AccountPasswordCredentials } from "~/types/accountLogin"
import { isRecord } from "~/utils/core/object"

import {
  PASSWORD_UI_KINDS,
  PASSWORD_UI_PHASES,
  PASSWORD_UI_REASONS,
  type PasswordUiPhase,
} from "./passwordUiProtocol"

const PASSWORD_OBSERVATION_INTERVAL_MS = 750

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

/** Tracks the native reply while orchestration decides when to arm or stop it. */
function createNativeLoginState() {
  const state = {
    observation: null as NativeLoginObservation | null,
    settled: false,
    result: null as AccountLoginResult | null,
    observe(observation: NativeLoginObservation | null) {
      state.observation = observation
      void observation?.result.then(
        (result) => {
          state.result = result
          state.settled = true
        },
        () => {
          state.settled = true
        },
      )
    },
    async dispose() {
      await state.observation?.dispose()
      state.observation = null
    },
  }
  return state
}

/** Page preparation has not dispatched authentication. */
function pagePreparationFailure(error: unknown) {
  return getBrowserLoginPageFailureReason(error) ===
    BROWSER_LOGIN_FAILURE_REASONS.VerificationRequired
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
        const native = createNativeLoginState()
        let mutationStarted = false
        if (!input.expectedIdentity)
          return { status: BROWSER_LOGIN_STATUS.Failed }
        try {
          const context = {
            origin: input.origin,
            expectedIdentity: input.expectedIdentity,
            sessionMode: input.sessionMode ?? BROWSER_LOGIN_SESSION_MODES.Reuse,
          }
          const prepare = () =>
            session.sendSiteAction(flow.uiAction, async () => ({
              ...context,
              phase: PASSWORD_UI_PHASES.Prepare,
              canResetSession: await session.canResetSession(),
            }))
          let response = await prepare()
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
            } catch (error) {
              return pagePreparationFailure(error)
            }
            response = await prepare()
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
            response = await session.sendSiteAction(flow.uiAction, {
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
            mutationStarted = true
            try {
              response = await session.sendSiteAction(flow.loginAction, {
                ...context,
                credentials: flow.credentials,
              })
            } catch (error) {
              if (getBrowserLoginPageFailureReason(error))
                return pagePreparationFailure(error)
              throw error
            }
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
              if (native.result) {
                response = native.result
                break
              }
              if (phase === PASSWORD_UI_PHASES.Submit) {
                try {
                  response = await session.sendSiteAction(
                    flow.uiAction,
                    async () => {
                      // Arm in the document that survived page protection. Native
                      // evidence does not replace verifying a captured Cookie.
                      if (
                        !input.captureCredential &&
                        !native.observation &&
                        flow.observeNativeLogin
                      ) {
                        native.observe(
                          await flow.observeNativeLogin(
                            session.tabId,
                            input.origin,
                            input.requestId,
                          ),
                        )
                      }
                      // Never send a second submit if navigation destroys its reply.
                      submitted = true
                      mutationStarted = true
                      return {
                        ...context,
                        phase,
                        credentials: flow.credentials,
                      }
                    },
                  )
                } catch (error) {
                  if (getBrowserLoginPageFailureReason(error))
                    return pagePreparationFailure(error)
                  if (!submitted) throw error
                  response = { kind: PASSWORD_UI_KINDS.Submitted }
                }
                phase = PASSWORD_UI_PHASES.Observe
                deadline = Date.now() + TURNSTILE_MANUAL_WAIT_MS
              } else if (native.observation && !native.settled) {
                // The native request owns its response. Do not race it with
                // another session API call while it is still in flight.
                response = { kind: PASSWORD_UI_KINDS.Pending }
              } else {
                try {
                  response = await (
                    phase === PASSWORD_UI_PHASES.Observe
                      ? session.observeSubmittedAction
                      : session.sendSiteAction
                  )(flow.uiAction, {
                    ...context,
                    phase,
                    canResetSession: false,
                  })
                } catch (error) {
                  if (getBrowserLoginPageFailureReason(error)) throw error
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
              await new Promise((resolve) =>
                setTimeout(resolve, PASSWORD_OBSERVATION_INTERVAL_MS),
              )
            }
            if (
              (!isRecord(response) || !("status" in response)) &&
              native.observation
            ) {
              if (native.result) response = native.result
              else {
                // A page may retain its transport before observation was armed.
                // End capture before one final read-only session verification;
                // never replay submission or poll alongside the native request.
                await native.dispose()
                await session.assertOrigin()
                response =
                  native.result ??
                  (await session.observeSubmittedAction(flow.uiAction, {
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
          const reason = getBrowserLoginPageFailureReason(error)
          if (!mutationStarted && reason) return pagePreparationFailure(error)
          // A dispatched authentication mutation may have succeeded. Never replay it.
          return {
            status: BROWSER_LOGIN_STATUS.Uncertain,
            ...(reason ? { reason } : {}),
          }
        } finally {
          await native.dispose().catch(() => {})
        }
      },
    },
    options,
  )
}
