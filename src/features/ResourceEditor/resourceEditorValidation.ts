import type {
  EditableResourceProjection,
  ResourceFieldIssue,
  ResourceValidationResult,
} from "~/services/apiAdapters/contracts/resourceNative"

/** Show adapter errors for edited fields without marking untouched create fields as errors. */
export function getEditedResourceFieldIssues(
  validation: ResourceValidationResult | null,
  values: EditableResourceProjection,
  initialValues: EditableResourceProjection,
): readonly ResourceFieldIssue[] {
  return validation?.valid === false
    ? validation.issues.filter(
        (issue) => values[issue.fieldId] !== initialValues[issue.fieldId],
      )
    : []
}
