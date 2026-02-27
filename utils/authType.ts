import { AuthTypeEnum } from "~/types"

/**
 * Runtime-safe coercion for {@link AuthTypeEnum} values.
 *
 * This is useful for JSON-serializable payloads crossing runtime messaging
 * boundaries where types cannot be trusted at compile time.
 */
export function resolveAuthTypeEnum(
  authType: unknown,
): AuthTypeEnum | undefined {
  return authType &&
    Object.values(AuthTypeEnum).includes(authType as AuthTypeEnum)
    ? (authType as AuthTypeEnum)
    : undefined
}
