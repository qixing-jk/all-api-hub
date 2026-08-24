export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends infer U
    ? U extends object
      ? DeepPartial<U>
      : U
    : never
}

/** Makes selected object fields partial without weakening array element types. */
export type PartialWithNested<T, K extends keyof T> = Omit<Partial<T>, K> & {
  [P in K]?: Partial<T[P]>
}
