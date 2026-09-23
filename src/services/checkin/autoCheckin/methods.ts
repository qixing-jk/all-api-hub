import {
  CHECK_IN_EXECUTION_SKIP_REASONS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_EXECUTION_RESULT_KINDS,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
  CHECK_IN_SELECTION_MODES,
} from "~/constants/checkIn"
import { normalizeAccountIdentity } from "~/services/accounts/accountIdentity"
import { normalizeAccountSiteProfileUrlForOriginKey } from "~/services/accounts/accountSiteProfile"
import { ApiError } from "~/services/apiTransport/errors"
import {
  AUTO_CHECKIN_ERROR_CATEGORIES,
  classifyAutoCheckinError,
} from "~/services/checkin/autoCheckin/errors"
import {
  inspectAccountCheckIn,
  resolveSelectedCheckInMethod,
} from "~/services/checkin/autoCheckin/inspection"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type {
  AutoCheckinMutationLifecycle,
  AutoCheckinProvider,
  AutoCheckinProviderContext,
} from "~/services/checkin/autoCheckin/providers/contracts"
import { readProviderDetectResult } from "~/services/checkin/autoCheckin/providers/detection"
import {
  isCheckInMethodId,
  type AutoCheckinMethodRegistration,
} from "~/services/checkin/autoCheckin/providers/registry"
import { AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS } from "~/services/checkin/autoCheckin/providers/shared"
import type { AutoCheckinProviderResult } from "~/services/checkin/autoCheckin/providers/types"
import {
  isPersistableInitialCheckInDetection,
  replaceCheckInMethodDetection,
  replaceCheckInMethodStatus,
} from "~/services/checkin/autoCheckin/state"
import type { SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RECONCILIATION_OUTCOME,
  CHECKIN_RESULT_STATUS,
  getAutoCheckinSkipReasonTranslationKey,
  type AutoCheckinSkipReason,
} from "~/types/autoCheckin"
import type {
  CheckInConfig,
  CheckInExecutionSkipReason,
  CheckInMethodDetection,
  CheckInMethodId,
  CheckInMethodStatus,
  CheckInMethodUnknownReason,
} from "~/types/checkIn"

export { setCheckInSelection } from "~/services/checkin/autoCheckin/discovery"

type ExecuteSelectedCheckInResult =
  | {
      kind: typeof CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed
      methodId: CheckInMethodId
      result: AutoCheckinProviderResult
      /** Whether a later attempt can safely begin with authoritative readback. */
      retryable: boolean
    }
  | {
      kind: typeof CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped
      reason: CheckInExecutionSkipReason
    }
  | {
      /** Execution or local state recovery failed; persisted as an existing failed result. */
      kind: typeof CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Blocked
      reason: CheckInExecutionSkipReason
      retryable: boolean
    }

const resolveSelectedCheckInRegistration = (input: {
  account: SiteAccount
  globalAutomaticExecutionEnabled: boolean
  loginProviderClaimedByAnother?: boolean
}) => {
  const state = inspectAccountCheckIn({
    config: input.account.checkIn,
    siteType: input.account.site_type,
    siteUrl: input.account.site_url,
    accountDisabled: input.account.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    loginProviderClaimedByAnother: input.loginProviderClaimedByAnother,
  })
  const registration = state.executionEligibility.eligible
    ? autoCheckinMethodRegistry.resolveById(state.executionEligibility.methodId)
    : null

  return { state, registration }
}

const toProviderReadinessSkipReason = (
  reason:
    | typeof CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing
    | typeof CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
): CheckInExecutionSkipReason =>
  reason === CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing
    ? CHECK_IN_EXECUTION_SKIP_REASONS.CredentialsMissing
    : CHECK_IN_EXECUTION_SKIP_REASONS.AccountDataMissing

