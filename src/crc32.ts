/**
 * Freelancer's CRC32 table.
 *
 * The standard reflected CRC-32 table, polynomial `0xEDB88320`, generated with a **signed** right
 * shift: `dacom.dll` held the running value in an `int`, so once the sign bit was set it stayed
 * set and every later round fed ones in from the top where an `unsigned` would have fed zeros.
 *
 * That is the whole of the difference and it is confined to one byte — all 256 entries agree with
 * the standard table in their low 24 bits, and only the high byte carries the borrowed sign.
 *
 * **Derived, not transcribed.** The table at offset `0x6330` in `EXE/dacom.dll` was read out and
 * compared entry for entry: all 256 match, which is what licenses generating it here.
 *
 * `>>` and not `>>>`, deliberately. The bug is the specification — correcting it yields a
 * different hash for every name in the game.
 */
const table = new Uint32Array(256)

for (let index = 0; index < 256; index++) {
  let value = index

  for (let round = 0; round < 8; round++) value = value & 1 ? (value >> 1) ^ 0xedb88320 : value >> 1

  table[index] = value
}

/**
 * Freelancer crc32 implementation. Used for most material names, mesh library names, etc.
 * @param bytes Sequence of bytes, a string or a number.
 * @param crc Initial hash value
 * @returns Signed 32-bit integer
 */
export default function crc32(bytes: Uint8Array, crc = 0): number {
  crc ^= -1

  for (let i = 0; i < bytes.length; i++)
    crc = (crc >>> 8) ^ (table[(crc & 0xff) ^ bytes[i]!]! >>> 0)

  return ~crc
}
