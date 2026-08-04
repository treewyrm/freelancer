/** UTF header structure. */
export interface Header {
  /** Offset to tree block where entries are listed. */
  treeOffset: number

  /** Size of tree (in bytes). */
  treeSize: number

  /** Root entry offset relative to treeOffset. */
  entryOffset: number

  /** Entry size. Always 44 bytes. Freelancer will crash otherwise. */
  entrySize: number

  /** Offset to dictionary block. Entry names are ASCII strings with NUL terminator. */
  namesOffset: number

  /** Size allocated to dictionary (in bytes). */
  namesSizeAllocated: number

  /** Size of used space by dictionary (in bytes). Must be equal or less than namesSizeAllocated. */
  namesSizeUsed: number

  /** Offset to entry file data. */
  dataOffset: number

  /** Offset to extra data. */
  unusedOffset: number

  /** Size of extra data. */
  unusedSize: number

  /** Widows 64-bit FILETIME. */
  filetime: Date
}

/** UTF entry structure. */
export interface Entry {
  /** Offset to next sibling relative to treeOffset. */
  nextOffset: number

  /** Offset to entry name relative namesOffset. */
  nameOffset: number

  /** Entry filesystem properties (see: Win32 API dwFileAttributes). */
  fileAttributes: number

  /** Unused bitmask for filesystem sharing properties. */
  sharingAttributes: number

  /** Offset to either first child relative to treeOffset or to entry data relative to dataOffset. */
  childOffset: number

  /** Allocated length in data block for file entry. */
  dataSizeAllocated: number

  /** Actual used space, must be less or equal to allocated size. */
  dataSizeUsed: number

  /** Unused. Typically, is the same as used space size. */
  dataSizeUncompressed: number

  /** DOS file timestamp. */
  createTime: Date

  /** Same as above for last access timestamp. */
  accessTime: Date

  /** Same as above for last modification timestamp. */
  modifyTime: Date
}
