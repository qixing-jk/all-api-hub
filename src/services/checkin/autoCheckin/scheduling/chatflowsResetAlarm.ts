import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_AVAILABILITIES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
} from "~/constants/checkIn"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { getChatflowsCheckInPeriodBounds } from "~/services/apiService/sub2api/checkin/chatflowsCheckInProtocol"
import { logger } from "~/services/checkin/autoCheckin/diagnostics"
import { resolveSelectedCheckInMethod } from "~/services/checkin/autoCheckin/discovery/inspection"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type { AutoCheckinProviderReadContext } from "~/services/checkin/autoCheckin/providers/contracts"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import type { SiteAccount } from "~/types"
import type { CheckInMethodStatus } from "~/types/checkIn"
import { clearAlarm, createAlarm, getAlarm } from "~/utils/browser/alarms"
import {
  getLocalStorageValues,
  removeLocalStorage,
  setLocalStorage,
} from "~/utils/browser/storage"

export const CHATFLOWS_RESET_ALARM_NAME = "autoCheckinChatflowsReset"
export const CHATFLOWS_RESET_QUEUE_STORAGE_KEY =
  "autoCheckin_chatflowsResetQueue_v1"

export interface ChatflowsResetTarget {
  accountId: string
  methodId: typeof AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn
  periodKey: string
  nextResetAt: number
  statusReadAttempts?: 1
  nextAttemptAt?: number
}

interface StoredChatflowsResetQueue {
  version: 1
  targets: ChatflowsResetTarget[]
}

let queueMutationTail: Promise<void> = Promise.resolve()

/** Serializes persisted queue mutations within the extension worker. */
async function withQueueMutationLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const previous = queueMutationTail
  let release!: () => void
  queueMutationTail = new Promise<void>((resolve) => {
    release = resolve
  })
  await previous
  try {
    return await operation()
  } finally {
    release()
  }
}

/** A target is valid only when its period and reset time are protocol-derived. */
export function isChatflowsResetTarget(
  value: unknown,
): value is ChatflowsResetTarget {
  if (typeof value !== "object" || value === null) return false
  const target = value as Partial<ChatflowsResetTarget>
  if (
    typeof target.accountId !== "string" ||
    target.accountId.length === 0 ||
    target.methodId !== AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn ||
    typeof target.periodKey !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(target.periodKey) ||
    !Number.isSafeInteger(target.nextResetAt)
  ) {
    return false
  }
  const canonical = getChatflowsCheckInPeriodBounds(target.nextResetAt! - 1)
  if (
    canonical.periodKey !== target.periodKey ||
    canonical.nextResetAt !== target.nextResetAt
  ) {
    return false
  }
  if (target.statusReadAttempts === undefined) {
    return target.nextAttemptAt === undefined
  }
  if (
    target.statusReadAttempts !== 1 ||
    !Number.isSafeInteger(target.nextAttemptAt)
  ) {
    return false
  }
  const nextPeriodEnd = getChatflowsCheckInPeriodBounds(
    target.nextResetAt! + 1,
  ).nextResetAt
  return (
    target.nextAttemptAt! >= target.nextResetAt! &&
    target.nextAttemptAt! < nextPeriodEnd
  )
}

/** Returns the next wake time for a validated queue target. */
export function getChatflowsResetTargetWakeAt(target: ChatflowsResetTarget) {
  return target.nextAttemptAt ?? target.nextResetAt
}

/** Creates a queue entry only from a current, enabled checked-status proof. */
export function createChatflowsResetTarget(input: {
  accountId: string
  methodId: string | null
  automaticExecutionEnabled: boolean
  accountDisabled: boolean
  globalAutomaticExecutionEnabled: boolean
  status: CheckInMethodStatus | undefined
}): ChatflowsResetTarget | undefined {
  const status = input.status
  if (
    input.methodId !== AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn ||
    !input.automaticExecutionEnabled ||
    input.accountDisabled ||
    !input.globalAutomaticExecutionEnabled ||
    status?.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known ||
    status.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
    status.today !== CHECK_IN_METHOD_TODAY_STATUSES.Checked ||
    !("observedAt" in status.evidence)
  ) {
    return undefined
  }

  const { periodKey, nextResetAt } = getChatflowsCheckInPeriodBounds(
    status.evidence.observedAt,
  )
  if (!Number.isSafeInteger(nextResetAt) || nextResetAt <= Date.now()) {
    return undefined
  }
  return {
    accountId: input.accountId,
    methodId: AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn,
    periodKey,
    nextResetAt,
  }
}

