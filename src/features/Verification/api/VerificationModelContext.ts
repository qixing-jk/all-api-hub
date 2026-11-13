import { createContext, useContext } from "react"

import type { ModelOption } from "~/components/ai-elements/model-selector"

export type VerificationModelOption = ModelOption

export type VerificationModelContextValue = {
  modelId: string
  onModelChange: (modelId: string) => void
  options?: Array<string | VerificationModelOption>
  disabled?: boolean
  loading?: boolean
  portalContainer?: HTMLElement
}

export const VerificationModelContext =
  createContext<VerificationModelContextValue | null>(null)

/**
 * Accesses the current model selection context for verification tools and composers.
 */
export function useVerificationModel() {
  return useContext(VerificationModelContext)
}
