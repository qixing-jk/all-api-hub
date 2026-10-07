import { type ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import type { Tag } from "~/types"
import type {
  ApiCredentialProfile,
  ApiCredentialTelemetryConfig,
} from "~/types/apiCredentialProfiles"

export type SaveProfileInput = {
  id?: string
  name: string
  apiType: ApiVerificationApiType
  baseUrl: string
  apiKey: string
  requestHeaders?: Record<string, string>
  tagIds: string[]
  notes: string
  sourceUrl: string
  expiresAt?: number | null
  telemetryConfig?: ApiCredentialTelemetryConfig
}

export interface ApiCredentialProfileDialogProps {
  isOpen: boolean
  onClose: () => void
  profile?: ApiCredentialProfile | null
  addPrefill?: {
    name?: string
    baseUrl?: string
    apiKeyCreateUrl?: string
    apiKeyCreateHint?: string
  } | null
  tags: Tag[]
  createTag: (name: string) => Promise<Tag>
  renameTag: (tagId: string, name: string) => Promise<Tag>
  deleteTag: (tagId: string) => Promise<{ updatedAccounts: number }>
  onSave: (input: SaveProfileInput) => Promise<void>
}
