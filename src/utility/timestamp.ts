/** Convert Date object to DOS timestamp. */
export const toDOSTimestamp = (date: Date): number =>
  ((date.getSeconds() >> 1) & 0x1f) |
  ((date.getMinutes() & 0x3f) << 5) |
  ((date.getHours() & 0x1f) << 11) |
  ((date.getDate() & 0x1f) << 16) |
  (((date.getMonth() + 1) & 0xf) << 21) |
  (((date.getFullYear() - 1980) & 0x7f) << 25)

/** Convert DOS timestamp to Date object. */
export const fromDOSTimestamp = (value: number): Date =>
  new Date(
    ((value >> 25) & 0x7f) + 1980,
    ((value >> 21) & 0xf) - 1,
    (value >> 16) & 0x1f,
    (value >> 11) & 0x1f,
    (value >> 5) & 0x3f,
    (value & 0x1f) * 2,
  )

export const toFileTime = (date: Date): bigint => (BigInt(date.getTime()) + 11644473600000n) * 10000n

export const fromFileTime = (value: bigint): Date =>
  new Date(Number(value / 10000n - 11644473600000n))
