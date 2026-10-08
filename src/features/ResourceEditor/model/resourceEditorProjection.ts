import type { EditableResourceProjection } from "~/services/apiAdapters/contracts/resourceNative"

export const readResourceString = (
  values: EditableResourceProjection,
  fieldId: string,
) => (typeof values[fieldId] === "string" ? values[fieldId] : "")

export const readResourceNumber = (
  values: EditableResourceProjection,
  fieldId: string,
) => {
  const value = values[fieldId]
  return typeof value === "number" || value === "" ? value : ""
}

export const readResourceBoolean = (
  values: EditableResourceProjection,
  fieldId: string,
) => values[fieldId] === true

export const readResourceList = (
  values: EditableResourceProjection,
  fieldId: string,
) => {
  const value = values[fieldId]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

export const normalizeResourceList = (values: readonly string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
]
