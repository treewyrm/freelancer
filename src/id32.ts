/**
 * Freelancer's object-id table.
 *
 * A CRC table generated **MSB-first** — the index enters at the top byte and the polynomial is
 * applied on a left shift — with the polynomial `0x00500080`, that is x²² + x²⁰ + x⁷. Neither
 * half of that matches {@link module:crc32}, which is LSB-first over `0xEDB88320`: these are two
 * different hashes that share only the shape of their byte loop.
 *
 * The loop consuming the table below is the LSB-first one, so generation and consumption disagree
 * about direction. That disagreement is what the game shipped and therefore what the hash *is*,
 * not something to reconcile.
 *
 * The polynomial's top bit is clear, so a reduced value can never reduce again — the feedback
 * fires 1,024 times across the 2,048 rounds and never cascades. That is why the table is equally
 * the carry-less product of the index with `0x00500080`; both generations agree entry for entry.
 *
 * **Derived, not transcribed** — checked against the 256 literals this replaced, all matching.
 */
const table = new Uint32Array(256)

for (let index = 0; index < 256; index++) {
  let value = index << 24

  for (let round = 0; round < 8; round++)
    value = value & 0x80000000 ? (value << 1) ^ 0x00500080 : value << 1

  table[index] = value
}

/**
 * A variation of Freelancer crc32 used for nicknames of objects.
 * @param array Array of bytes
 * @param crc Initial hash value
 * @returns Signed 32-bit integer
 */
export default function id32(array: Uint8Array, crc = 0): number {
  for (let i = 0; i < array.length; i++)
    crc = (crc >>> 8) ^ (table[(crc & 0xff) ^ array[i]!]! >>> 0)

  const a = crc >>> 24
  const b = (crc >> 8) & 0xff00
  const c = (crc << 8) & 0xff0000
  const d = crc << 24

  return ((a | b | c | d) >>> 2) | 0x80000000
}
