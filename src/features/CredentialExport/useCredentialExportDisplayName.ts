import { useMemo } from "react"

import {
  buildCredentialExportDisplayName,
  type CredentialExportSource,
} from "~/services/integrations/credentialExport"

/**
 * Provider name an export dialog prefills for the selected credential.
 *
 * The two labels are the only inputs, so a dialog can list the resulting name as
 * one reset dependency instead of rebuilding the label pair at every call site.
 */
export function useCredentialExportDisplayName(
  source: Pick<CredentialExportSource, "providerName" | "credentialName">,
): string {
  const { providerName, credentialName } = source
  return useMemo(
    () => buildCredentialExportDisplayName({ providerName, credentialName }),
    [providerName, credentialName],
  )
}
