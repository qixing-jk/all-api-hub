import type {
  AccountOnboardingCapability,
  AccountOnboardingRequest,
} from "~/services/apiAdapters/contracts/accountOnboarding"

/** Validate supplied credentials before consulting ambient browser identity. */
export async function runAccountOnboarding(
  capability: AccountOnboardingCapability,
  request: AccountOnboardingRequest,
) {
  const session = capability.createSession(request)
  try {
    const existing = await session.verifyExistingCredentials()
    if (existing) return existing
    await session.discoverIdentity()
    await session.acquireCredentials?.()
    return await session.verifyAccount()
  } catch (error) {
    return session.fail(error)
  }
}
