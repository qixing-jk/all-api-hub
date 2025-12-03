/**
 * Remove date suffixes from model names
 * Supports various date formats:
 * - yyyymmdd: -20240101, -20250722, _20240101
 * - yyyy-mm-dd: -2024-01-01, -2025-07-22
 * - yyyymm: -202401, -202507
 * - mm-yyyy: -01-2024, -07-2025
 * - mmdd: -0101, -0722
 */
export function removeDateSuffix(modelName: string): string {
  let result = modelName

  const patterns = [
    // yyyy-mm-dd or yyyy_mm_dd
    /[-_](?:19|20)\d{2}[-_]\d{2}[-_]\d{2}$/i,
    // mm-yyyy or mm_yyyy
    /[-_]\d{2}[-_](?:19|20)\d{2}$/i,
    // yyyyMMdd or yyyyMM (with separator)
    /[-_](?:19|20)\d{6}$/i,
    /[-_](?:19|20)\d{4}$/i,
    // mmdd
    /[-_]\d{4}$/i,
    // mm-dd or mm_dd
    /[-_]\d{2}[-_]\d{2}$/i,
  ]

  for (const pattern of patterns) {
    if (pattern.test(result)) {
      result = result.replace(pattern, "")
      return result
    }
  }

  return result
}
