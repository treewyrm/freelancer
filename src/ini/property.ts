import { fold } from '#/utility/string.js'
import type { Value, ValueType } from './types.js'
import { toBoolean, toFloat, toInteger, toText } from './value.js'

/** The JavaScript type a {@link ValueType} coerces to. */
type TypeOf<T extends ValueType> = T extends 'boolean'
  ? boolean
  : T extends 'integer' | 'float'
    ? number
    : string

/**
 * A tuple of coerced values matching a tuple of requested types, each `undefined` where the property
 * has no value in that position.
 */
type TypeValues<T extends ValueType[]> = { [K in keyof T]: TypeOf<T[K]> | undefined }

/**
 * A named list of values.
 *
 * Zero values is normal and means something — 1,063 retail properties have none, and that is how a
 * flag is written. Duplicate names within a section are equally normal: `[Loadout] equip` repeats
 * 16,074 times across retail, and each repeat is another item in a list, not an overwrite.
 */
export class Property {
  /** 0..255 values; the count is a `uint8` in BINI. */
  values: Value[]

  /** Trailing comment on the property's own line, e.g. `a = 1 ; note`. Text-only. */
  comment = ''

  /** @param name As authored. Compared case-insensitively, never folded in place. */
  constructor(
    public name: string,
    ...values: Value[]
  ) {
    this.values = values
  }

  /** Case-folded `name`, for a caller's own comparisons. */
  get label(): string {
    return fold(this.name)
  }

  /** Values in specified types, positionally. */
  format<T extends ValueType[]>(...types: [...T]): TypeValues<T> {
    let index = 0
    let value: Value | undefined
    let result = Array(types.length).fill(undefined)

    for (const type of types) {
      value = this.values[index]
      if (!value) break

      switch (type) {
        case 'boolean':
          result[index] = toBoolean(value)
          break
        case 'integer':
          result[index] = toInteger(value)
          break
        case 'float':
          result[index] = toFloat(value)
          break
        case 'string':
          result[index] = toText(value)
          break
      }

      index++
    }

    return result as TypeValues<T>
  }
}
