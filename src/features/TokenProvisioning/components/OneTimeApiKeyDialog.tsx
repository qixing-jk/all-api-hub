import { useMemo } from "react"

import type { ApiToken } from "~/types"

import { OneTimeSecretDialog } from "./OneTimeSecretDialog"

interface OneTimeApiKeyDialogProps {
  isOpen: boolean
  token: ApiToken | null
  onClose: () => void
  autoCopy?: boolean
  saveAction?: { onSave: () => Promise<void>; label?: string }
}

/** Compatibility wrapper for legacy token-create callers. */
export function OneTimeApiKeyDialog({
  token,
  ...props
}: OneTimeApiKeyDialogProps) {
  const hasToken = token !== null
  const tokenKey = token?.key ?? ""
  const tokenName = token?.name ?? ""
  const result = useMemo(
    () =>
      hasToken
        ? {
            correlation: {
              kind: "legacy-create" as const,
              accountId: "legacy-one-time-key-dialog",
            },
            displayName: tokenName,
            secret: tokenKey,
            secretAvailability: "create-response-only" as const,
            credential: {
              accountName: "",
              apiType: "openai-compatible" as const,
              baseUrl: "",
              tagIds: [],
            },
          }
        : null,
    [hasToken, tokenKey, tokenName],
  )

  return <OneTimeSecretDialog {...props} result={result} />
}
