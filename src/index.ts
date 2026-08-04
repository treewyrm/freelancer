/**
 * Freelancer's data formats: **INI** (plain text and BINI) and **THN** (Lua 3.2 scene scripts).
 *
 * The two are here together because INI is what points at a THN — `[Trigger] act_AddRTC` and
 * friends — and nowhere else do they meet. They share no document model, no encoding and no
 * vocabulary, so they are exported as namespaces rather than flattened: both define `Value`, `read`
 * and `write`, and those mean different things on each side.
 *
 * Import a namespace directly (`@treewyrm/ini2json/ini`, `@treewyrm/ini2json/thn`) when only one is
 * wanted; this entry point exists for code that handles both.
 */
export * as ini from './ini/index.js'
export * as thn from './thn/index.js'
