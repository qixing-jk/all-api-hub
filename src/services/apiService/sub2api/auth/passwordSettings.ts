const PASSWORD_VERIFICATION_FLAGS = [
  "turnstile_enabled",
  "tencent_captcha_enabled",
  "aliyun_captcha_enabled",
] as const

/** Native and API preparation must agree on whether verification is required. */
export function requiresSub2ApiPasswordVerification(
  settings: Record<string, unknown>,
): boolean {
  return PASSWORD_VERIFICATION_FLAGS.some((flag) => settings[flag] === true)
}
