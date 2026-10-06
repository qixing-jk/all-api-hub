import { useMemo } from "react"

import { ClaudeCodeRouterImportDialog } from "~/components/ClaudeCodeRouterImportDialog"
import { CursorPlusExportDialog } from "~/components/CursorPlusExportDialog"
import {
  createProfileDeeplinkExportRequest,
  DeeplinkExportDialog,
} from "~/components/DeeplinkExportDialog"
import { KelivoExportDialog } from "~/components/KelivoExportDialog"
import { createProfileCredentialExportSource } from "~/services/apiCredentialProfiles/credentialExport"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

import type { useApiCredentialProfileExportSession } from "../hooks/useApiCredentialProfileExportSession"
import { KiloCodeProfileExportDialog } from "./KiloCodeProfileExportDialog"

const apiCredentialProfileThirdPartyExportContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
  surfaceId:
    PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesRowActions,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
} as const

/** Presents the targets selected by the credential export session. */
export function ApiCredentialProfileExportDialogs({
  controller,
}: {
  controller: ReturnType<typeof useApiCredentialProfileExportSession>
}) {
  const deeplinkExportRequest = useMemo(() => {
    const selection = controller.deeplinkExportProfile
    if (!selection) return null
    return createProfileDeeplinkExportRequest({
      target: selection.target,
      source: createProfileCredentialExportSource(selection.profile),
      baseContext: apiCredentialProfileThirdPartyExportContext,
    })
  }, [controller.deeplinkExportProfile])
  const cursorPlusSource = useMemo(
    () =>
      controller.cursorPlusProfile
        ? createProfileCredentialExportSource(controller.cursorPlusProfile)
        : null,
    [controller.cursorPlusProfile],
  )
  const claudeCodeRouterSource = useMemo(
    () =>
      controller.claudeCodeRouterProfile
        ? createProfileCredentialExportSource(
            controller.claudeCodeRouterProfile,
          )
        : null,
    [controller.claudeCodeRouterProfile],
  )

  return (
    <>
      {deeplinkExportRequest ? (
        <DeeplinkExportDialog
          request={deeplinkExportRequest}
          onClose={() => controller.setDeeplinkExportProfile(null)}
        />
      ) : null}

      {cursorPlusSource ? (
        <CursorPlusExportDialog
          isOpen={true}
          onClose={() => controller.setCursorPlusProfile(null)}
          source={cursorPlusSource}
          analyticsContext={{
            ...apiCredentialProfileThirdPartyExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileCursorPlusProviderConfig,
          }}
        />
      ) : null}

      {controller.kiloCodeProfile ? (
        <KiloCodeProfileExportDialog
          isOpen={true}
          onClose={() => controller.setKiloCodeProfile(null)}
          profile={controller.kiloCodeProfile}
        />
      ) : null}

      {controller.kelivoProfile ? (
        <KelivoExportDialog
          isOpen={true}
          onClose={() => controller.setKelivoProfile(null)}
          initialValue={controller.kelivoProfile}
          analyticsContext={{
            ...apiCredentialProfileThirdPartyExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.CopyApiCredentialProfileKelivoImportCode,
          }}
        />
      ) : null}

      {claudeCodeRouterSource ? (
        <ClaudeCodeRouterImportDialog
          isOpen={true}
          onClose={() => controller.setClaudeCodeRouterProfile(null)}
          source={claudeCodeRouterSource}
          routerBaseUrl={controller.claudeCodeRouterBaseUrl}
          routerApiKey={controller.claudeCodeRouterApiKey}
          analyticsContext={{
            ...apiCredentialProfileThirdPartyExportContext,
            actionId:
              PRODUCT_ANALYTICS_ACTION_IDS.ImportApiCredentialProfileToClaudeCodeRouter,
          }}
        />
      ) : null}
    </>
  )
}
