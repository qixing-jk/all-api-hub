import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import { type ApiCheckOpenModalDetail } from "~/features/WebAiApiCheck/content/events"
import {
  type ApiVerificationApiType,
  type ApiVerificationMode,
  type ApiVerificationProbeId,
  type ApiVerificationRequestProfile,
  type ModelTestModality,
} from "~/services/verification/aiApiVerification"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"
import type { WebAiApiCheckBaseUrlSuggestion } from "~/services/verification/webAiApiCheck/baseUrlHistory"
import type { Tag } from "~/types"

export type ApiCheckValidationError = "missing-credentials" | "missing-model"

export interface ProbeItemState {
  id: ApiVerificationProbeId
  requiresModelId: boolean
  isRunning: boolean
  attempts: number
  result: ApiVerificationProbeResult | null
}
export interface ApiCheckModalViewModel {
  pageUrl: string
  isOpen: boolean
  sourceText: string
  baseUrl: string
  baseUrlHistorySuggestions: WebAiApiCheckBaseUrlSuggestion[]
  isBaseUrlHistoryPickerOpen: boolean
  apiKey: string
  extractionMetadata: ApiCheckOpenModalDetail["extraction"]
  apiKeyVisible: boolean
  apiType: ApiVerificationApiType
  verificationMode: ApiVerificationMode
  requestProfileEnhanced: boolean
  requestProfile: ApiVerificationRequestProfile
  modelId: string
  modelModality: ModelTestModality
  modelIdsOptions: Array<{ value: string; label: string }>
  tags: Tag[]
  selectedTagIds: string[]
  notes: string
  expiresAtInput: string
  sourceUrl: string
  datePickerLanguage: string
  isProfileOptionsOpen: boolean
  hasProfileMetadataInput: boolean
  isFetchingModels: boolean
  fetchModelsError: string | null
  popoverPortalContainer: HTMLElement | null
  probes: ProbeItemState[]
  isRunningAll: boolean
  isStoppingRunAll: boolean
  testStoppedMessage: string | null
  isSavingProfile: boolean
  validationError: string | null
  hasAnyResult: boolean
  isAnyProbeRunning: boolean
  /** Shared drawing test + editable probe prompts. */
  verificationTools: VerificationToolsController
  modelListSupported: boolean
  canClose: boolean
  canFetchModels: boolean
  isRunAllActionDisabled: boolean
  canSaveProfile: boolean
  apiTypeOptions: Array<{ value: ApiVerificationApiType; label: string }>
}

export interface ApiCheckModalActions {
  close: () => void
  setSourceText: (value: string) => void
  updateBaseUrl: (value: string) => void
  setIsBaseUrlHistoryPickerOpen: (isOpen: boolean) => void
  selectBaseUrlHistory: (baseUrl: string) => void
  removeBaseUrlHistory: (baseUrl: string) => void
  setApiKey: (value: string) => void
  setApiKeyVisible: (isVisible: boolean) => void
  setApiType: (apiType: ApiVerificationApiType) => void
  setVerificationMode: (mode: ApiVerificationMode) => void
  setRequestProfileEnhanced: (value: boolean) => void
  setRequestProfile: (profile: ApiVerificationRequestProfile) => void
  setModelId: (modelId: string) => void
  setSelectedTagIds: (tagIds: string[]) => void
  setNotes: (notes: string) => void
  setExpiresAtInput: (value: string) => void
  setSourceUrl: (value: string) => void
  setIsProfileOptionsOpen: (isOpen: boolean) => void
  createTag: (name: string) => Promise<Tag>
  renameTag: (tagId: string, name: string) => Promise<Tag>
  fetchModels: () => void
  runProbe: (probeId: ApiVerificationProbeId) => void
  stopProbe: (probeId: ApiVerificationProbeId) => void
  runAll: () => void
  stopRunAll: () => void
  saveProfile: () => void
}
