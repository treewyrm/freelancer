/** Concatenates one or more views into single ArrayBuffer. Copies data. */
export function concatViews(...views: ArrayBufferView[]): ArrayBuffer {
  const length = views.reduce((total, { byteLength }) => total + byteLength, 0)
  const view = new Uint8Array(length)
  let offset = 0

  for (const { buffer, byteOffset, byteLength } of views) {
    view.set(new Uint8Array(buffer, byteOffset, byteLength), offset)
    offset += byteLength
  }

  return view.buffer
}
