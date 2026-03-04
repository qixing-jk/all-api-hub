import type { FilterFn } from "@tanstack/react-table"

import type { ChannelRow } from "../types"

export const multiColumnFilterFn: FilterFn<ChannelRow> = (
  row,
  _columnId,
  filterValue,
) => {
  const content =
    `${row.original.id} ${row.original.name} ${row.original.base_url} ${row.original.group}`
      .toLowerCase()
      .trim()
  const searchTerm = (filterValue ?? "").toLowerCase().trim()
  if (!searchTerm) return true
  return content.includes(searchTerm)
}

export const statusFilterFn: FilterFn<ChannelRow> = (
  row,
  columnId,
  filterValue: string[],
) => {
  if (!filterValue?.length) return true
  return filterValue.includes(String(row.getValue(columnId)))
}

export const channelIdFilterFn: FilterFn<ChannelRow> = (
  row,
  columnId,
  filterValue,
) => {
  const value = String(row.getValue(columnId) ?? "").trim()
  const expected = String(filterValue ?? "").trim()
  if (!expected) return true
  return value === expected
}
