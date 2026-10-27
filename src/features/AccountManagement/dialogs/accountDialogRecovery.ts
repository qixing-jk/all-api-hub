import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { isAccountSiteType } from "~/constants/siteType"
import {
  createEmptyAccountDialogDraft,
  type AccountDialogDraft,
  type AccountDialogRecoveryState,
} from "~/features/AccountManagement/components/AccountDialog/models"
import { ACCOUNT_MANAGEMENT_ROUTE_PARAMS } from "~/features/AccountManagement/routeParams"
import { normalizeCheckInConfigV7 } from "~/services/checkin/autoCheckin/configuration/configCodec"
import {
  ACCOUNT_DIALOG_RECOVERY_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { createUiHandoffChannel } from "~/services/uiHandoff"
import { AuthTypeEnum } from "~/types"
import { getSidePanelSupport } from "~/utils/browser/sidePanel"
import { getActiveTab } from "~/utils/browser/tabs"
import { isRecord } from "~/utils/core/object"
import { isHttpUrl } from "~/utils/core/urlParsing"
import { SIDE_PANEL_NAVIGATION_DESTINATIONS } from "~/utils/navigation/destinations"
import { openOptionsMenuItemInNewTab } from "~/utils/navigation/optionsPage"
import { openSidePanelWithFallback } from "~/utils/navigation/sidepanel"

const RECOVERY_TTL_MS = 15 * 60 * 1000

export interface PreparedAccountDialogRecovery {
  id: string
  tab: browser.tabs.Tab
  windowId: number
}

const recoveryChannel = createUiHandoffChannel({
  draftPrefix: ACCOUNT_DIALOG_RECOVERY_STORAGE_KEYS.DRAFT_PREFIX,
  pendingPrefix: ACCOUNT_DIALOG_RECOVERY_STORAGE_KEYS.PENDING_PREFIX,
  lockName: STORAGE_LOCKS.ACCOUNT_DIALOG_RECOVERY,
  ttlMs: RECOVERY_TTL_MS,
  normalize: normalizeRecoveryState,
})

/** Validates only account-owned form facts; delivery metadata belongs to the shared channel. */
function normalizeRecoveryState(
  state: unknown,
): AccountDialogRecoveryState | null {
  if (
    !isRecord(state) ||
    typeof state.url !== "string" ||
    !isHttpUrl(state.url) ||
    !isRecord(state.draft) ||
    !isAccountSiteType(state.draft.siteType) ||
    state.draft.authType !== AuthTypeEnum.AccessToken ||
    typeof state.checkInSelectionChanged !== "boolean" ||
    (state.accountId !== undefined &&
      (typeof state.accountId !== "string" || !state.accountId.trim())) ||
    (state.checkInDiscoveryBaseSelection !== null &&
      !isRecord(state.checkInDiscoveryBaseSelection))
  )
    return null

  const defaults = createEmptyAccountDialogDraft(state.draft.siteType)
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
  if (typeof rawDraft.siteNameEdited === "boolean") {
    draft.siteNameEdited = rawDraft.siteNameEdited
  }
  if (
    rawDraft.novitaCredentialMode === "console" ||
    rawDraft.novitaCredentialMode === "api-key"
  ) {
    draft.novitaCredentialMode = rawDraft.novitaCredentialMode
  }
  draft.checkIn = normalizeCheckInConfigV7(rawDraft.checkIn)

  return {
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
  if (!normalizeRecoveryState(state))
    throw new Error("Invalid account recovery draft")
  await recoveryChannel.prepare(state, prepared.windowId, prepared.id)
  return prepared
}

/** Sidebar broadcasts require a lock shared by every extension view. */
export function canUseAccountDialogRecoverySidePanel(): boolean {
  return (
    getSidePanelSupport().supported &&
    typeof globalThis.navigator?.locks?.request === "function"
  )
}

export const ACCOUNT_DIALOG_RECOVERY_DESTINATIONS = {
  SidePanel: "sidepanel",
  Tab: "tab",
} as const

type AccountDialogRecoveryDestination =
  (typeof ACCOUNT_DIALOG_RECOVERY_DESTINATIONS)[keyof typeof ACCOUNT_DIALOG_RECOVERY_DESTINATIONS]

/** Opens the native sidebar in the click turn, with a draft-preserving tab fallback. */
export async function openAccountDialogRecovery(
  prepared: PreparedAccountDialogRecovery,
): Promise<AccountDialogRecoveryDestination> {
  const destination = await openSidePanelWithFallback(
    prepared.tab,
    async () => {
      try {
        await openOptionsMenuItemInNewTab(MENU_ITEM_IDS.ACCOUNT, {
          [ACCOUNT_MANAGEMENT_ROUTE_PARAMS.AccountDialogRecovery]: prepared.id,
        })
      } catch {
        throw new Error("Account recovery tab unavailable")
      }
    },
    {
      enabled: canUseAccountDialogRecoverySidePanel(),
      handoff: {
        publish: async () => {
          try {
            return await recoveryChannel.publish(prepared.id, prepared.windowId)
          } catch {
            throw new Error("Account recovery handoff unavailable")
          }
        },
        retract: () => recoveryChannel.retract(prepared.id, prepared.windowId),
      },
    },
  )
  return destination === SIDE_PANEL_NAVIGATION_DESTINATIONS.SidePanel
    ? ACCOUNT_DIALOG_RECOVERY_DESTINATIONS.SidePanel
    : ACCOUNT_DIALOG_RECOVERY_DESTINATIONS.Tab
}

export const getPendingAccountDialogRecovery = recoveryChannel.getPending
export const watchPendingAccountDialogRecovery = recoveryChannel.watchPending
export const receiveAccountDialogRecovery = recoveryChannel.receive
export const discardAccountDialogRecovery = recoveryChannel.discard
