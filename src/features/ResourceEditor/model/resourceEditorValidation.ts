import type {
  EditableResourceProjection,
  ResourceFieldIssue,
  ResourceValidationResult,
} from "~/services/apiAdapters/contracts/resourceNative"

/** Show edited-field and newly introduced dependent errors, keeping initial errors quiet. */
export function getEditedResourceFieldIssues(
  validation: ResourceValidationResult | null,
  values: EditableResourceProjection,
  initialValues: EditableResourceProjection,
  initialValidation: ResourceValidationResult | null,
): readonly ResourceFieldIssue[] {
  return validation?.valid === false
    ? validation.issues.filter(
        (issue) =>
          values[issue.fieldId] !== initialValues[issue.fieldId] ||
          !(
            initialValidation?.valid === false &&
            initialValidation.issues.some(
              (initialIssue) =>
                initialIssue.fieldId === issue.fieldId &&
                initialIssue.code === issue.code,
            )
          ),
      )
    : []
}
