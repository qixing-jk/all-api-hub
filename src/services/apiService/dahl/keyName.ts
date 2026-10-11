import { DAHL_KEY_NAME_MAX_LENGTH } from "./constants"

/** Website labels must be strings; optional editor values may additionally be absent. */
export function isDahlKeyName(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length <= DAHL_KEY_NAME_MAX_LENGTH
  )
}
