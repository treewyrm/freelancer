# UTF (Universal Tree Format)

Binary container format used by Freelancer (2003) to store a hierarchical tree of named directories and files inside a single binary blob.

## On-disk layout

A UTF file consists of a fixed header followed by three data regions:

| Region               | Description                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Header**           | Magic signature (`UTF `, version `0x101`), followed by offsets and sizes for the three data regions           |
| **Tree block**       | Fixed-size 44-byte entries describing the directory/file hierarchy; nodes are linked by sibling/child offsets |
| **Dictionary block** | NUL-terminated ASCII entry names, deduplicated by CRC32                                                       |
| **Data block**       | Raw file payloads                                                                                             |

## Tree entries

Each tree entry is 44 bytes and encodes one node (directory or file):

| Field           | Type   | Description                                    |
| --------------- | ------ | ---------------------------------------------- |
| `nameOffset`    | uint32 | Byte offset into the dictionary block          |
| `unknown`       | uint32 | Unused                                         |
| `flags`         | uint32 | `0x10` = directory, `0x80` = file with data    |
| `siblingOffset` | uint32 | Offset to next sibling entry (0 if none)       |
| `childOffset`   | uint32 | Offset to first child entry (directories only) |
| `dataOffset`    | uint32 | Byte offset into the data block (files only)   |
| `dataLength`    | uint32 | Byte length of the file payload                |
| `nameHash`      | uint32 | CRC32 of the entry name (used for lookup)      |
| `timestamp`     | uint32 | DOS timestamp                                  |
| `unknown2`      | uint32 | Unused                                         |
| `unknown3`      | uint32 | Unused                                         |

## Parsing

`Directory.read(view)` parses the binary using a BFS queue starting from the root tree entry. `Directory.write()` re-serializes the in-memory tree back to binary. Both operate on `BufferView`, an internal stateful `DataView` subclass with sequential read/write methods and little-endian default.

Path lookups (`getDirectory`, `getFile`) match entry names using `getResourceId` (Freelancer CRC32) for case-insensitive comparison.
