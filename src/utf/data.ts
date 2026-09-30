/**
 * The container's layout constants: what the reader checks and the writer emits.
 *
 * Module-private in the same way `ini/binary` and `resource` keep theirs. A caller never lays out a
 * tree entry by hand, and {@link isUTF} answers the only question the signature is good for.
 */

/** `UTF ` read as a little-endian `uint32`. */
export const SIGNATURE = 0x20465455

/** Header version. It's the only known version. */
export const VERSION = 0x101

/** Entry attribute marking a file. */
export const FILE_ATTRIBUTE = 0x80

/** Entry attribute marking a directory. */
export const DIRECTORY_ATTRIBUTE = 0x10

/** Entry byte length. Freelancer crashes on any other. */
export const ENTRY_BYTE_LENGTH = 0x2c

/** Signature and version, ahead of the header proper. */
export const VERSION_BYTE_LENGTH = 0x8

/** Header byte length, after the signature and version. */
export const HEADER_BYTE_LENGTH = 0x30
