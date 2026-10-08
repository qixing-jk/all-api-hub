import { Fragment, useMemo } from "react"

import type {
  NativeResourceEditorBodyProps,
  NativeResourceFieldContext,
  NativeResourceResolvedField,
} from "./nativeResourceEditorContracts"
import { NativeResourceField } from "./NativeResourceField"
import { ResourceEditorSection } from "./ResourceEditorSection"
import { resolveResourceFieldPolicy } from "./resourceFieldPolicy"
import { useLoadedResourceOptions } from "./useLoadedResourceOptions"
import { useResourceSelectFieldState } from "./useResourceSelectFieldState"

/** Renders fact-driven native fields while leaving provider-specific controls to an override. */
export function NativeResourceEditorBody<TSection extends string>({
  t,
  descriptors,
  policy,
  sectionOrder,
  sectionLabelResolvers,
  values,
  fieldIssues = [],
  disabled = false,
  onValueChange,
  onLoadSecret,
  onLoadOptions,
  controlledOptionStates,
  onRetryControlledOptions,
  renderFieldOverride,
  renderSectionOverride,
}: NativeResourceEditorBodyProps<TSection>) {
  const resolvedFields = useMemo(
    () => resolveResourceFieldPolicy(descriptors, policy, sectionOrder).fields,
    [descriptors, policy, sectionOrder],
  )
  const fields = useMemo(
    () =>
      resolvedFields.filter(
        ({ presentation }) => presentation.visibleWhen?.(values) ?? true,
      ),
    [resolvedFields, values],
  )
  const activeDescriptors = useMemo(
    () => fields.map(({ descriptor }) => descriptor),
    [fields],
  )
  const optionLoading = useLoadedResourceOptions(
    activeDescriptors,
    values,
    onLoadOptions,
  )

  const selection = useResourceSelectFieldState({
    fields,
    values,
    optionStates: optionLoading.states,
    controlledOptionStates,
    canLoadOptions: Boolean(onLoadOptions),
    onValueChange,
  })

  const issuesByFieldId = new Map(
    fieldIssues.map((issue) => [issue.fieldId, issue.code]),
  )
  const fieldsBySection = new Map<TSection, typeof fields>()
  for (const field of fields) {
    const sectionFields = fieldsBySection.get(field.presentation.section) ?? []
    sectionFields.push(field)
    fieldsBySection.set(field.presentation.section, sectionFields)
  }
  const fieldContext: NativeResourceFieldContext<TSection> = {
    t,
    values,
    disabled,
    onValueChange,
    onLoadSecret,
    onLoadOptions,
    controlledOptionStates,
    onRetryControlledOptions,
    renderFieldOverride,
    issuesByFieldId,
    optionLoading,
    selection,
  }
  const renderField = (field: NativeResourceResolvedField<TSection>) => (
    <NativeResourceField
      key={field.descriptor.fieldId}
      field={field}
      context={fieldContext}
    />
  )

  return (
    <div className="space-y-density-4">
      {[...fieldsBySection.entries()].map(([section, sectionFields]) => {
        const sectionPolicy = policy.sections?.[section]
        const label =
          sectionPolicy?.resolveLabel?.(t) ?? sectionLabelResolvers[section](t)
        const groups: (typeof sectionFields)[] = []
        for (const field of sectionFields) {
          const previousGroup = groups.at(-1)
          if (
            field.presentation.inlineGroup &&
            previousGroup &&
            previousGroup[0]?.presentation.inlineGroup ===
              field.presentation.inlineGroup
          )
            previousGroup.push(field)
          else groups.push([field])
        }
        const content = groups.map((group) => {
          const [field] = group
          if (!field) return null
          if (field.presentation.inlineGroup) {
            return (
              <div
                key={field.descriptor.fieldId}
                className={`gap-y-density-2 flex min-w-0 flex-wrap gap-x-4 ${sectionPolicy?.columns === 2 ? "sm:col-span-2" : ""}`}
              >
                {group.map((item) => (
                  <div
                    key={item.descriptor.fieldId}
                    className="max-w-full min-w-0"
                  >
                    {renderField(item)}
                  </div>
                ))}
              </div>
            )
          }
          return sectionPolicy?.columns === 2 ? (
            <div
              key={field.descriptor.fieldId}
              className={
                field.presentation.width === "half"
                  ? "min-w-0"
                  : "min-w-0 sm:col-span-2"
              }
            >
              {renderField(field)}
            </div>
          ) : (
            renderField(field)
          )
        })
        const override = renderSectionOverride?.(section, label, content)
        return override !== undefined ? (
          <Fragment key={section}>{override}</Fragment>
        ) : sectionPolicy ? (
          <ResourceEditorSection
            key={section}
            label={label}
            summary={sectionPolicy.resolveSummary?.(t, values)}
            defaultOpen={sectionPolicy.defaultOpen}
            columns={sectionPolicy.columns}
            hasErrors={sectionFields.some(({ descriptor }) =>
              issuesByFieldId.has(descriptor.fieldId),
            )}
          >
            {content}
          </ResourceEditorSection>
        ) : (
          <fieldset key={section} className="min-w-0">
            <legend className="text-foreground mb-density-3 text-sm font-semibold">
              {label}
            </legend>
            <div className="space-y-density-4">{content}</div>
          </fieldset>
        )
      })}
    </div>
  )
}