const toStatusReadSkipReason = (
  error: unknown,
  classifyStatusError?: AutoCheckinProvider["classifyStatusError"],
): CheckInExecutionSkipReason => {
  if (
    error instanceof ApiError &&
    (error.statusCode === 404 || error.statusCode === 405)
  ) {
    return CHECK_IN_EXECUTION_SKIP_REASONS.MethodUnsupported
  }
  if (classifyStatusError) {
    return toUnknownStatusSkipReason(classifyStatusError(error))
  }
  switch (classifyAutoCheckinError(error)) {
    case AUTO_CHECKIN_ERROR_CATEGORIES.AuthenticationRequired:
      return CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired
    case AUTO_CHECKIN_ERROR_CATEGORIES.Network:
      return CHECK_IN_EXECUTION_SKIP_REASONS.NetworkError
    case AUTO_CHECKIN_ERROR_CATEGORIES.PermissionDenied:
      return CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied
    case AUTO_CHECKIN_ERROR_CATEGORIES.SourceUnavailable:
      return CHECK_IN_EXECUTION_SKIP_REASONS.SourceUnavailable
    case AUTO_CHECKIN_ERROR_CATEGORIES.Timeout:
      return CHECK_IN_EXECUTION_SKIP_REASONS.Timeout
    default:
      return CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable
  }
}

const NON_RETRYABLE_PROVIDER_FAILURE_REASONS: ReadonlySet<AutoCheckinSkipReason> =
  new Set([
    AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED,
    AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
    AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED,
  ])

const canSafelyRetryProviderResult = (
  result: AutoCheckinProviderResult,
  hasStatusReadback: boolean,
): boolean =>
  result.status === CHECKIN_RESULT_STATUS.FAILED &&
  hasStatusReadback &&
  result.retryable !== false &&
  !(
    result.reasonCode &&
    NON_RETRYABLE_PROVIDER_FAILURE_REASONS.has(result.reasonCode)
  )

const canRetryStatusConfirmationFailure = (
  reason: CheckInExecutionSkipReason,
): boolean =>
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.NetworkError ||
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.Timeout ||
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.SourceUnavailable

const statusReadFailure = (
  reason: CheckInExecutionSkipReason,
): ExecuteSelectedCheckInResult =>
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired ||
  reason === CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied
    ? { kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped, reason }
    : {
        kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Blocked,
        reason,
        retryable: canRetryStatusConfirmationFailure(reason),
      }

const toUnknownStatusSkipReason = (
  reason: CheckInMethodUnknownReason,
): CheckInExecutionSkipReason => {
  switch (reason) {
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.AuthenticationRequired:
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.IdentityMismatch:
      return CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.PermissionDenied:
      return CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.CredentialPersistenceFailed:
      return CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Network:
      return CHECK_IN_EXECUTION_SKIP_REASONS.NetworkError
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.Timeout:
      return CHECK_IN_EXECUTION_SKIP_REASONS.Timeout
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.SourceUnavailable:
      return CHECK_IN_EXECUTION_SKIP_REASONS.SourceUnavailable
    case CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse:
      return CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable
  }
}

const accountStateWriteFailure = (): ExecuteSelectedCheckInResult => ({
  kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Blocked,
  reason: CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable,
  retryable: false,
})

const createMutationLifecycle = (): AutoCheckinMutationLifecycle => {
  const lifecycle: AutoCheckinMutationLifecycle = {
    dispatched: false,
    responseReceived: false,
    onDispatch() {
      lifecycle.dispatched = true
    },
    onResponse() {
      lifecycle.responseReceived = true
    },
    onPreHandlerUnauthorized() {
      lifecycle.dispatched = false
      lifecycle.responseReceived = false
    },
  }
  return lifecycle
}

type RevalidateCheckInAccount = (
  refreshedConfig?: CheckInConfig,
) => Promise<SiteAccount | null>

/** Saves authoritative capability loss through the account-state merge used by status readback. */
const persistUnsupportedMethod = async (
  account: SiteAccount,
  methodId: CheckInMethodId,
  revalidateAccount?: RevalidateCheckInAccount,
): Promise<boolean> => {
  if (!revalidateAccount) return true
  try {
    return (
      (await revalidateAccount(
        replaceCheckInMethodDetection({
          config: account.checkIn,
          methodId,
          detection: {
            outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
            evidence: {
              source: CHECK_IN_METHOD_DETECTION_EVIDENCE_SOURCES.Probe,
              observedAt: Date.now(),
            },
          },
        }),
      )) !== null
    )
  } catch {
    return false
  }
}

