import {
  flexRender,
  type Cell,
  type HeaderGroup,
  type Row,
  type Table as TanStackTable,
} from "@tanstack/react-table"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import type { ReactNode } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { Z_INDEX } from "~/constants/designTokens"
import { cn } from "~/lib/utils"

import { getManagedSiteChannelRowTestId } from "../testIds"
import type {
  ManagedChannelsColumnExtension,
  ManagedChannelsRowViewModel,
} from "./contracts"

type ManagedChannelsColumnMeta = {
  renderer?: "select" | "identifier" | "channel" | "value" | "actions"
  extension?: ManagedChannelsColumnExtension
}

/** Normalizes TanStack's untyped column metadata to the managed-channel contract. */
function getColumnMeta(meta: unknown): ManagedChannelsColumnMeta {
  return (meta ?? {}) as ManagedChannelsColumnMeta
}

/** Renders the shared managed-channel table from a controlled TanStack model. */
export function ManagedSiteChannelsTable({
  table,
  columnCount,
  isInitialLoading,
  loadingLabel,
  emptyMessage,
  emptyContent,
}: {
  table: TanStackTable<ManagedChannelsRowViewModel>
  columnCount: number
  isInitialLoading: boolean
  loadingLabel: string
  emptyMessage: string
  emptyContent?: ReactNode
}) {
  return (
    <div className="border-border bg-background overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          {table
            .getHeaderGroups()
            .map((headerGroup: HeaderGroup<ManagedChannelsRowViewModel>) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const meta = getColumnMeta(header.column.columnDef.meta)
                  return (
                    <TableHead
                      key={header.id}
                      data-column-extension={meta.extension?.kind}
                      data-column-namespace={
                        meta.extension?.kind === "native"
                          ? meta.extension.namespace
                          : undefined
                      }
                      className={cn(
                        meta.renderer === "actions" &&
                          cn(
                            "bg-background sticky right-0 border-l",
                            Z_INDEX.tableStickyHeader,
                          ),
                      )}
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {header.column.getIsSorted() === "asc" && (
                            <ChevronUp className="h-3.5 w-3.5 opacity-60" />
                          )}
                          {header.column.getIsSorted() === "desc" && (
                            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                          )}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
        </TableHeader>
        <TableBody>
          {isInitialLoading ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-32 text-center">
                <div className="text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loadingLabel}
                </div>
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length ? (
            table
              .getRowModel()
              .rows.map((row: Row<ManagedChannelsRowViewModel>) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  data-testid={getManagedSiteChannelRowTestId(
                    row.original.testToken,
                  )}
                  data-channel-name={row.original.name}
                  className="group align-middle"
                >
                  {row
                    .getVisibleCells()
                    .map((cell: Cell<ManagedChannelsRowViewModel, unknown>) => {
                      const meta = getColumnMeta(cell.column.columnDef.meta)
                      return (
                        <TableCell
                          key={cell.id}
                          data-column-extension={meta.extension?.kind}
                          data-column-namespace={
                            meta.extension?.kind === "native"
                              ? meta.extension.namespace
                              : undefined
                          }
                          data-state={
                            meta.renderer === "actions" && row.getIsSelected()
                              ? "selected"
                              : undefined
                          }
                          className={cn(
                            "py-3",
                            meta.renderer === "actions" &&
                              cn(
                                "bg-background group-hover:bg-muted/50 data-[state=selected]:bg-muted sticky right-0 border-l",
                                Z_INDEX.tableStickyCell,
                              ),
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      )
                    })}
                </TableRow>
              ))
          ) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-32 text-center">
                {emptyContent ?? (
                  <div className="text-muted-foreground text-sm">
                    {emptyMessage}
                  </div>
                )}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
