export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends infer U
    ? U extends object
      ? DeepPartial<U>
      : U
    : never
}
