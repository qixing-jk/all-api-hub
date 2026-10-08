import { useMemo, useState } from "react"

import {
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementItemSource,
} from "~/features/ModelList/catalog/modelManagementSources"
import type { useModelListData } from "~/features/ModelList/hooks/useModelListData"
import type { CalculatedModelItem } from "~/features/ModelList/presentation/modelListItems"
import {
  createBatchVerifyModelItems,
  type BatchVerifyModelItem,
} from "~/features/ModelList/verification/batchVerification"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

type ModelListVerificationWorkflowInput = Pick<
  ReturnType<typeof useModelListData>,
  "selectedSource" | "sourceCapabilities"
> & {
  displayedModels: CalculatedModelItem[]
}

/** Owns verification dialog transitions and freezes each batch's open-time targets. */
export function useModelListVerificationWorkflow({
  displayedModels,
  selectedSource,
  sourceCapabilities,
}: ModelListVerificationWorkflowInput) {
  const [verifyContext, setVerifyContext] = useState<{
    account: DisplaySiteData
    modelId: string
    modelEnableGroups?: string[]
  } | null>(null)

  const [verifyCliContext, setVerifyCliContext] = useState<{
    source: ModelManagementItemSource
    modelId: string
  } | null>(null)

  const [verifyProfileContext, setVerifyProfileContext] = useState<{
    profile: ApiCredentialProfile
    modelId: string
  } | null>(null)

  const [modelKeyContext, setModelKeyContext] = useState<{
    account: DisplaySiteData
    modelId: string
    modelEnableGroups?: string[]
    returnToVerify?: boolean
  } | null>(null)

  const [batchVerifyContext, setBatchVerifyContext] = useState<{
    items: BatchVerifyModelItem[]
  } | null>(null)

  const handleVerifyModel = (
    source: ModelManagementItemSource,
    modelId: string,
    modelEnableGroups?: string[],
  ) => {
    if (source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE) {
      setVerifyProfileContext({
        profile: source.profile,
        modelId,
      })
      return
    }

    setVerifyContext({ account: source.account, modelId, modelEnableGroups })
  }

  const handleVerifyCliSupport = (
    source: ModelManagementItemSource,
    modelId: string,
  ) => {
    setVerifyCliContext({ source, modelId })
  }

  const handleOpenModelKeyDialog = (
    account: DisplaySiteData,
    modelId: string,
    modelEnableGroups?: string[],
  ) => setModelKeyContext({ account, modelId, modelEnableGroups })

  const handleManageVerifyModelKey = () => {
    if (!verifyContext) return
    setModelKeyContext({ ...verifyContext, returnToVerify: true })
    setVerifyContext(null)
  }

  const handleCloseModelKeyDialog = () => {
    if (modelKeyContext?.returnToVerify) {
      const { returnToVerify: _returnToVerify, ...nextVerifyContext } =
        modelKeyContext
      setVerifyContext(nextVerifyContext)
    }
    setModelKeyContext(null)
  }

  const batchVerifyItems = useMemo(
    () => createBatchVerifyModelItems(displayedModels),
    [displayedModels],
  )

  const handleOpenBatchVerify = () => {
    if (batchVerifyItems.length === 0) return
    setBatchVerifyContext({ items: batchVerifyItems })
  }

  const canBatchVerifyModels =
    !!selectedSource &&
    sourceCapabilities.supportsBatchCredentialVerification &&
    batchVerifyItems.length > 0

  const handleCloseModelVerification = () => setVerifyContext(null)
  const handleCloseCliVerification = () => setVerifyCliContext(null)
  const handleCloseProfileVerification = () => setVerifyProfileContext(null)
  const handleCloseBatchVerification = () => setBatchVerifyContext(null)
  return {
    verifyContext,
    verifyCliContext,
    verifyProfileContext,
    modelKeyContext,
    batchVerifyContext,
    handleVerifyModel,
    handleVerifyCliSupport,
    handleOpenModelKeyDialog,
    handleManageVerifyModelKey,
    handleCloseModelKeyDialog,
    handleOpenBatchVerify,
    canBatchVerifyModels,
    handleCloseModelVerification,
    handleCloseCliVerification,
    handleCloseProfileVerification,
    handleCloseBatchVerification,
  }
}
