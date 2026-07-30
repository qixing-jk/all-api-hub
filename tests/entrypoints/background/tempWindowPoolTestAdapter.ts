import {
  cleanupTempContextsOnSuspend,
  executeAuthorizedTempContextTask as executeAuthorizedProductionTask,
  handleCloseTempWindow,
  setupTempWindowListeners,
} from "~/entrypoints/background/tempWindowPool"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
  type TempWindowFallbackPreferences,
} from "~/services/preferences/userPreferences"
import {
  getTempContextTaskMetadata,
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  type ProtectionBypassExecution,
  type TempContextTask,
} from "~/services/protectionBypass/contracts"
import type { ProtectionBypassPolicyDecision } from "~/services/protectionBypass/policy"
import type {
  TempWindowCheckinPageAction,
  TempWindowCheckinPageActionParams,
  TempWindowFetchParams,
  TempWindowRenderedTitleParams,
  TempWindowRequestSource,
  TempWindowTurnstileFetchParams,
} from "~/types/tempWindowFetch"

export {
  cleanupTempContextsOnSuspend,
  handleCloseTempWindow,
  setupTempWindowListeners,
}

const TEST_PROTECTION_BYPASS_EXECUTION: ProtectionBypassExecution = {
  version: 1,
  kind: "automatic",
  feature: PROTECTION_BYPASS_FEATURES.Verification,
  trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
  surface: PROTECTION_BYPASS_SURFACES.Background,
}

type TestProtectedRequest<
  T extends { protectionBypassExecution: ProtectionBypassExecution },
> = Omit<T, "protectionBypassExecution"> &
  Partial<Pick<T, "protectionBypassExecution">>

function resolveTestExecution(request: {
  protectionBypassExecution?: ProtectionBypassExecution
  tempWindowRequestSource?: TempWindowRequestSource
}): ProtectionBypassExecution {
  return (
    request.protectionBypassExecution ?? {
      ...TEST_PROTECTION_BYPASS_EXECUTION,
      surface:
        request.tempWindowRequestSource ??
        TEST_PROTECTION_BYPASS_EXECUTION.surface,
    }
  )
}

function withTestExecution<
  T extends { protectionBypassExecution: ProtectionBypassExecution },
>(request: TestProtectedRequest<T>): T {
  return {
    ...request,
    protectionBypassExecution: resolveTestExecution(request),
  } as T
}

/** Executes a real pool task with explicit tests-only background authorization. */
export async function executeAuthorizedTempContextTask(
  task: {
    kind: TempContextTask["kind"]
    params: object
  },
  authorizeAtAcquire: Parameters<typeof executeAuthorizedProductionTask>[2],
  sendResponse: (response?: any) => void,
  reportOutcome?: (...args: any[]) => void,
) {
  const params = task.params as Record<string, unknown> & {
    protectionBypassExecution?: ProtectionBypassExecution
    tempWindowRequestSource?: TempWindowRequestSource
  }
  const {
    protectionBypassExecution,
    tempWindowRequestSource,
    ...canonicalParams
  } = params
  await (executeAuthorizedProductionTask as any)(
    {
      ...task,
      params: canonicalParams,
    } as TempContextTask,
    protectionBypassExecution?.surface ??
      tempWindowRequestSource ??
      TEST_PROTECTION_BYPASS_EXECUTION.surface,
    authorizeAtAcquire,
    sendResponse,
    reportOutcome,
  )
}

async function authorizeTestTask(
  task: TempContextTask,
): Promise<ProtectionBypassPolicyDecision> {
  const preferences = await userPreferences.getPreferences()
  const fallback = {
    ...(DEFAULT_PREFERENCES.tempWindowFallback as TempWindowFallbackPreferences),
    ...(preferences.tempWindowFallback as
      | TempWindowFallbackPreferences
      | undefined),
  }

  return {
    kind: "allowed",
    adapter: fallback.tempContextMode,
    feature: "verification",
    surface: "background",
    ...getTempContextTaskMetadata(task),
  }
}

async function executeTestTask(
  task: TempContextTask,
  sendResponse: (response?: any) => void,
) {
  await executeAuthorizedTempContextTask(
    task,
    () => authorizeTestTask(task),
    sendResponse,
  )
}

export async function handleAutoDetectSite(
  request: Pick<
    Extract<TempContextTask, { kind: "session_read" }>["params"],
    "url"
  > &
    Partial<Extract<TempContextTask, { kind: "session_read" }>["params"]> & {
      suppressMinimize?: boolean
      tempWindowRequestSource?: TempWindowRequestSource
    },
  sendResponse: (response?: any) => void,
) {
  await executeTestTask(
    {
      kind: "session_read",
      params: {
        ...request,
        protectionBypassExecution: resolveTestExecution(request),
      } as Extract<TempContextTask, { kind: "session_read" }>["params"],
    },
    sendResponse,
  )
}

export async function handleTempWindowFetch(
  request: TestProtectedRequest<TempWindowFetchParams>,
  sendResponse: (response?: any) => void,
) {
  await executeTestTask(
    {
      kind: request.tempContextTaskKind ?? "api_fallback_fetch",
      params: withTestExecution(request),
    },
    sendResponse,
  )
}

export async function handleTempWindowCheckinPageAction(
  request: TestProtectedRequest<TempWindowCheckinPageActionParams>,
  sendResponse: (response?: TempWindowCheckinPageAction) => void,
) {
  await executeTestTask(
    { kind: "native_page_action", params: withTestExecution(request) },
    sendResponse,
  )
}

export async function handleTempWindowTurnstileFetch(
  request: TestProtectedRequest<TempWindowTurnstileFetchParams>,
  sendResponse: (response?: any) => void,
) {
  await executeTestTask(
    { kind: "turnstile_fetch", params: withTestExecution(request) },
    sendResponse,
  )
}

export async function handleTempWindowGetRenderedTitle(
  request: TestProtectedRequest<TempWindowRenderedTitleParams>,
  sendResponse: (response?: any) => void,
) {
  await executeTestTask(
    { kind: "rendered_title", params: withTestExecution(request) },
    sendResponse,
  )
}
