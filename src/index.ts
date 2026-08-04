/**
 * Identity and naming: how Freelancer names things, and how a name resolves to a reference.
 *
 * This is the one thing every format module shares and none of them owns — a `.cmp` names a mesh
 * the way an `.ale` names a node, and an INI names an archetype a different way. Nothing here
 * reads or interprets a format; each of those has its own subpath export, `./utf` included.
 */
export {
  filterObjects,
  filterResources,
  getObject,
  getObjectId,
  getResource,
  getResourceId,
  setObject,
  setResource,
  toBytes,
  type Hash,
  type Hashable,
  type Hasher,
} from './hash.js'