const hasSameCheckInAccountIdentity = (
  currentAccount: SiteAccount,
  latestAccount: SiteAccount,
): boolean =>
  latestAccount.id === currentAccount.id &&
  latestAccount.site_type === currentAccount.site_type &&
  normalizeAccountIdentity(latestAccount.account_info?.id) ===
    normalizeAccountIdentity(currentAccount.account_info?.id) &&
  normalizeAccountSiteProfileUrlForOriginKey({
    siteType: latestAccount.site_type,
    url: latestAccount.site_url,
  }) ===
    normalizeAccountSiteProfileUrlForOriginKey({
      siteType: currentAccount.site_type,
      url: currentAccount.site_url,
    })

/** Rechecks account identity, intent, selection, and readiness before a recovered POST. */
const createRecoveredMutationGuard = (input: {
  currentAccount: SiteAccount
  refreshedConfig?: CheckInConfig
  globalAutomaticExecutionEnabled: boolean
  registration: AutoCheckinMethodRegistration
  revalidateAccount?: RevalidateCheckInAccount
  isAutomaticExecutionEnabled?: () => Promise<boolean>
}): (() => Promise<boolean>) | undefined => {
  const revalidateAccount = input.revalidateAccount
  if (!revalidateAccount) return undefined

  return async () => {
    let latestAccount: SiteAccount | null
    try {
      latestAccount = await revalidateAccount(input.refreshedConfig)
    } catch {
      return false
    }
    if (
      !latestAccount ||
      !hasSameCheckInAccountIdentity(input.currentAccount, latestAccount)
    ) {
      return false
    }

    const latestState = inspectAccountCheckIn({
      config: latestAccount.checkIn,
      siteType: latestAccount.site_type,
      siteUrl: latestAccount.site_url,
      accountDisabled: latestAccount.disabled,
      globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    })
    return (
      latestState.executionEligibility.eligible &&
      latestState.executionEligibility.methodId === input.registration.id &&
      input.registration.provider.getReadiness(latestAccount).ready &&
      (!input.isAutomaticExecutionEnabled ||
        (await input.isAutomaticExecutionEnabled()))
    )
  }
}

const reconcileUncertainResult = async (input: {
  account: SiteAccount
  providerResult: AutoCheckinProviderResult
  getStatus?: NonNullable<AutoCheckinProvider["getStatus"]>
  retryAfterNotChecked: boolean
}): Promise<AutoCheckinProviderResult> => {
  if (!input.getStatus) {
    return {
      ...input.providerResult,
      retryable: false,
      reconciliation: CHECKIN_RECONCILIATION_OUTCOME.UNAVAILABLE,
    }
  }

  try {
    const status = await input.getStatus({
      account: input.account,
      observedAt: Date.now(),
    })
    if (status?.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known) {
      return {
        ...input.providerResult,
        retryable: false,
        reconciliation: status
          ? CHECKIN_RECONCILIATION_OUTCOME.UNKNOWN
          : CHECKIN_RECONCILIATION_OUTCOME.UNAVAILABLE,
      }
    }
    if (status.today === CHECK_IN_METHOD_TODAY_STATUSES.Checked) {
      return {
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey:
          AUTO_CHECKIN_PROVIDER_FALLBACK_MESSAGE_KEYS.checkinSuccessful,
        data: input.providerResult.data,
        retryable: false,
        reconciliation: CHECKIN_RECONCILIATION_OUTCOME.CHECKED,
      }
    }
    if (status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked) {
      return {
        ...input.providerResult,
        retryable: false,
        reconciliation: CHECKIN_RECONCILIATION_OUTCOME.UNKNOWN,
      }
    }
    return {
      ...input.providerResult,
      ...(input.retryAfterNotChecked &&
      status.availability === CHECK_IN_METHOD_AVAILABILITIES.Enabled
        ? {
            status: CHECKIN_RESULT_STATUS.FAILED,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
            messageKey: getAutoCheckinSkipReasonTranslationKey(
              AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
            ),
            retryable: true,
          }
        : { retryable: false }),
      reconciliation: CHECKIN_RECONCILIATION_OUTCOME.NOT_CHECKED,
    }
  } catch {
    return {
      ...input.providerResult,
      retryable: false,
      reconciliation: CHECKIN_RECONCILIATION_OUTCOME.UNAVAILABLE,
    }
  }
}

