import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import type { ProductAnalyticsActionContext } from "~/services/productAnalytics/actionConfig"
import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/contracts"

import { AiToolboxExportDialog } from "./AiToolboxExportDialog"
import { CCSwitchExportDialog } from "./CCSwitchExportDialog"
import {
  EXPORT_ACTION_TARGETS,
  type ExportMenuAction,
} from "./ExportActionsMenu"

/**
 * Export destinations that accept a provider over a desktop deeplink.
 *
 * Every surface that offers one of these targets routes through
 * {@link DeeplinkExportDialog} instead of carrying per-target dialog state, so
 * adding a destination changes this module rather than every credential list.
 */
export const DEEPLINK_EXPORT_TARGETS = {
  CCSwitch: EXPORT_ACTION_TARGETS.CCSwitch,
  AiToolbox: EXPORT_ACTION_TARGETS.AiToolbox,
} as const

export type DeeplinkExportTarget =
  (typeof DEEPLINK_EXPORT_TARGETS)[keyof typeof DEEPLINK_EXPORT_TARGETS]

export interface DeeplinkExportRequest {
  target: DeeplinkExportTarget
  source: CredentialExportSource
  /** Overrides the dialogs' default account-token analytics context. */
  analyticsContext?: ProductAnalyticsActionContext
}

/**
 * Profile-export analytics action per destination. Typing this as a full
 * Record makes an added destination fail to compile until it reports under
 * its own action instead of silently reusing another destination's.
 */
const PROFILE_EXPORT_ANALYTICS_ACTIONS: Record<
  DeeplinkExportTarget,
  ProductAnalyticsActionContext["actionId"]
> = {
  [DEEPLINK_EXPORT_TARGETS.CCSwitch]:
    PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToCCSwitch,
  [DEEPLINK_EXPORT_TARGETS.AiToolbox]:
    PRODUCT_ANALYTICS_ACTION_IDS.ExportApiCredentialProfileToAiToolbox,
}

/**
 * Build a profile-origin request whose analytics action id matches the chosen
 * destination, so every destination keeps reporting under its own action.
 */
export function createProfileDeeplinkExportRequest(params: {
  target: DeeplinkExportTarget
  source: CredentialExportSource
  baseContext: Omit<ProductAnalyticsActionContext, "actionId">
}): DeeplinkExportRequest {
  const { target, source, baseContext } = params
  return {
    target,
    source,
    analyticsContext: {
      ...baseContext,
      actionId: PROFILE_EXPORT_ANALYTICS_ACTIONS[target],
    },
  }
}

/**
 * Build export-menu entries for every deeplink destination. Credential
 * surfaces supply only their per-target test ids and a handler, so adding a
 * destination does not require editing each credential list.
 */
export function createDeeplinkExportMenuActions(params: {
  onSelect: (target: DeeplinkExportTarget) => void
  testIds?: Partial<Record<DeeplinkExportTarget, string>>
}): Partial<Record<DeeplinkExportTarget, ExportMenuAction>> {
  const { onSelect, testIds } = params
  return {
    [DEEPLINK_EXPORT_TARGETS.CCSwitch]: {
      testId: testIds?.[DEEPLINK_EXPORT_TARGETS.CCSwitch],
      onSelect: () => onSelect(DEEPLINK_EXPORT_TARGETS.CCSwitch),
    },
    [DEEPLINK_EXPORT_TARGETS.AiToolbox]: {
      testId: testIds?.[DEEPLINK_EXPORT_TARGETS.AiToolbox],
      onSelect: () => onSelect(DEEPLINK_EXPORT_TARGETS.AiToolbox),
    },
  }
}

interface DeeplinkExportDialogProps {
  request: DeeplinkExportRequest
  onClose: () => void
}

/** Renders the export dialog for a deeplink destination. */
export function DeeplinkExportDialog({
  request,
  onClose,
}: DeeplinkExportDialogProps) {
  switch (request.target) {
    case DEEPLINK_EXPORT_TARGETS.CCSwitch:
      return (
        <CCSwitchExportDialog
          isOpen={true}
          onClose={onClose}
          source={request.source}
          analyticsContext={request.analyticsContext}
        />
      )
    case DEEPLINK_EXPORT_TARGETS.AiToolbox:
      return (
        <AiToolboxExportDialog
          isOpen={true}
          onClose={onClose}
          source={request.source}
          analyticsContext={request.analyticsContext}
        />
      )
  }
}
