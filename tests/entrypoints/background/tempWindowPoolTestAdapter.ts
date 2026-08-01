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
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  TEMP_CONTEXT_TASK_KINDS,
  type ProtectionBypassExecution,
  type ProtectionBypassFeature,
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

/**
 * Supplies presentation metadata to pool-level fixtures below the policy
 * boundary. It is never evidence that a feature owns the exercised task.
 */
const TEST_BELOW_POLICY_EXECUTION = {
  version: PROTECTION_BYPASS_EXECUTION_VERSION,
  kind: "automatic",
  feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
  trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
  surface: PROTECTION_BYPASS_SURFACES.Background,
} as const satisfies ProtectionBypassExecution

type TestProtectedRequest<
  T extends { protectionBypassExecution: ProtectionBypassExecution },
> = Omit<T, "protectionBypassExecution"> &
  Partial<Pick<T, "protectionBypassExecution">>

type RawPoolTestRequest<
  T extends { protectionBypassExecution: ProtectionBypassExecution },
> = Omit<T, "protectionBypassExecution">

type DormantTempContextTask = Extract<
  TempContextTask,
  {
    kind:
      | typeof TEMP_CONTEXT_TASK_KINDS.RenderedTitle
      | typeof TEMP_CONTEXT_TASK_KINDS.OpenContext
  }
>

function resolveTestExecution(request: {
  protectionBypassExecution?: ProtectionBypassExecution
  tempWindowRequestSource?: TempWindowRequestSource
}): ProtectionBypassExecution {
  return (
    request.protectionBypassExecution ?? {
      ...TEST_BELOW_POLICY_EXECUTION,
      surface:
        request.tempWindowRequestSource ?? TEST_BELOW_POLICY_EXECUTION.surface,
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
  await executePoolTaskForTest(
    task,
    authorizeAtAcquire,
    sendResponse,
    reportOutcome,
  )
}

/** Dispatches a pool fixture after its test seam selects the policy boundary. */
async function executePoolTaskForTest(
  task: {
    kind: TempContextTask["kind"]
    params: object
  },
  authorizeAtAcquire: () => Promise<ProtectionBypassPolicyDecision | undefined>,
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
      TEST_BELOW_POLICY_EXECUTION.surface,
    authorizeAtAcquire,
    sendResponse,
    reportOutcome,
  )
}

async function authorizeTestTask(
  task: TempContextTask,
  feature: ProtectionBypassFeature,
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
    feature,
    surface: "background",
    ...getTempContextTaskMetadata(task),
  }
}

const TEST_DECISION_FEATURE_BY_TASK_KIND: Partial<
  Record<TempContextTask["kind"], ProtectionBypassFeature>
> = {
  [TEMP_CONTEXT_TASK_KINDS.ApiFallbackFetch]:
    PROTECTION_BYPASS_FEATURES.AccountRefresh,
  [TEMP_CONTEXT_TASK_KINDS.ProfileIsolatedFetch]:
    PROTECTION_BYPASS_FEATURES.AccountOnboarding,
  [TEMP_CONTEXT_TASK_KINDS.TurnstileFetch]: PROTECTION_BYPASS_FEATURES.Checkin,
  [TEMP_CONTEXT_TASK_KINDS.NativePageAction]:
    PROTECTION_BYPASS_FEATURES.Checkin,
  [TEMP_CONTEXT_TASK_KINDS.SessionRead]:
    PROTECTION_BYPASS_FEATURES.AccountRefresh,
  [TEMP_CONTEXT_TASK_KINDS.NewApiSessionRead]:
    PROTECTION_BYPASS_FEATURES.KeyManagement,
  [TEMP_CONTEXT_TASK_KINDS.OpenRouterManagementKeyAction]:
    PROTECTION_BYPASS_FEATURES.AccountOnboarding,
}

function resolveTestDecisionFeature(
  task: TempContextTask,
): ProtectionBypassFeature | undefined {
  return TEST_DECISION_FEATURE_BY_TASK_KIND[task.kind]
}

/** Executes an ownerless legacy fixture below the production policy boundary. */
export async function executeRawTempContextTask(
  task: DormantTempContextTask,
  sendResponse: (response?: any) => void,
) {
  if (resolveTestDecisionFeature(task)) {
    throw new Error(`Owned task ${task.kind} requires explicit authorization`)
  }

  await executePoolTaskForTest(task, async () => undefined, sendResponse)
}

async function executeTestTask(
  task: TempContextTask,
  sendResponse: (response?: any) => void,
) {
  const feature = resolveTestDecisionFeature(task)
  if (feature) {
    await executeAuthorizedTempContextTask(
      task,
      () => authorizeTestTask(task, feature),
      sendResponse,
    )
    return
  }

  if (
    task.kind === TEMP_CONTEXT_TASK_KINDS.RenderedTitle ||
    task.kind === TEMP_CONTEXT_TASK_KINDS.OpenContext
  ) {
    // Dormant raw-pool fixtures deliberately have no policy owner or decision.
    await executeRawTempContextTask(task, sendResponse)
    return
  }

  throw new Error(`Unowned task ${task.kind} has no test authorization owner`)
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
  request: RawPoolTestRequest<TempWindowRenderedTitleParams>,
  sendResponse: (response?: any) => void,
) {
  await executeTestTask(
    { kind: "rendered_title", params: request },
    sendResponse,
  )
}