/** Selects only due targets whose exact next period is fresh and eligible. */
export function selectRunnableChatflowsResetAccountIds(input: {
  targets: readonly ChatflowsResetTarget[]
  now: number
  globalAutomaticExecutionEnabled: boolean
  accounts: readonly SiteAccount[]
  statuses: ReadonlyMap<string, CheckInMethodStatus | undefined>
}): string[] {
  if (!input.globalAutomaticExecutionEnabled) return []
  const currentPeriod = getChatflowsCheckInPeriodBounds(input.now).periodKey
  const accountsById = new Map(
    input.accounts.map((account) => [account.id, account]),
  )
  const accountIds: string[] = []

  for (const target of input.targets) {
    if (
      !isChatflowsResetTarget(target) ||
      target.nextResetAt > input.now ||
      getChatflowsCheckInPeriodBounds(target.nextResetAt + 1).periodKey !==
        currentPeriod
    ) {
      continue
    }
    const account = accountsById.get(target.accountId)
    if (
      !account ||
      account.disabled === true ||
      account.checkIn.automaticExecutionEnabled !== true ||
      resolveSelectedCheckInMethod({
        config: account.checkIn,
        siteType: account.site_type,
        siteUrl: account.site_url,
      }) !== target.methodId
    ) {
      continue
    }

    const status = input.statuses.get(account.id)
    if (
      status?.outcome !== CHECK_IN_METHOD_STATUS_OUTCOMES.Known ||
      status.availability !== CHECK_IN_METHOD_AVAILABILITIES.Enabled ||
      status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked ||
      !("observedAt" in status.evidence) ||
      getChatflowsCheckInPeriodBounds(status.evidence.observedAt).periodKey !==
        currentPeriod
    ) {
      continue
    }
    accountIds.push(account.id)
  }
  return [...new Set(accountIds)]
}

/** One finite read-only retry for an inconclusive GET within the new period. */
export function selectChatflowsResetStatusRetryTargets(input: {
  targets: readonly ChatflowsResetTarget[]
  now: number
  globalAutomaticExecutionEnabled: boolean
  accounts: readonly SiteAccount[]
  statuses: ReadonlyMap<string, CheckInMethodStatus | undefined>
}): ChatflowsResetTarget[] {
  if (!input.globalAutomaticExecutionEnabled) return []
  const currentBounds = getChatflowsCheckInPeriodBounds(input.now)
  const accountsById = new Map(
    input.accounts.map((account) => [account.id, account]),
  )
  const retryAt = input.now + 30_000
  if (retryAt >= currentBounds.nextResetAt) return []
  const retries: ChatflowsResetTarget[] = []

  for (const target of input.targets) {
    if (
      !isChatflowsResetTarget(target) ||
      target.statusReadAttempts !== undefined ||
      getChatflowsCheckInPeriodBounds(target.nextResetAt + 1).periodKey !==
        currentBounds.periodKey
    ) {
      continue
    }
    const account = accountsById.get(target.accountId)
    if (
      !account ||
      account.disabled === true ||
      account.checkIn.automaticExecutionEnabled !== true ||
      resolveSelectedCheckInMethod({
        config: account.checkIn,
        siteType: account.site_type,
        siteUrl: account.site_url,
      }) !== target.methodId
    ) {
      continue
    }

    const status = input.statuses.get(account.id)
    const inconclusive =
      status === undefined ||
      status.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Unknown ||
      (status.outcome === CHECK_IN_METHOD_STATUS_OUTCOMES.Known &&
        status.availability !== CHECK_IN_METHOD_AVAILABILITIES.Disabled &&
        status.today !== CHECK_IN_METHOD_TODAY_STATUSES.Checked &&
        status.today !== CHECK_IN_METHOD_TODAY_STATUSES.NotChecked)
    if (inconclusive) {
      retries.push({ ...target, statusReadAttempts: 1, nextAttemptAt: retryAt })
    }
  }
  return retries
}

