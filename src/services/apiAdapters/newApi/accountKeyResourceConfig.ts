import type { AccountKeyResourceDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import {
  type AccountKeyResourceOpenInput,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { type NewApiKeyEditCommand } from "~/services/apiAdapters/newApi/keyResourceEditor"
import {
  type NewApiFamilyTokenTransport,
  type NewApiKeyVariant,
} from "~/services/apiAdapters/newApi/keyVariant"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export type NewApiAccountKeyResourceConfig = {
  readonly account: AccountKeyResourceOpenInput["account"]
  readonly request: ApiServiceRequest
  readonly transport: NewApiFamilyTokenTransport
  readonly variant: NewApiKeyVariant
}

export type NewApiAccountTokenDefinition = AccountKeyResourceDefinition<
  NewApiAccountKeyResourceConfig,
  number,
  NewApiToken,
  NewApiToken,
  NewApiKeyEditCommand,
  NewApiKeyEditCommand,
  ResourceFailure
>
