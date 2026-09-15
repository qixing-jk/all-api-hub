/** Extension-generated names are product hints, separate from provider write fields. */
export const DEFAULT_AUTO_PROVISION_KEY_NAME = "user group (auto)"
const DEFAULT_KEY_GROUP_NAME = "default"

/** Names generated keys consistently without exposing provider write fields. */
export function getDefaultAccountKeyName(group = ""): string {
  const name = group.trim()
  return name && name !== DEFAULT_KEY_GROUP_NAME
    ? `${name} group (auto)`
    : DEFAULT_AUTO_PROVISION_KEY_NAME
}
