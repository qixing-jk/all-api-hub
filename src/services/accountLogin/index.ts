import type {
  AccountLoginCapability,
  AccountLoginRequest,
  AccountLoginResult,
} from "./contracts"
import { agentRouterAccountLogin } from "./providers/agentrouter"

// Browser login support can vary by deployment within the same API site type.
const capabilities: readonly AccountLoginCapability[] = [
  agentRouterAccountLogin,
]

/** Starts a fresh account login. Callers own interpretation of optional side effects. */
export async function loginAccount(
  request: AccountLoginRequest,
): Promise<AccountLoginResult> {
  const capability = capabilities.find((candidate) =>
    candidate.supports(request.account),
  )
  return capability ? capability.login(request) : { status: "unsupported" }
}
