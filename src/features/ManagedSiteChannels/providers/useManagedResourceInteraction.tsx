import { useCallback, type ReactNode } from "react"

import type { ManagedSiteType } from "~/constants/siteType"
import { useNewApiNativeSecretVerification } from "~/features/ManagedSiteChannels/hooks/useNewApiNativeSecretVerification"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS } from "~/services/apiAdapters/contracts/managedResourceMatching"
import { resolveNewApiMigrationCredential } from "~/services/apiAdapters/managedResources/newApiMigration"
import { getManagedSiteCapabilities } from "~/services/apiAdapters/registry"
import { executeManagedSiteMigration } from "~/services/managedSites/channelMigration"
import type { NewApiConfig } from "~/types/newApiConfig"

type Options = {
  siteType: ManagedSiteType
  newApiConfig?: NewApiConfig
}

/** Isolates provider-specific interactive reads from the shared native route. */
export function useManagedResourceInteraction({
  siteType,
  newApiConfig,
}: Options) {
  const usesNewApiVerification =
    getManagedSiteCapabilities(siteType).matching.secretVerification?.kind ===
    MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS.NEW_API_SESSION
  const { verification, runVerifiedRead, closeVerification } =
    useNewApiNativeSecretVerification({
      enabled: usesNewApiVerification,
      config: newApiConfig,
    })
  const executeMigration = useCallback(
    async (params: Parameters<typeof executeManagedSiteMigration>[0]) =>
      await executeManagedSiteMigration({
        ...params,
        ...(usesNewApiVerification
          ? {
              resolveSourceCredential: (selection, options) =>
                runVerifiedRead(
                  () => resolveNewApiMigrationCredential(selection, options),
                  selection.displayName,
                  options?.signal,
                ),
            }
          : {}),
      }),
    [runVerifiedRead, usesNewApiVerification],
  )
  const verificationDialog: ReactNode = usesNewApiVerification ? (
    <NewApiManagedVerificationDialog
      isOpen={verification.dialogState.isOpen}
      step={verification.dialogState.step}
      request={verification.dialogState.request}
      code={verification.dialogState.code}
      errorMessage={verification.dialogState.errorMessage}
      isBusy={verification.dialogState.isBusy}
      busyMessage={verification.dialogState.busyMessage}
      onCodeChange={verification.setCode}
      onClose={closeVerification}
      onSubmit={verification.submitCode}
      onRetry={verification.retryVerification}
      onOpenSite={verification.openBaseUrl}
      onUpdateRequestConfig={verification.patchRequestConfig}
    />
  ) : null

  return { runRead: runVerifiedRead, executeMigration, verificationDialog }
}
