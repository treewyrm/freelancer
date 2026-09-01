import * as binary from './binary/index.js'
import type { Format } from './document.js'
import * as save from './save/index.js'
import * as text from './text/index.js'

export * from './types.js'
export * from './property.js'
export * from './section.js'
export * from './document.js'
export * as value from './value.js'

/**
 * Detects the encoding of a buffer without parsing it.
 *
 * Free rather than a member because it answers a question about bytes, not about a document —
 * there is no `Document` yet when it is asked. `Document.read` routes on the same two probes.
 *
 * @param data File bytes.
 */
export const formatOf = (data: ArrayBufferView | ArrayBufferLike): Format =>
  binary.isBinary(data) ? 'binary' : save.isSave(data) ? 'save' : 'text'

export { binary, save, text }
