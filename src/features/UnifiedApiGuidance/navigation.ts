import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "~/features/KeyManagement/constants"

import {
  UNIFIED_API_GUIDANCE_ACTION_KINDS,
  type UnifiedApiGuidanceAction,
  type UnifiedApiGuidanceNavigationTarget,
} from "./model"

/**
 * Builds the Key Management target that starts account-key gateway import guidance.
 */
export function buildGuidedAccountKeyImportTarget(
  accountId: string | undefined,
): UnifiedApiGuidanceNavigationTarget {
  return {
    menuItemId: MENU_ITEM_IDS.KEYS,
    params: accountId
      ? {
          accountId,
          [KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport]:
            KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite,
        }
      : undefined,
  }
}

/**
 * Adds Key Management deep-link context for account-key gateway import actions.
 */
export function withGuidedAccountKeyImportTarget(
  action: UnifiedApiGuidanceAction,
  accountId: string | undefined,
): UnifiedApiGuidanceAction {
  if (
    action.kind !== UNIFIED_API_GUIDANCE_ACTION_KINDS.AddGatewayChannel ||
    !accountId
  ) {
    return action
  }

  return {
    ...action,
    target: buildGuidedAccountKeyImportTarget(accountId),
  }
}
