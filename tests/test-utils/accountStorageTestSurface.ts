import { accountCheckInState } from "~/services/accounts/accountStorage/accountCheckInState"
import { accountConfigStore } from "~/services/accounts/accountStorage/accountConfigStore"
import { accountDataTransfer } from "~/services/accounts/accountStorage/accountDataTransfer"
import { accountEntryLayout } from "~/services/accounts/accountStorage/accountEntryLayout"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { accountStatistics } from "~/services/accounts/accountStorage/accountStatistics"
import { bookmarkRepository } from "~/services/accounts/accountStorage/bookmarkRepository"
import { sub2ApiAuthPersistence } from "~/services/accounts/accountStorage/sub2ApiAuthPersistence"

const modules = [
  accountConfigStore,
  accountQueries,
  accountMutations,
  sub2ApiAuthPersistence,
  accountCheckInState,
  accountRefresh,
  accountEntryLayout,
  bookmarkRepository,
  accountPresentation,
  accountReadModels,
  accountStatistics,
  accountDataTransfer,
] as const

type TestSurface = typeof accountQueries &
  typeof accountConfigStore &
  typeof accountMutations &
  typeof sub2ApiAuthPersistence &
  typeof accountCheckInState &
  typeof accountRefresh &
  typeof accountEntryLayout &
  typeof bookmarkRepository &
  typeof accountPresentation &
  typeof accountReadModels &
  typeof accountStatistics &
  typeof accountDataTransfer

const findOwner = (property: PropertyKey) =>
  modules.find((module) => property in module)

/** Lets legacy characterization tests spy on the real owning module. */
export const accountStorageTestSurface = new Proxy({} as TestSurface, {
  get(target, property, receiver) {
    if (Reflect.has(target, property)) {
      return Reflect.get(target, property, receiver)
    }
    const owner = findOwner(property)
    return owner ? Reflect.get(owner, property, receiver) : undefined
  },
  defineProperty(_target, property, attributes) {
    const owner = findOwner(property)
    return owner ? Reflect.defineProperty(owner, property, attributes) : false
  },
  getOwnPropertyDescriptor(_target, property) {
    const owner = findOwner(property)
    let current: object | null = owner ?? null
    let descriptor: PropertyDescriptor | undefined
    while (current && !descriptor) {
      descriptor = Reflect.getOwnPropertyDescriptor(current, property)
      current = Reflect.getPrototypeOf(current)
    }
    return descriptor ? { ...descriptor, configurable: true } : undefined
  },
  has(_target, property) {
    return Boolean(findOwner(property))
  },
})
