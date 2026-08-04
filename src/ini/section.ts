import type { Document, Property, Section, Value } from './types.js'
import { getObjectId } from '#/hash.js'
import { equals as sameName } from '#/utility/string.js'
import { toText } from './value.js'

/**
 * Reading a document.
 *
 * Every lookup here folds case and none of them string-compares, because six retail section names
 * and 32 property names are spelled more than one way — `ObjList` and `Objlist`, `zone` and `Zone`.
 * Nothing folds a name *in place*: what was read is what gets written back.
 *
 * Every lookup also comes in a singular and a plural form, and the plural is usually the honest
 * one. A repeated property is a list, not a mistake.
 */

/** First section with this name, or `undefined`. */
export const findSection = (document: Document, name: string): Section | undefined =>
  document.find((section) => sameName(section.name, name))

/** Every section with this name, in file order. */
export const filterSections = (document: Document, name: string): Section[] =>
  document.filter((section) => sameName(section.name, name))

/** First property with this name, or `undefined`. */
export const findProperty = (section: Section, name: string): Property | undefined =>
  section.properties.find((property) => sameName(property.name, name))

/** Every property with this name, in file order. */
export const filterProperties = (section: Section, name: string): Property[] =>
  section.properties.filter((property) => sameName(property.name, name))

/**
 * Values of the first property with this name, or `undefined` when there is no such property.
 *
 * An empty array is not the same answer: a property that is present with no values is a flag that
 * is set, and 1,063 retail properties are exactly that.
 */
export const getValues = (section: Section, name: string): Value[] | undefined =>
  findProperty(section, name)?.values

/** First value of the first property with this name. */
export const getValue = (section: Section, name: string, index = 0): Value | undefined =>
  getValues(section, name)?.[index]

/** Whether a property is present at all, whatever its values. */
export const hasProperty = (section: Section, name: string): boolean =>
  findProperty(section, name) !== undefined

/** Appends a property, which is how a repeated property is added. */
export const addProperty = (section: Section, name: string, values: Value[] = []): Property => {
  const property: Property = { name, values }
  section.properties.push(property)
  return property
}

/** Appends a section. */
export const addSection = (
  document: Document,
  name: string,
  properties: Property[] = [],
): Section => {
  const section: Section = { name, properties }
  document.push(section)
  return section
}

/**
 * The `nickname` a section identifies itself by, as text.
 *
 * 108 of the 256 retail section names always carry one, 136 never do, and three sometimes do.
 */
export const getNickname = (section: Section, name = 'nickname'): string | undefined => {
  const value = getValue(section, name)
  return value === undefined ? undefined : toText(value)
}

/**
 * Finds a section by its `nickname`, comparing hashes rather than text.
 *
 * This is how the game resolves a cross-file reference, so a lookup that matches here matches
 * there — including the case folding, which `getObjectId` does.
 */
export const findByNickname = (
  document: Document,
  nickname: string,
  name = 'nickname',
): Section | undefined => {
  const id = getObjectId(nickname)

  return document.find((section) => {
    const value = getNickname(section, name)
    return value !== undefined && getObjectId(value) === id
  })
}