/** Adds provider authentication readiness without exposing the provider. */
export function inspectSelectedCheckInCompatibility(input: {
  account: SiteAccount
  globalAutomaticExecutionEnabled: boolean
  loginProviderClaimedByAnother?: boolean
}) {
  const { state, registration } = resolveSelectedCheckInRegistration({
    account: input.account,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    loginProviderClaimedByAnother: input.loginProviderClaimedByAnother,
  })
  const providerReadiness = registration?.provider.getReadiness(input.account)
  return {
    state,
    providerReadiness: providerReadiness ?? null,
    providerAvailable: providerReadiness?.ready === true,
  }
}

/** Records the first probe for one method without changing the saved selection. */
const recordInitialMethodProbe = (input: {
  config: CheckInConfig
  methodId: CheckInMethodId
  detection: CheckInMethodDetection
  status?: CheckInMethodStatus
}): CheckInConfig => {
  const previous = input.config.methodKnowledge.methods[input.methodId]
  if (previous?.detection) return input.config
  return {
    ...input.config,
    methodKnowledge: {
      ...input.config.methodKnowledge,
      methods: {
        ...input.config.methodKnowledge.methods,
        [input.methodId]: {
          detection: input.detection,
          ...(input.status ? { status: input.status } : {}),
        },
      },
    },
  }
}

/** Confirms one selected method with that provider's own request timing. */
const probeSelectedMethod = async (
  registration: AutoCheckinMethodRegistration,
  account: SiteAccount,
): Promise<
  | { detection: CheckInMethodDetection; status?: CheckInMethodStatus }
  | undefined
> => {
  if (!registration.provider.detect) return undefined
  try {
    return readProviderDetectResult(
      await registration.provider.detect({
        account,
        observedAt: Date.now(),
      }),
    )
  } catch {
    return undefined
  }
}

/**
 * A manual choice stays fixed, but a candidate with no detection record is
 * confirmed before execution. Uncertain probes are not saved, so a later run
 * can try the same method again.
 */
const confirmUnrecordedManualCheckInMethod = async (input: {
  account: SiteAccount
  globalAutomaticExecutionEnabled: boolean
  loginProviderClaimedByAnother?: boolean
  revalidateAccount?: RevalidateCheckInAccount
}): Promise<
  | { outcome: "continue"; account: SiteAccount }
  | { outcome: "finished"; result: ExecuteSelectedCheckInResult }
> => {
  const selection = input.account.checkIn.selection
  const methodId = selection.methodId
  if (
    selection.mode !== CHECK_IN_SELECTION_MODES.Manual ||
    !isCheckInMethodId(methodId) ||
    input.account.checkIn.methodKnowledge.methods[methodId]?.detection
  ) {
    return { outcome: "continue", account: input.account }
  }

  const state = inspectAccountCheckIn({
    config: input.account.checkIn,
    siteType: input.account.site_type,
    siteUrl: input.account.site_url,
    accountDisabled: input.account.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    loginProviderClaimedByAnother: input.loginProviderClaimedByAnother,
  })
  if (
    state.executionEligibility.eligible ||
    state.executionEligibility.skipReason !==
      CHECK_IN_EXECUTION_SKIP_REASONS.MethodNotMatched
  ) {
    return { outcome: "continue", account: input.account }
  }

  const registration = autoCheckinMethodRegistry.resolveById(methodId)
  if (!registration) {
    return { outcome: "continue", account: input.account }
  }
  const probed = await probeSelectedMethod(registration, input.account)
  if (!probed || !isPersistableInitialCheckInDetection(probed.detection)) {
    return { outcome: "continue", account: input.account }
  }

  const updatedConfig = recordInitialMethodProbe({
    config: input.account.checkIn,
    methodId,
    detection: probed.detection,
    status: probed.status,
  })
  let account = { ...input.account, checkIn: updatedConfig }
  if (input.revalidateAccount) {
    try {
      const persisted = await input.revalidateAccount(updatedConfig)
      if (!persisted) {
        return { outcome: "finished", result: accountStateWriteFailure() }
      }
      const persistedDetection =
        persisted.checkIn.methodKnowledge.methods[methodId]?.detection
      if (persistedDetection) account = persisted
    } catch {
      return { outcome: "finished", result: accountStateWriteFailure() }
    }
  }
  if (
    probed.detection.outcome === CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported
  ) {
    return {
      outcome: "finished",
      result: {
        kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
        reason: CHECK_IN_EXECUTION_SKIP_REASONS.MethodUnsupported,
      },
    }
  }
  return { outcome: "continue", account }
}

