/**
 * Freelancer's data formats: **INI** (plain text and BINI), **THN** (Lua 3.2 scene scripts), and
 * the **resource DLLs** the INIs' `ids_name` and `ids_info` numbers point into.
 *
 * The three are here together because INI is what points at the other two — `[Trigger] act_AddRTC`
 * reaches a THN, and every `ids_name` reaches a string table — and nowhere else do they meet. They
 * share no document model, no encoding and no vocabulary, so they are exported as namespaces rather
 * than flattened: all three define `read` and `write`, and those mean different things on each side.
 *
 * Import a namespace directly (`@treewyrm/ini2json/ini`, `/thn`, `/resource`) when only one is
 * wanted; this entry point exists for code that handles more than one.
 */
export * as ini from './ini/index.js'
export * as resource from './resource/index.js'
export * as thn from './thn/index.js'