export const parseChatflowsResetTargets = (
  value: unknown,
): ChatflowsResetTarget[] => {
  if (typeof value !== "object" || value === null) return []
  const stored = value as Partial<StoredChatflowsResetQueue>
  if (stored.version !== 1 || !Array.isArray(stored.targets)) return []
  const byAccount = new Map<string, ChatflowsResetTarget>()
  for (const target of stored.targets) {
    if (isChatflowsResetTarget(target)) byAccount.set(target.accountId, target)
  }
  return [...byAccount.values()]
}

/** Loads and validates persisted Chatflows reset targets. */
export async function readChatflowsResetTargets(): Promise<
  ChatflowsResetTarget[]
> {
  const values = await getLocalStorageValues(CHATFLOWS_RESET_QUEUE_STORAGE_KEY)
  return parseChatflowsResetTargets(values[CHATFLOWS_RESET_QUEUE_STORAGE_KEY])
}

/** Persists targets, removing the queue key when no targets remain. */
async function writeTargets(targets: readonly ChatflowsResetTarget[]) {
  if (targets.length === 0) {
    await removeLocalStorage(CHATFLOWS_RESET_QUEUE_STORAGE_KEY)
    return
  }
  await setLocalStorage({
    [CHATFLOWS_RESET_QUEUE_STORAGE_KEY]: { version: 1, targets },
  })
}

/** Aligns the Chatflows alarm with the earliest queued wake time. */
async function syncAlarm(targets: readonly ChatflowsResetTarget[]) {
  if (targets.length === 0) {
    await clearAlarm(CHATFLOWS_RESET_ALARM_NAME)
    return
  }
  const when = Math.min(...targets.map(getChatflowsResetTargetWakeAt))
  const existing = await getAlarm(CHATFLOWS_RESET_ALARM_NAME)
  if (existing?.scheduledTime === when) return
  await clearAlarm(CHATFLOWS_RESET_ALARM_NAME)
  await createAlarm(CHATFLOWS_RESET_ALARM_NAME, { when })
}

/** Rebuilds checked Chatflows targets after the normal daily pass. */
export async function scheduleChatflowsResetForCheckedAccounts(
  now = Date.now(),
): Promise<void> {
  const prefs = await userPreferences.getPreferences()
  const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
  if (config.globalEnabled !== true) {
    await withQueueMutationLock(async () => {
      const latestPrefs = await userPreferences.getPreferences()
      const latestConfig =
        latestPrefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
      if (latestConfig.globalEnabled !== true) {
        await writeTargets([])
        await syncAlarm([])
      }
    })
    return
  }

  const accounts = await accountQueries.getAllAccounts()
  const registration = autoCheckinMethodRegistry.resolveById(
    AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn,
  )
  if (!registration?.provider.getStatus) return

  const targets: ChatflowsResetTarget[] = []
  for (const account of accounts) {
    if (
      account.disabled === true ||
      account.checkIn.automaticExecutionEnabled !== true ||
      resolveSelectedCheckInMethod({
        config: account.checkIn,
        siteType: account.site_type,
        siteUrl: account.site_url,
      }) !== AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn
    ) {
      continue
    }
    const observedAt = Date.now()
    const status = await registration.provider.getStatus({
      account,
      observedAt,
    })
    const target = createChatflowsResetTarget({
      accountId: account.id,
      methodId: AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn,
      automaticExecutionEnabled: account.checkIn.automaticExecutionEnabled,
      accountDisabled: false,
      globalAutomaticExecutionEnabled: config.globalEnabled === true,
      status,
    })
    if (target) targets.push(target)
  }

  const nowTargets = targets.filter((target) => target.nextResetAt > now)
  await withQueueMutationLock(async () => {
    const latestPrefs = await userPreferences.getPreferences()
    const latestConfig =
      latestPrefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    if (latestConfig.globalEnabled !== true) {
      await writeTargets([])
      await syncAlarm([])
      return
    }
    const previous = (await readChatflowsResetTargets()).filter(
      (target) => target.nextResetAt > now,
    )
    const nextTargets = mergeChatflowsResetTargets(previous, nowTargets)
    await writeTargets(nextTargets)
    await syncAlarm(nextTargets)
  })
}

