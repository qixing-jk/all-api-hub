import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  resolveDefaultTokenQuickCreateResolution,
  TOKEN_QUICK_CREATE_RESOLUTION_KINDS,
  type DefaultTokenGroupSelection,
} from "~/services/accounts/tokenQuickCreateResolution"
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  isCreatedApiToken,
  TOKEN_PROVISIONING_ERRORS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiToken, DisplaySiteData } from "~/types"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

export const DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS = {
  Idle: "idle",
  Resolving: "resolving",
  Selecting: "selecting",
  Creating: "creating",
} as const

type DefaultTokenQuickCreateState =
  | {
      kind: typeof DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Idle
      error: string | null
    }
  | { kind: typeof DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Resolving }
  | {
      kind: typeof DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Selecting
      selection: DefaultTokenGroupSelection
      error: string | null
    }
  | {
      kind: typeof DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Creating
      selection: DefaultTokenGroupSelection | null
    }

interface DefaultTokenQuickCreateViewState {
  selection: DefaultTokenGroupSelection | null
  isBusy: boolean
  isCreating: boolean
  error: string | null
}

/** Projects state-machine details into the display contract consumed by dialogs. */
function getDefaultTokenQuickCreateViewState(
  state: DefaultTokenQuickCreateState,
): DefaultTokenQuickCreateViewState {
  const isSelecting =
    state.kind === DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Selecting
  const isCreating =
    state.kind === DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Creating

  return {
    selection: isSelecting || isCreating ? state.selection : null,
    isBusy:
      state.kind === DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Resolving ||
      isCreating,
    isCreating,
    error:
      state.kind === DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Idle || isSelecting
        ? state.error
        : null,
  }
}

interface UseDefaultTokenQuickCreateOptions {
  isActive: boolean
  account: DisplaySiteData | null
  canCreate: boolean
  onCreated: (createdToken?: ApiToken) => void | Promise<void>
}

const DEFAULT_TOKEN_QUICK_CREATE_EXECUTION_KINDS = {
  Created: "created",
} as const

type DefaultTokenQuickCreateExecutionResult =
  | Exclude<
      Awaited<ReturnType<typeof resolveDefaultTokenQuickCreateResolution>>,
      { kind: typeof TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready }
    >
  | {
      kind: typeof DEFAULT_TOKEN_QUICK_CREATE_EXECUTION_KINDS.Created
      createdToken?: ApiToken
    }

const createIdleState = (
  error: string | null = null,
): DefaultTokenQuickCreateState => ({
  kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Idle,
  error,
})

const createFailureState = (
  selection: DefaultTokenGroupSelection | null,
  error: string,
): DefaultTokenQuickCreateState =>
  selection
    ? {
        kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Selecting,
        selection,
        error,
      }
    : createIdleState(error)

/** Resolves quick-create policy and creates a token only when the decision is ready. */
async function executeDefaultTokenQuickCreate(
  account: DisplaySiteData,
  explicitGroup?: string,
): Promise<DefaultTokenQuickCreateExecutionResult> {
  const { keyManagement, request } = createDisplayAccountApiContext(account)
  const resolution = explicitGroup
    ? await resolveDefaultTokenQuickCreateResolution(account, { explicitGroup })
    : await resolveDefaultTokenQuickCreateResolution(account)

  if (resolution.kind !== TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Ready) {
    return resolution
  }

  const created = await requireDisplayAccountKeyManagement(
    account,
    keyManagement,
  ).createToken(request, resolution.tokenData)
  if (!created) {
    throw new Error(TOKEN_PROVISIONING_ERRORS.CreateTokenFailed)
  }

  return {
    kind: DEFAULT_TOKEN_QUICK_CREATE_EXECUTION_KINDS.Created,
    createdToken: isCreatedApiToken(created) ? created : undefined,
  }
}

/** Owns default-token quick-create resolution, selection, creation, and failure state. */
export function useDefaultTokenQuickCreate({
  isActive,
  account,
  canCreate,
  onCreated,
}: UseDefaultTokenQuickCreateOptions) {
  const { t } = useTranslation("ui")
  const [state, setState] = useState<DefaultTokenQuickCreateState>(() =>
    createIdleState(),
  )
  const operationIdRef = useRef(0)
  const isOperationActiveRef = useRef(false)

  const reset = useCallback(() => {
    operationIdRef.current += 1
    isOperationActiveRef.current = false
    setState(createIdleState())
  }, [])

  useEffect(() => {
    reset()
  }, [account, isActive, reset])

  const execute = useCallback(
    async (
      explicitGroup?: string,
      currentSelection: DefaultTokenGroupSelection | null = null,
    ) => {
      if (!isActive || !account) return

      if (!canCreate) {
        const error = t("dialog.copyKey.createNotSupported")
        setState(createFailureState(currentSelection, error))
        return
      }

      if (isOperationActiveRef.current) return

      const operationId = (operationIdRef.current += 1)
      isOperationActiveRef.current = true
      setState(
        explicitGroup
          ? {
              kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Creating,
              selection: currentSelection,
            }
          : { kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Resolving },
      )

      try {
        const result = await executeDefaultTokenQuickCreate(
          account,
          explicitGroup,
        )

        if (operationIdRef.current !== operationId) return

        if (result.kind === TOKEN_QUICK_CREATE_RESOLUTION_KINDS.Blocked) {
          setState(createFailureState(currentSelection, result.message))
          return
        }

        if (
          result.kind === TOKEN_QUICK_CREATE_RESOLUTION_KINDS.SelectionRequired
        ) {
          setState({
            kind: DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Selecting,
            selection: {
              allowedGroups: result.allowedGroups,
              suggestedGroup: result.suggestedGroup,
              groups: result.groups,
            },
            error: null,
          })
          return
        }

        setState(createIdleState())
        await onCreated(result.createdToken)
      } catch (error) {
        if (operationIdRef.current !== operationId) return
        logger.error("Failed to create default key", {
          error,
          accountId: account.id,
          baseUrl: account.baseUrl,
          siteType: account.siteType,
        })
        const createError = t("dialog.copyKey.createFailed", {
          error: getErrorMessage(error),
        })
        setState(createFailureState(currentSelection, createError))
      } finally {
        if (operationIdRef.current === operationId) {
          isOperationActiveRef.current = false
        }
      }
    },
    [account, canCreate, isActive, onCreated, t],
  )

  const start = useCallback(() => execute(), [execute])

  const confirmGroup = useCallback(
    (group: string) => {
      const selection =
        state.kind === DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Selecting
          ? state.selection
          : null
      const normalizedGroup = group.trim()
      if (!selection || !normalizedGroup) return Promise.resolve()
      return execute(normalizedGroup, selection)
    },
    [execute, state],
  )

  const cancelSelection = useCallback(() => {
    if (state.kind !== DEFAULT_TOKEN_QUICK_CREATE_STATE_KINDS.Selecting) return
    setState(createIdleState())
  }, [state.kind])

  const view = getDefaultTokenQuickCreateViewState(state)

  return {
    state,
    view,
    start,
    confirmGroup,
    cancelSelection,
    reset,
  }
}

const logger = createLogger("DefaultTokenQuickCreate")
