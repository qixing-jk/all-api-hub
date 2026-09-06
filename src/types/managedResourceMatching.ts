/** Native resource facts needed for duplicate and token-status matching. */
export interface ManagedResourceMatchCandidate {
  id: number | string
  name: string
  type: number | string
  base_url: string
  models: string
  key?: string
}
export interface ManagedResourceMatchList {
  items: ManagedResourceMatchCandidate[]
  total: number
  type_counts: Record<string, number>
}
