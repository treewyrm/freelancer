export const swapRB16 = (c: number): number =>
  ((c & 0x3e) << 10) | (c & 0x7c0) | ((c & 0xf800) >> 10)

// 16 bit targa expanded by: 0x7c00, 0x3e0, 0x1f

export const swapRB24 = (c: number): number =>
  ((c & 0x0000ff) << 16) | (c & 0xff00) | ((c & 0xff0000) >> 16)

/** Swap red and blue channels in 32-bit integer representing RGBA channels. */
export const swapRB32 = (c: number): number =>
  ((c & 0x0000ff) << 16) | (c & 0xff00ff00) | ((c & 0xff0000) >> 16)

/**
 * Converts 16-bit integer (5-6-5) pixel to 24-bit.
 * @param pixel
 * @returns
 */
export const expand565to888 = (pixel: number): [r: number, g: number, b: number] => {
  let r = (pixel >> 11) & 0x1f,
    g = (pixel >> 5) & 0x3f,
    b = pixel & 0x1f

  r = (r << 3) | (r >> 2)
  g = (g << 2) | (g >> 4)
  b = (b << 3) | (b >> 2)

  return [r, g, b]
}

/**
 * Converts 24-bit RGB to 32-bit RGBA
 * @param source
 * @param width
 * @param height
 * @returns
 */
export const expandRGBtoRGBA = (
  source: Uint8Array,
  width: number,
  height: number,
  alpha = 0xff,
) => {
  const target = new Uint8Array(width * height * Uint32Array.BYTES_PER_ELEMENT)

  for (let s = 0, d = 0; s < source.byteLength; ) {
    target[d++] = source[s++]!
    target[d++] = source[s++]!
    target[d++] = source[s++]!
    target[d++] = alpha
  }

  return target
}

/**
 * Expands 16-bit bitmap to 24 or 32-bit bitmap with custom color masks.
 * @param source Input 16-bit bitmap
 * @param width Image width
 * @param height Image height
 * @param bpp Bits per pixel
 * @param mR Red bits mask
 * @param mG Green bits mask
 * @param mB Blue bits mask
 * @param mA Alpha bits mask
 */
export const expandRGB = (
  source: Uint8Array | Uint16Array,
  width: number,
  height: number,
  bpp: number,
  mR: number,
  mG: number,
  mB: number,
  mA = 0,
) => {
  if (source instanceof Uint8Array)
    source = new Uint16Array(
      source.buffer,
      source.byteOffset,
      source.byteLength / Uint16Array.BYTES_PER_ELEMENT,
    )

  if (width * height !== source.length) throw new RangeError('Invalid source array size')

  const result = new Uint8Array((width * height * bpp) >> 3)
  let sR = 0,
    sG = 0,
    sB = 0,
    sA = 0,
    xR = 0,
    xG = 0,
    xB = 0,
    xA = 0

  // https://graphics.stanford.edu/~seander/bithacks.html#ZerosOnRightParallel
  function getShift(m: number) {
    let c = 16

    m = m & -m
    if (m) c--
    if (m & 0x00ff) c -= 8
    if (m & 0x0f0f) c -= 4
    if (m & 0x3333) c -= 2
    if (m & 0x5555) c -= 1
    return c
  }

  // Shifts (s0) and color amp multipliers (x0)
  if (mR > 0) xR = 0xff / (mR >> (sR = getShift(mR)))
  if (mG > 0) xG = 0xff / (mG >> (sG = getShift(mG)))
  if (mB > 0) xB = 0xff / (mB >> (sB = getShift(mB)))
  if (mA > 0) xA = 0xff / (mA >> (sA = getShift(mA)))

  // Loop over 16-bit pixels
  for (let s = 0, d = 0, p = 0; s < source.length; s++) {
    // Source pixel as 16-bit value.
    p = source[s]!

    result[d++] = (xR * (p & mR)) >> sR
    result[d++] = (xG * (p & mG)) >> sG
    result[d++] = (xB * (p & mB)) >> sB

    if (bpp >= 32) result[d++] = mA > 0 ? (xA * (p & mA)) >> sA : 0xff
    // if (mA > 0) result[d++] = (xA * (p & mA)) >> sA
  }

  return result
}
