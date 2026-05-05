import { SortingCriteriaType } from "~/types/sorting"

/**
 * Builds the DOM target id used by options search for a sorting criteria control.
 */
export function getSortingCriteriaTargetId(criteria: SortingCriteriaType) {
  return `sorting-criteria-${criteria}`
}
