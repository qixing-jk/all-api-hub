import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import type { AccountToken, DisplaySiteData } from "~/types"

export const KEY_MANAGEMENT_ENTRY_KINDS = {
  AccountToken: "account_token",
  ServiceCredential: "service_credential",
} as const

export type ServiceCredentialState = {
  status: "idle" | "loading" | "loaded" | "error"
  credential?: AccountServiceCredential
  errorMessage?: string
  isRotating?: boolean
}

export type AccountTokenKeyManagementEntry = {
  kind: typeof KEY_MANAGEMENT_ENTRY_KINDS.AccountToken
  id: string
  account: DisplaySiteData
  token: AccountToken
}

export type ServiceCredentialKeyManagementEntry = {
  kind: typeof KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential
  id: string
  account: DisplaySiteData
  credential: AccountServiceCredential
  isRotating: boolean
}

export type KeyManagementEntry =
  | AccountTokenKeyManagementEntry
  | ServiceCredentialKeyManagementEntry

export type ApiCredentialProfileSaveEntry =
  | {
      kind: typeof KEY_MANAGEMENT_ENTRY_KINDS.AccountToken
      account: DisplaySiteData
      token: AccountToken
    }
  | {
      kind: typeof KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential
      account: DisplaySiteData
      credential: AccountServiceCredential
    }

export type CliProxyExportEntry = ApiCredentialProfileSaveEntry
