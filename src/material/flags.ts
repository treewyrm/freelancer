/**
 * How a sampler addresses one axis past the texture's edge: `D3DTEXTUREADDRESS` minus one, as each
 * axis' field of a slot's flag word holds it.
 *
 * Retail uses {@link Wrap} and {@link Clamp} only — no flag word in the corpus mirrors or borders.
 */
export enum TextureAddress {
  /** Repeat the texture, `D3DTADDRESS_WRAP`. */
  Wrap = 0,

  /** Repeat it reflected, `D3DTADDRESS_MIRROR`. Unused in retail. */
  Mirror = 1,

  /** Stretch the edge texel, `D3DTADDRESS_CLAMP`. */
  Clamp = 2,

  /** Fill with the border colour, `D3DTADDRESS_BORDER`. Unused in retail. */
  Border = 3,
}

/** A texture's two axes, naming the field {@link getAddress} and {@link setAddress} reach. */
export type TextureAxis = 'u' | 'v'

/** The U address field of a slot's flag word, bits 0–1: a {@link TextureAddress}. */
export const ADDRESS_U_MASK = 0x3

/** Shift of the U address field. */
export const ADDRESS_U_SHIFT = 0

/** The V address field of a slot's flag word, bits 2–3: a {@link TextureAddress}. */
export const ADDRESS_V_MASK = 0xc

/** Shift of the V address field. */
export const ADDRESS_V_SHIFT = 2

/**
 * The UV map field of a slot's flag word, bits 4–7 — the property tables' *wrap mode*. Not the UV
 * map's index but 4 above it: `shading.dll` sets `D3DTSS_TEXCOORDINDEX` to the field minus 4 when
 * the field is at least 4, else to 0. Read and write it with {@link getMapIndex} and
 * {@link setMapIndex}.
 */
export const MAP_INDEX_MASK = 0xf0

/** Shift of the UV map field. */
export const MAP_INDEX_SHIFT = 4

/** The bias {@link MAP_INDEX_MASK}'s field carries over the UV map index. */
const MAP_INDEX_BASE = 4

const ADDRESS_MASK = { u: ADDRESS_U_MASK, v: ADDRESS_V_MASK } as const
const ADDRESS_SHIFT = { u: ADDRESS_U_SHIFT, v: ADDRESS_V_SHIFT } as const

/**
 * Reads how a slot addresses one axis.
 * @param flags Slot's flag word
 * @param axis Axis whose field to read
 */
export const getAddress = (flags: number, axis: TextureAxis): TextureAddress =>
  (flags & ADDRESS_MASK[axis]) >>> ADDRESS_SHIFT[axis]

/**
 * Sets how a slot addresses one axis, leaving the rest of the word alone.
 * @param flags Slot's flag word
 * @param axis Axis whose field to write
 * @param address Address mode for the axis
 * @throws RangeError on an address the two-bit field cannot hold.
 */
export function setAddress(flags: number, axis: TextureAxis, address: TextureAddress): number {
  if (!Number.isInteger(address) || address < TextureAddress.Wrap || address > TextureAddress.Border)
    throw new RangeError(`Invalid texture address: ${address}`)

  return ((flags & ~ADDRESS_MASK[axis]) | (address << ADDRESS_SHIFT[axis])) >>> 0
}

/**
 * Calculates which UV map a slot samples, as the device is told it. Every field below 4 reads as
 * UV0, so a word with the field clear and one at `0x40` sample alike.
 * @param flags Slot's flag word
 */
export function getMapIndex(flags: number): number {
  const field = (flags & MAP_INDEX_MASK) >>> MAP_INDEX_SHIFT
  return field >= MAP_INDEX_BASE ? field - MAP_INDEX_BASE : 0
}

/**
 * Sets which UV map a slot samples, writing the field 4 above it and leaving the address bits alone.
 * @param flags Slot's flag word
 * @param index UV map index, 0 to 7
 * @throws RangeError on an index past the eight UV maps D3D can hand a stage.
 */
export function setMapIndex(flags: number, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > 7)
    throw new RangeError(`Invalid UV map index: ${index}`)

  return ((flags & ~MAP_INDEX_MASK) | ((index + MAP_INDEX_BASE) << MAP_INDEX_SHIFT)) >>> 0
}