/** Compatibility execution entrance used by the scheduler. */
export async function executeSelectedCheckIn(input: {
  account: SiteAccount
  globalAutomaticExecutionEnabled: boolean
  context: AutoCheckinProviderContext
  revalidateAccount?: RevalidateCheckInAccount
  /** Rechecks unattended-run intent immediately before an initial or recovered POST. */
  isAutomaticExecutionEnabled?: () => Promise<boolean>
  /**
   * Resolved cross-account fact: another enabled account already owns the
   * browser login provider this account claims. Unset keeps the run unblocked.
   */
  loginProviderClaimedByAnother?: boolean
  /**
   * Retry safety guard: a provider with readback must confirm current status
   * before another mutation. Providers may also require this for initial
   * daily/manual runs through requiresAuthoritativeStatusBeforeMutation.
   */
  requireStatusConfirmationBeforeMutation?: boolean
}): Promise<ExecuteSelectedCheckInResult> {
  const prepared = await confirmUnrecordedManualCheckInMethod(input)
  if (prepared.outcome === "finished") return prepared.result
  const account = prepared.account
  const initialState = inspectAccountCheckIn({
    config: account.checkIn,
    siteType: account.site_type,
    siteUrl: account.site_url,
    accountDisabled: account.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    loginProviderClaimedByAnother: input.loginProviderClaimedByAnother,
  })
  const canRefreshCachedStatus =
    !initialState.executionEligibility.eligible &&
    (initialState.executionEligibility.skipReason ===
      CHECK_IN_EXECUTION_SKIP_REASONS.MethodDisabled ||
      initialState.executionEligibility.skipReason ===
        CHECK_IN_EXECUTION_SKIP_REASONS.AlreadyChecked)
  if (!initialState.executionEligibility.eligible && !canRefreshCachedStatus) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: initialState.executionEligibility.skipReason,
    }
  }

  const selectedMethodId = resolveSelectedCheckInMethod({
    config: account.checkIn,
    siteType: account.site_type,
    siteUrl: account.site_url,
  })
  const registration = selectedMethodId
    ? autoCheckinMethodRegistry.resolveById(selectedMethodId)
    : null
  if (!registration) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.NoProvider,
    }
  }
  const initialReadiness = registration.provider.getReadiness(account)
  if (!initialReadiness.ready) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: toProviderReadinessSkipReason(initialReadiness.reason),
    }
  }
  const requiresAuthoritativeStatus =
    input.requireStatusConfirmationBeforeMutation === true ||
    registration.provider.requiresAuthoritativeStatusBeforeMutation === true
  if (requiresAuthoritativeStatus && !registration.provider.getStatus) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
    }
  }

  let refreshedConfig: CheckInConfig | undefined
  let statusProof: AutoCheckinProviderContext["statusProof"]
  if (registration.provider.getStatus) {
    try {
      const status = await registration.provider.getStatus({
        account: account,
        observedAt: Date.now(),
      })
      if (status) {
        if (status.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown) {
          const reason = toUnknownStatusSkipReason(status.reason)
          if (
            requiresAuthoritativeStatus ||
            reason === CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired ||
            reason === CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied ||
            reason === CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable
          ) {
            return statusReadFailure(reason)
          }
        }
        if (status.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known) {
          if (
            requiresAuthoritativeStatus &&
            status.availability !== CHECK_IN_METHOD_AVAILABILITIES.Disabled &&
            status.today === undefined
          ) {
            return statusReadFailure(
              CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
            )
          }
          statusProof = status
        }
        refreshedConfig = replaceCheckInMethodStatus({
          config: account.checkIn,
          methodId: registration.id,
          status,
        })
      } else if (requiresAuthoritativeStatus) {
        return statusReadFailure(
          CHECK_IN_EXECUTION_SKIP_REASONS.StatusUnavailable,
        )
      }
    } catch (error) {
      const reason = toStatusReadSkipReason(
        error,
        registration.provider.classifyStatusError,
      )
      if (reason === CHECK_IN_EXECUTION_SKIP_REASONS.MethodUnsupported) {
        if (
          !(await persistUnsupportedMethod(
            account,
            registration.id,
            input.revalidateAccount,
          ))
        ) {
          return accountStateWriteFailure()
        }
        return { kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped, reason }
      }
      if (
        requiresAuthoritativeStatus ||
        reason === CHECK_IN_EXECUTION_SKIP_REASONS.AuthenticationRequired ||
        reason === CHECK_IN_EXECUTION_SKIP_REASONS.PermissionDenied
      ) {
        return statusReadFailure(reason)
      }
    }
  }

  let currentAccount: SiteAccount | null = refreshedConfig
    ? { ...account, checkIn: refreshedConfig }
    : account
  if (input.revalidateAccount) {
    try {
      currentAccount = await input.revalidateAccount(refreshedConfig)
    } catch {
      currentAccount = null
    }
  }
  if (
    !currentAccount ||
    !hasSameCheckInAccountIdentity(account, currentAccount)
  ) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.AccountUnavailable,
    }
  }
  const currentState = inspectAccountCheckIn({
    config: currentAccount.checkIn,
    siteType: currentAccount.site_type,
    siteUrl: currentAccount.site_url,
    accountDisabled: currentAccount.disabled,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
  })
  if (!currentState.executionEligibility.eligible) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: currentState.executionEligibility.skipReason,
    }
  }
  if (currentState.executionEligibility.methodId !== registration.id) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.MethodNotMatched,
    }
  }
  const currentReadiness = registration.provider.getReadiness(currentAccount)
  if (!currentReadiness.ready) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: toProviderReadinessSkipReason(currentReadiness.reason),
    }
  }

  if (
    input.isAutomaticExecutionEnabled &&
    !(await input.isAutomaticExecutionEnabled())
  ) {
    return {
      kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Skipped,
      reason: CHECK_IN_EXECUTION_SKIP_REASONS.GlobalAutomaticExecutionDisabled,
    }
  }

  const mutationLifecycle = createMutationLifecycle()
  const beforeRecoveredMutation = createRecoveredMutationGuard({
    currentAccount,
    refreshedConfig,
    globalAutomaticExecutionEnabled: input.globalAutomaticExecutionEnabled,
    registration,
    revalidateAccount: input.revalidateAccount,
    isAutomaticExecutionEnabled: input.isAutomaticExecutionEnabled,
  })
  const providerResult = await registration.provider.checkIn(currentAccount, {
    ...input.context,
    mutationLifecycle,
    ...(statusProof ? { statusProof } : {}),
    ...(beforeRecoveredMutation ? { beforeRecoveredMutation } : {}),
  })
  if (
    providerResult.status === CHECKIN_RESULT_STATUS.FAILED &&
    providerResult.reasonCode === AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED
  ) {
    if (
      !(await persistUnsupportedMethod(
        currentAccount,
        registration.id,
        input.revalidateAccount,
      ))
    ) {
      return accountStateWriteFailure()
    }
  }
  const result =
    providerResult.status === CHECKIN_RESULT_STATUS.UNCERTAIN
      ? await reconcileUncertainResult({
          account: currentAccount,
          providerResult,
          getStatus: registration.provider.getStatus,
          retryAfterNotChecked:
            registration.provider.retryAfterUncertainNotChecked === true,
        })
      : providerResult.status === CHECKIN_RESULT_STATUS.FAILED
        ? {
            ...providerResult,
            retryable: canSafelyRetryProviderResult(
              providerResult,
              Boolean(registration.provider.getStatus),
            ),
          }
        : providerResult
  return {
    kind: CHECK_IN_METHOD_EXECUTION_RESULT_KINDS.Executed,
    methodId: registration.id,
    result,
    retryable:
      result.status === CHECKIN_RESULT_STATUS.FAILED
        ? result.retryable === true
        : false,
  }
}
