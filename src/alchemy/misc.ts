import BufferView from '#/utility/bufferview.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Reads signed 32-bit integer. */
export function readInteger(view: BufferView): number {
  return view.readInt32()
}

/** Writes signed 32-bit integer. */
export function writeInteger(value: number): BufferView {
  return BufferView.allocate(Int32Array.BYTES_PER_ELEMENT).writeInt32(value)
}

/** Reads 32-bit float point number. */
export function readFloat(view: BufferView): number {
  return view.readFloat32()
}

/** Writes 32-bit float point number. */
export function writeFloat(value: number): BufferView {
  return BufferView.allocate(Float32Array.BYTES_PER_ELEMENT).writeFloat32(value)
}

/** Reads prefixed NUL-terminated string. */
export function readString(view: BufferView): string {
  // String length in prefix includes NUL termination byte.
  const length = view.readUint16()

  // However the actual buffer will always have even length.
  const buffer = new Uint8Array(length + (length & 1))
  view.readBuffer(buffer)

  return decoder.decode(buffer.subarray(0, buffer.indexOf(0)))
}

/**
 * Writes prefixed NUL-terminated string.
 *
 * Retail encodes the empty string two ways: a lone NUL with its padding byte, which is what
 * this writes, and a bare zero prefix carrying no payload at all. Both decode to the same
 * value and the reader accepts either, so the distinction is lost on a round trip — see
 * `corpus.test.ts` for the two files that use the short form.
 */
export function writeString(value: string): BufferView {
  const buffer = encoder.encode(value)
  const length = buffer.byteLength + 1

  return BufferView.allocate(2 + length + (length & 1))
    .writeUint16(length)
    .writeBuffer(buffer)
}

/**
 * Blend factor, which is `D3DBLEND` verbatim: `Zero` is 1 against `D3DBLEND_ZERO` = 1, and every
 * entry lines up from there. Zero itself is not a D3D value — the enum starts at 1 — so it stands
 * for the property being unset.
 *
 * `BothSourceAlpha` and `BothInverseSourceAlpha` are the two D3D8 modes that set the destination
 * factor implicitly, and Direct3D accepts them only as a source. Retail uses one of them once, as a
 * *target*: `gf_small_damage.ale`'s `gf_small_damage_smoke2.app` writes 13. That is an authoring
 * slip rather than a mode — the artist picked a dropdown entry the API would refuse — but the byte
 * is real, and naming it is better than handing back a number that matches nothing.
 */
export enum BlendingMode {
  None,
  Zero,
  One,
  SourceColor,
  InverseSourceColor,
  SourceAlpha,
  InverseSourceAlpha,
  DestinationAlpha,
  InverseDestinationAlpha,
  DestinationColor,
  InverseDestinationColor,
  SourceAlphaSAT,
  BothSourceAlpha,
  BothInverseSourceAlpha,
}

/** A Direct3D blend equation as a pair of {@link BlendingMode} factors. */
export interface Blending {
  source: BlendingMode
  target: BlendingMode
}

/** Reads blending mode. */
export function readBlending(view: BufferView): Blending {
  return {
    source: view.readUint32(),
    target: view.readUint32(),
  }
}

/** Writes blending mode. */
export function writeBlending({ source, target }: Blending): BufferView {
  return BufferView.allocate(Uint32Array.BYTES_PER_ELEMENT * 2)
    .writeUint32(source)
    .writeUint32(target)
}

/** Reads array of elements. */
export function readArray<T>(
  view: BufferView,
  read: (view: BufferView) => T,
  count = Infinity,
): T[] {
  const array: T[] = []
  while (count--) array.push(read(view))
  return array
}

/** Writes array of elements. */
export function writeArray<T>(array: T[], write: (value: T) => BufferView): BufferView {
  return BufferView.concat(array.map((value) => write(value)))
}
