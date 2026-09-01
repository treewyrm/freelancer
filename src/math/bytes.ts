/**
 * Packing `float32` components into bytes, without the binary layer.
 *
 * The math module must not import `utility/bufferview.js` as a *value*. `BufferView` is a cursor
 * class of its own, and pulling it in anchors 4.9 KB into every bundle that imports anything from
 * `./math` — a consumer who wants `lerp` should not pay for a reader they never call. Only the
 * three `write` companions ever needed it, and only for `allocate`/`join`, so this replaces both.
 * The `read` companions take a `BufferView` as a type alone, which costs nothing.
 *
 * Endianness is stated rather than inherited: a `Float32Array` view would be whatever the host is,
 * and this library reads big-endian THN bytecode on the same machine it reads little-endian assets.
 */

/**
 * Packs `float32` values into a little-endian buffer, in order.
 *
 * Returns a `Uint8Array` rather than a `BufferView` — every caller hands the result straight to
 * `BufferView.join` or a `File`, both of which take any `ArrayBufferView`.
 */
export const writeFloat32 = (...values: number[]): Uint8Array => {
  const bytes = new Uint8Array(values.length * Float32Array.BYTES_PER_ELEMENT)
  const view = new DataView(bytes.buffer)

  for (let i = 0; i < values.length; i++)
    view.setFloat32(i * Float32Array.BYTES_PER_ELEMENT, values[i]!, true)

  return bytes
}
