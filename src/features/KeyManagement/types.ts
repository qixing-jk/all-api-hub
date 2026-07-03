import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"

export type ServiceCredentialState = {
  status: "idle" | "loading" | "loaded" | "error"
  credential?: AccountServiceCredential
  errorMessage?: string
  isRotating?: boolean
}

export type KeyManagementEntry = {
  id: string
  runtimeKey: AccountRuntimeKey
  uiState: {
    isRotating?: boolean
  }
}

export type ApiCredentialProfileSaveEntry = KeyManagementEntry

export type CliProxyExportEntry = ApiCredentialProfileSaveEntry
