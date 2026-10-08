import {
  assertDuplicateRequestHeaders,
  createNextConfig,
  dedupeProfiles,
  getIdentityKey,
} from "~/services/apiCredentialProfiles/profileConfigCodec"
import type {
  ApiCredentialProfile,
  ApiCredentialProfilesConfig,
} from "~/types/apiCredentialProfiles"

/** Reuse a credential identity without replacing its saved facts; only explicit source metadata may change. */
export function resolveProfileCreationCandidate(
  config: ApiCredentialProfilesConfig,
  candidate: ApiCredentialProfile,
  now: number,
) {
  const identityKey = getIdentityKey(candidate)
  const existing = config.profiles.find(
    (profile) => getIdentityKey(profile) === identityKey,
  )
  assertDuplicateRequestHeaders(existing, candidate)
  const sourceUrlChanged =
    existing !== undefined &&
    candidate.sourceUrl !== undefined &&
    candidate.sourceUrl !== existing.sourceUrl
  const profile =
    existing && sourceUrlChanged
      ? { ...existing, sourceUrl: candidate.sourceUrl, updatedAt: now }
      : existing ?? candidate
  return { profile, existing, sourceUrlChanged }
}

/** Plan identity reuse or creation and the verification-owner remap belonging to that write. */
export function planApiCredentialProfileCreation(
  config: ApiCredentialProfilesConfig,
  candidate: ApiCredentialProfile,
  now: number,
) {
  const { profile, existing, sourceUrlChanged } =
    resolveProfileCreationCandidate(config, candidate, now)
  if (existing)
    return {
      config: sourceUrlChanged
        ? createNextConfig({
            current: config,
            profiles: config.profiles.map((p) =>
              p.id === existing.id ? profile : p,
            ),
            now,
          })
        : null,
      result: { profile, isNew: false },
      profileIdRemap: null,
    }
  const { profiles, profileIdRemap } = dedupeProfiles([
    ...(Array.isArray(config.profiles) ? config.profiles : []),
    candidate,
  ])
  return {
    config: createNextConfig({ current: config, profiles, now }),
    result: { profile: candidate, isNew: true },
    profileIdRemap,
  }
}
