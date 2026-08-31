/**
 * BINI layout constants. Little-endian throughout.
 *
 * A 12-byte header, then section records until the dictionary, then the dictionary. Nothing is
 * aligned: a property header is three bytes and a value is five.
 */

/** `BINI`, read as a little-endian `uint32`. */
export const SIGNATURE = 0x494e4942

/** The only version retail carries, in all 1,251 files. The game itself never reads the field. */
export const VERSION = 1

/** `signature`, `version`, `namesOffset`. */
export const HEADER_BYTE_LENGTH = 12

/** `nameOffset` uint16, `propertyCount` uint16. */
export const SECTION_BYTE_LENGTH = 4

/** `nameOffset` uint16, `valueCount` uint8. Three bytes, with no padding after them. */
export const PROPERTY_BYTE_LENGTH = 3

/** `type` uint8 and a fixed four-byte payload, whatever the type. */
export const VALUE_BYTE_LENGTH = 5

/** Largest offset a section or property name can sit at, since those offsets are `uint16`. */
export const MAX_NAME_OFFSET = 0xffff

/** Largest `propertyCount`. */
export const MAX_PROPERTIES = 0xffff

/** Largest `valueCount`. */
export const MAX_VALUES = 0xff

export const ValueTag = {
  Boolean: 0x0,
  Integer: 0x1,
  Float: 0x2,
  String: 0x3,
} as const

/** The type tag a BINI value carries, which is what makes {@link Value} a discriminated union. */
export type ValueTag = (typeof ValueTag)[keyof typeof ValueTag]
