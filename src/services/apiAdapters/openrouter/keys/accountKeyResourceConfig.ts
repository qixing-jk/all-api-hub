import type { AccountKeyResourceDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import { type AccountKeyResourceOpenInput } from "~/services/apiAdapters/contracts/accountKeyResource"
import { type OpenRouterKeyDetail } from "~/services/apiAdapters/openrouter/keys/keyEditorSession"
import type {
  OpenRouterKeyCreateCommand,
  OpenRouterKeyUpdateCommand,
} from "~/services/apiAdapters/openrouter/keys/keyEditorSession"
import { type createOpenRouterKeyPagination } from "~/services/apiAdapters/openrouter/keys/keyPagination"
import { type OpenRouterWorkspace } from "~/services/apiService/openrouter"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

// OpenRouter's Management API uses a Management Key for `/keys` and workspace
// inventory. It documents no later key reveal: plaintext is create-response-only,
// so post-dispatch mutations are reconciled once and never replayed.
// https://github.com/OpenRouterTeam/docs/blob/main/openapi/openapi.yaml

export type OpenRouterKeyResourceConfig = {
  readonly account: AccountKeyResourceOpenInput["account"]
  readonly request: ApiServiceRequest
  readonly managementKey: string
  readonly defaultWorkspace: OpenRouterWorkspace
  readonly workspaceNames: Map<string, string>
  readonly pagination: ReturnType<typeof createOpenRouterKeyPagination>
}

export type OpenRouterNativeFailure = {
  readonly error: unknown
  readonly secrets: readonly string[]
}

export type OpenRouterAccountKeyDefinition = AccountKeyResourceDefinition<
  OpenRouterKeyResourceConfig,
  string,
  OpenRouterKeyDetail,
  OpenRouterKeyDetail,
  OpenRouterKeyCreateCommand,
  OpenRouterKeyUpdateCommand,
  OpenRouterNativeFailure
>
