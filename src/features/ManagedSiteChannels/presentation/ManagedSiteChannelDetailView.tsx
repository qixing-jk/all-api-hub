import type { ManagedChannelsCell } from "./contracts"

/** Renders safe read-only channel facts without reusing editable controls. */
export function ManagedSiteChannelDetailView({
  name,
  fields,
  missingValue = "",
}: {
  name: string
  fields: Array<{ label: string; value: ManagedChannelsCell | string }>
  missingValue?: string
}) {
  return (
    <div className="space-y-4" aria-label={name}>
      <h3 className="font-semibold">{name}</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.label}>
            <dt className="text-muted-foreground text-xs font-medium uppercase">
              {field.label}
            </dt>
            <dd className="mt-1">
              {typeof field.value === "string"
                ? field.value || missingValue
                : field.value.kind === "groups"
                  ? field.value.values.join(", ") || missingValue
                  : field.value.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
