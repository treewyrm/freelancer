export const isHex = (value: string): boolean => /^0x[A-Fa-f0-9]{1,8}$/.test(value)

export const parseHex = (value: string) =>
  value.startsWith('0x') ? parseInt(value.substring(2), 16) : NaN

export const toHex = (value: number, byteLength = 4, prefix = '0x') =>
  prefix +
  (value >>> 0)
    .toString(16)
    .toUpperCase()
    .padStart(byteLength * 2, '0')
