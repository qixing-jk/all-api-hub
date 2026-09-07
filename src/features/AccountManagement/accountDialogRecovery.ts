import { OPTIONS_PAGE_PATH } from "~/constants/extensionPages"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import {
  createEmptyAccountDialogDraft,
  type AccountDialogDraft,
  type AccountDialogRecoveryState,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { ACCOUNT_MANAGEMENT_ROUTE_PARAMS } from "~/features/AccountManagement/routeParams"
import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configCodec"
import {
  ACCOUNT_DIALOG_RECOVERY_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { AuthTypeEnum } from "~/types"
import {
  createTab,
  getActiveTab,
  getExtensionURL,
  getSessionStorageValues,
  getSidePanelSupport,
  onStorageChanged,
  openSidePanel,
  removeSessionStorageValues,
  setSessionStorageValues,
} from "~/utils/browser/browserApi"
import { isRecord } from "~/utils/core/object"
import { isHttpUrl } from "~/utils/core/urlParsing"

const RECOVERY_TTL_MS = 15 * 60 * 1000
const RECOVERY_VERSION = 1
const VALID_RECOVERY_ID = /^[\da-f-]{36}$/i

export interface PreparedAccountDialogRecovery {
  id: string
  tab: browser.tabs.Tab
  windowId: number
}

interface RecoveryEnvelope {
  version: typeof RECOVERY_VERSION
  createdAt: number
  windowId: number
  state: AccountDialogRecoveryState
}

const draftKey = (id: string) =>
  `${ACCOUNT_DIALOG_RECOVERY_STORAGE_KEYS.DRAFT_PREFIX}${id}`
const pendingKey = (windowId: number) =>
  `${ACCOUNT_DIALOG_RECOVERY_STORAGE_KEYS.PENDING_PREFIX}${windowId}`

/** Validates the session envelope and drops fields outside the form contract. */
function readEnvelope(value: unknown): RecoveryEnvelope | null {
  if (
    !isRecord(value) ||
    value.version !== RECOVERY_VERSION ||
    typeof value.createdAt !== "number" ||
    !Number.isFinite(value.createdAt) ||
    value.createdAt > Date.now() ||
    Date.now() - value.createdAt > RECOVERY_TTL_MS ||
    typeof value.windowId !== "number" ||
    !isRecord(value.state)
  )
    return null

  const { state } = value
  if (
    typeof state.url !== "string" ||
    !isHttpUrl(state.url) ||
    !isRecord(state.draft) ||
    state.draft.siteType !== SITE_TYPES.NEW_API ||
    state.draft.authType !== AuthTypeEnum.AccessToken ||
    typeof state.checkInSelectionChanged !== "boolean" ||
    (state.accountId !== undefined &&
      (typeof state.accountId !== "string" || !state.accountId.trim())) ||
    (state.checkInDiscoveryBaseSelection !== null &&
      !isRecord(state.checkInDiscoveryBaseSelection))
  )
    return null

  const defaults = createEmptyAccountDialogDraft(SITE_TYPES.NEW_API)
  const rawDraft = state.draft
  for (const [key, defaultValue] of Object.entries(defaults)) {
    const field = rawDraft[key]
    if (key === "checkIn") {
      if (!isRecord(field)) return null
    } else if (key === "tagIds") {
      if (!Array.isArray(field) || !field.every((id) => typeof id === "string"))
        return null
    } else if (defaultValue === null) {
      if (
        field !== null &&
        (typeof field !== "number" || !Number.isFinite(field))
      )
        return null
    } else if (typeof field !== typeof defaultValue) {
      return null
    }
  }
  const draft = Object.fromEntries(
    Object.keys(defaults).map((key) => [key, rawDraft[key]]),
  ) as unknown as AccountDialogDraft
  draft.checkIn = normalizeCheckInConfigV7(rawDraft.checkIn)

  return {
    version: RECOVERY_VERSION,
    createdAt: value.createdAt,
    windowId: value.windowId,
    state: {
      url: state.url,
      draft,
      ...(typeof state.accountId === "string"
        ? { accountId: state.accountId }
        : {}),
      checkInSelectionChanged: state.checkInSelectionChanged,
      checkInDiscoveryBaseSelection:
        state.checkInDiscoveryBaseSelection === null
          ? null
          : normalizeCheckInConfigV7({
              ...draft.checkIn,
              selection: state.checkInDiscoveryBaseSelection,
            }).selection,
    },
  }
}

/** Stages the latest form before enabling the gesture-sensitive sidebar action. */
export async function prepareAccountDialogRecovery(
  state: AccountDialogRecoveryState,
  previous?: PreparedAccountDialogRecovery | null,
): Promise<PreparedAccountDialogRecovery> {
  const tab = previous?.tab ?? (await getActiveTab())
  if (typeof tab?.windowId !== "number")
    throw new Error("Recovery window unavailable")
  const prepared = {
    id: previous?.id ?? crypto.randomUUID(),
    tab,
    windowId: tab.windowId,
  }
  const envelope: RecoveryEnvelope = {
    version: RECOVERY_VERSION,
    createdAt: Date.now(),
    windowId: tab.windowId,
    state,
  }
  const normalized = readEnvelope(envelope)
  if (!normalized) throw new Error("Invalid account recovery draft")
  // storage.session is memory-only, not synchronized or exposed to content scripts.
  // https://developer.chrome.com/docs/extensions/reference/api/storage#storage-areas
  if (
    !(await setSessionStorageValues({ [draftKey(prepared.id)]: normalized }))
  ) {
    throw new Error("Account recovery session storage unavailable")
  }
  return prepared
}

/** Sidebar broadcasts require a lock shared by every extension view. */
export function canUseAccountDialogRecoverySidePanel(): boolean {
  return (
    getSidePanelSupport().supported &&
    typeof globalThis.navigator?.locks?.request === "function"
  )
}

/** Opens the native sidebar in the click turn, with a draft-preserving tab fallback. */
export async function openAccountDialogRecovery(
  prepared: PreparedAccountDialogRecovery,
): Promise<"sidepanel" | "tab"> {
  const windowId = prepared.windowId
  const key = pendingKey(windowId)
  if (canUseAccountDialogRecoverySidePanel()) {
    const signal = withExtensionStorageWriteLock(
      STORAGE_LOCKS.ACCOUNT_DIALOG_RECOVERY,
      async () => {
        const pendingId = await getPendingAccountDialogRecovery(windowId)
        // Preserve an unclaimed form; the new form can continue in its own tab.
        if (pendingId && pendingId !== prepared.id) return false
        if (!(await setSessionStorageValues({ [key]: prepared.id }))) {
          throw new Error("Account recovery handoff unavailable")
        }
        return true
      },
    )
    // Do not await storage before this call: Chromium requires user activation.
    const opened = openSidePanel(prepared.tab).then(
      () => true,
      () => false,
    )
    if (await signal) {
      if (await opened) return "sidepanel"
      const draftAvailable = await withExtensionStorageWriteLock(
        STORAGE_LOCKS.ACCOUNT_DIALOG_RECOVERY,
        async () => {
          await clearPendingRecovery(prepared.id, windowId)
          const values = await getSessionStorageValues(draftKey(prepared.id))
          return Boolean(values[draftKey(prepared.id)])
        },
      )
      if (!draftAvailable) return "sidepanel"
    }
  }

  const destination = new URL(getExtensionURL(OPTIONS_PAGE_PATH))
  destination.searchParams.set(
    ACCOUNT_MANAGEMENT_ROUTE_PARAMS.AccountDialogRecovery,
    prepared.id,
  )
  destination.hash = MENU_ITEM_IDS.ACCOUNT
  const tab = await createTab(destination.toString(), true)
  if (typeof tab?.id !== "number")
    throw new Error("Account recovery tab unavailable")
  return "tab"
}

/** Reads the recovery request for this browser window only. */
export async function getPendingAccountDialogRecovery(
  windowId: number,
): Promise<string | null> {
  const key = pendingKey(windowId)
  const values = await getSessionStorageValues(key)
  const id = values[key]
  return typeof id === "string" && VALID_RECOVERY_ID.test(id) ? id : null
}

/** Watches new handoffs without polling or reacting to another window's draft. */
export function watchPendingAccountDialogRecovery(
  windowId: number,
  onPending: () => void,
): () => void {
  return onStorageChanged((changes, area) => {
    if (area === "session" && changes[pendingKey(windowId)]?.newValue)
      onPending()
  })
}

/** Clears only this request while the caller holds the shared recovery lock. */
async function clearPendingRecovery(
  id: string,
  windowId: number,
): Promise<void> {
  const key = pendingKey(windowId)
  const values = await getSessionStorageValues(key)
  if (values[key] === id) await removeSessionStorageValues(key)
}

/** Restores a draft once; busy destination views leave it available for later. */
export async function receiveAccountDialogRecovery(
  id: string,
  accept: (state: AccountDialogRecoveryState) => boolean,
  expectedWindowId?: number,
): Promise<boolean> {
  if (!VALID_RECOVERY_ID.test(id)) return false
  return withExtensionStorageWriteLock(
    STORAGE_LOCKS.ACCOUNT_DIALOG_RECOVERY,
    async () => {
      const key = draftKey(id)
      const values = await getSessionStorageValues(key)
      const envelope = readEnvelope(values[key])
      if (!envelope) {
        await removeSessionStorageValues(key)
        if (expectedWindowId !== undefined)
          await clearPendingRecovery(id, expectedWindowId)
        return false
      }
      if (
        expectedWindowId !== undefined &&
        (envelope.windowId !== expectedWindowId ||
          (await getPendingAccountDialogRecovery(expectedWindowId)) !== id)
      )
        return false
      if (!accept(envelope.state)) return false
      await removeSessionStorageValues(key)
      await clearPendingRecovery(id, envelope.windowId)
      return true
    },
  )
}

/** Discards a prepared form when its source dialog closes without handing it off. */
export async function discardAccountDialogRecovery(id: string): Promise<void> {
  if (VALID_RECOVERY_ID.test(id)) await removeSessionStorageValues(draftKey(id))
}