/** Restores the dedicated alarm from its validated persisted target list. */
export async function restoreChatflowsResetAlarm(): Promise<void> {
  await withQueueMutationLock(async () => {
    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    const targets =
      config.globalEnabled === true
        ? (await readChatflowsResetTargets()).filter(
            (target) => getChatflowsResetTargetWakeAt(target) > Date.now(),
          )
        : []
    await writeTargets(targets)
    await syncAlarm(targets)
  })
}

/** Cancels this method-specific wake-up without touching other scheduler state. */
export async function cancelChatflowsResetAlarm(): Promise<void> {
  await withQueueMutationLock(async () => {
    await writeTargets([])
    await syncAlarm([])
  })
}

/** Consumes due entries before any status or mutation request to prevent replay. */
export async function takeDueChatflowsResetTargets(
  now = Date.now(),
): Promise<ChatflowsResetTarget[]> {
  return withQueueMutationLock(async () => {
    const targets = await readChatflowsResetTargets()
    const { due, future } = partitionChatflowsResetTargets(targets, now)
    await writeTargets(future)
    await syncAlarm(future)
    return due
  })
}

/** Adds bounded status-read retries without replacing later account resets. */
export async function requeueChatflowsResetTargets(
  additions: readonly ChatflowsResetTarget[],
): Promise<void> {
  await withQueueMutationLock(async () => {
    const prefs = await userPreferences.getPreferences()
    const config = prefs.autoCheckin ?? DEFAULT_PREFERENCES.autoCheckin!
    if (config.globalEnabled !== true) {
      await writeTargets([])
      await syncAlarm([])
      return
    }
    const existing = await readChatflowsResetTargets()
    const targets = mergeChatflowsResetTargets(existing, additions)
    await writeTargets(targets)
    await syncAlarm(targets)
  })
}

/**
 * A delayed status-read retry must not replace a later reset already queued
 * for the same account by a post-noon daily scan. For equal resets, retain
 * the earlier wake-up so a bounded status retry is not postponed.
 */
export function mergeChatflowsResetTargets(
  existing: readonly ChatflowsResetTarget[],
  additions: readonly ChatflowsResetTarget[],
): ChatflowsResetTarget[] {
  const byAccount = new Map(
    existing
      .filter(isChatflowsResetTarget)
      .map((target) => [target.accountId, target]),
  )
  for (const target of additions) {
    if (!isChatflowsResetTarget(target)) continue
    const current = byAccount.get(target.accountId)
    if (
      !current ||
      target.nextResetAt > current.nextResetAt ||
      (target.nextResetAt === current.nextResetAt &&
        getChatflowsResetTargetWakeAt(target) <
          getChatflowsResetTargetWakeAt(current))
    ) {
      byAccount.set(target.accountId, target)
    }
  }
  return [...byAccount.values()]
}

/** Splits alarm targets into due entries and entries that remain queued. */
export function partitionChatflowsResetTargets(
  targets: readonly ChatflowsResetTarget[],
  now: number,
) {
  return {
    due: targets.filter(
      (target) => getChatflowsResetTargetWakeAt(target) <= now,
    ),
    future: targets.filter(
      (target) => getChatflowsResetTargetWakeAt(target) > now,
    ),
  }
}

/** Returns an authoritative Chatflows status read for a saved account. */
export async function readChatflowsResetAccountStatus(
  account: SiteAccount,
  observedAt = Date.now(),
  authenticationRecovery?: AutoCheckinProviderReadContext["authenticationRecovery"],
): Promise<CheckInMethodStatus | undefined> {
  const registration = autoCheckinMethodRegistry.resolveById(
    AUTO_CHECKIN_METHOD_IDS.ChatflowsDailyCheckIn,
  )
  if (!registration?.provider.getStatus) return undefined
  return registration.provider.getStatus({
    account,
    observedAt,
    ...(authenticationRecovery ? { authenticationRecovery } : {}),
  })
}

/** Logs a scheduler failure without exposing its request or credential data. */
export function logChatflowsResetFailure(error: unknown) {
  logger.warn("Chatflows period reset alarm processing failed", {
    errorType: error instanceof Error ? error.name : "Error",
  })
}
