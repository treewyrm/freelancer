import type { Document } from '#/ini/types.js'
import type { Library } from '#/resource/index.js'
import type {
  Beam,
  Effect,
  EffectLOD,
  EffectType,
  Fuse,
  TextureShapes,
  VisEffect,
} from '#/fx/index.js'
import { read as readIni } from '#/ini/index.js'
import { read as readResources, readLibrary } from '#/resource/index.js'
import { Directory } from '#/utf/index.js'
import { fold } from '#/utility/string.js'
import type { AnyBlock, Pilot } from '#/ai/index.js'
import {
  readBeams,
  readEffectLODs,
  readEffectTypes,
  readEffects,
  readFuses,
  readTextureLibraries,
  readVisEffects,
} from '#/fx/index.js'
import { readBlocks, readPilots } from '#/ai/index.js'
import Assets from './assets.js'
import Resolver from './resolver.js'
import type { FileSystem } from './filesystem.js'
import type { DataEntry, Settings } from './config.js'
import { isMarker, readEntries, readLibraries, readSettings } from './config.js'
import { HARDCODED_FILES } from './hardcoded.js'
import { join } from './path.js'

/**
 * Loading what the game loads, in the order the game loads it.
 *
 * Everything else in this library reads one thing you already have the bytes for. This is the piece
 * that knows *which* bytes, and there is nowhere else for that knowledge to live: the order is
 * recorded in `EXE/freelancer.ini` and in string tables compiled into `Freelancer.exe` and
 * `content.dll`, and every consumer that has gone without has reimplemented a worse version of it.
 *
 * **Why this does not violate Invariant 6.** The rule is that the library models what the data
 * *means* and never decides what an application should *do*. A load order is not an application's
 * policy — it is the game's, it is written down in the game's own files, and it is falsifiable
 * against retail: load universe before solar and the game's own comment tells you what breaks.
 * What stays with the consumer is everything this class does not have: where the files are
 * ({@link FileSystem}), how much to keep, and when to drop it.
 *
 * **This is the only asynchronous module in the library.** Every reader it calls is synchronous and
 * gets bytes that have already arrived.
 *
 * The load sequence, and the three things in it that are not obvious:
 *
 * 1. `[Freelancer] data path` is `..\data`, written relative to `EXE` because that is the game's
 *    working directory — so it resolves against the config's own directory, not the install root.
 * 2. `[Resources]` lists six DLLs and the id space has seven. **`resources.dll` is library 0 and is
 *    not in the list**, being compiled into the executable. Missing it shifts every `ids_name` in
 *    the game by 0x10000, which resolves to the wrong text rather than to nothing.
 * 3. `[Data]` is walked **in file order and never grouped**. Order matters across keys as much as
 *    within one — the file itself says solar archetypes must load before universe — and two keys can
 *    name the same file, as `explosions` and `debris` both do.
 *
 * Keys with no reader yet still land in {@link Game.documents} as interim documents, so this is
 * useful before the other twelve domain modules exist and a module arriving later replaces a
 * default arm without disturbing the walk.
 */

/** Files the game opens by a name compiled into it, added to the walk alongside `[Data]`. */
export interface OpenOptions {
  /** Where the config is, relative to the filesystem root. */
  config?: string

  /**
   * Whether to read the resource DLLs.
   *
   * Seven PE images is the single most expensive part of opening an install, and a tool that only
   * wants geometry never asks an `ids_name`. Off leaves {@link Game.library} empty.
   */
  strings?: boolean

  /** LANGID to take from the resource DLLs, or every language when omitted. */
  language?: number

  /**
   * Whether to also walk the 58 paths compiled into the binaries — see {@link HARDCODED_FILES}.
   *
   * `[Data]` is not the whole load list: the mission scripts, the faction and NPC tables, the
   * pilots, the random-mission data and the interface layout are all opened by name from code. **On
   * is what the game does**, and a tool that wants the AI or the missions has no other way to reach
   * them.
   *
   * Off by default all the same, because turning it on changes what {@link Game.documents} and
   * {@link Game.entries} contain and existing consumers pin counts on both. The cost is 58 more
   * files, which is small next to the seven DLLs `strings` reads.
   */
  hardcoded?: boolean
}

/** What a `[Data]` entry turned into. */
export interface LoadedEntry extends DataEntry {
  /** The path that was actually read, in the tree's own case. Absent when nothing resolved. */
  resolved?: string

  /** Why the entry produced nothing, when it did not. */
  error?: string

  /** Whether the path came from a binary's string table rather than from `[Data]`. */
  hardcoded?: true
}

/** Everything `./ai` recognized, accumulated across every file that contributed to it. */
export interface Ai {
  /** Includes the `CHARACTERS/newcharacter.ini` one — see `./ai`'s `isBehaviour`. */
  pilots: Pilot[]

  /** All seventeen block kinds in one list, discriminated by `type`. */
  blocks: AnyBlock[]
}

/** Everything `./fx` recognized, accumulated across every file that contributed to it. */
export interface Effects {
  effects: Effect[]
  visuals: VisEffect[]
  types: EffectType[]
  lods: EffectLOD[]
  beams: Beam[]
  shapes: TextureShapes[]
  fuses: Fuse[]
}

export default class Game {
  /** Resolves authored paths against the install, folding case. */
  readonly paths: Resolver

  /** The flat CRC namespace every UTF reference resolves in. */
  readonly assets = new Assets()

  /** `ids_name` and `ids_info`, in the global id space. Empty when `strings` was off. */
  readonly library: Library = { names: new Map(), infocards: new Map() }

  /** What `[Freelancer]` said. */
  settings!: Settings

  /** The parsed config, kept whole so a consumer can read the sections this class does not. */
  config!: Document

  /**
   * Interim documents by `[Data]` key, folded, each in load order.
   *
   * Every key lands here, including the ones a domain module has already read — the typed form is a
   * fixed point, not a replacement, and a tool that must not perturb bytes edits this.
   */
  readonly documents = new Map<string, Document[]>()

  /** Every `[Data]` entry in file order, with what became of it. */
  readonly entries: LoadedEntry[] = []

  /** What `./fx` read out of the `effects`, `effect_shapes` and `fuses` keys. */
  readonly effects: Effects = {
    effects: [],
    visuals: [],
    types: [],
    lods: [],
    beams: [],
    shapes: [],
    fuses: [],
  }

  /** What `./ai` read out of the `pilots` key. Empty unless `hardcoded` was on — see {@link OpenOptions}. */
  readonly ai: Ai = { pilots: [], blocks: [] }

  private constructor(fs: FileSystem) {
    this.paths = new Resolver(fs)
  }

  /**
   * Opens an install and walks its load list.
   *
   * @param fs Read access to the install tree — the directory holding `EXE` and `DATA`.
   * @param options Where the config is and whether to read the resource DLLs.
   */
  static async open(fs: FileSystem, options: OpenOptions = {}): Promise<Game> {
    const { config = 'EXE/freelancer.ini', strings = true, language, hardcoded = false } = options

    const game = new Game(fs)

    game.config = readIni(await game.paths.read(config))
    game.settings = readSettings(game.config, config)

    if (strings) await game.#readLibraries(config, language)

    for (const entry of readEntries(game.config)) await game.#load(entry)

    // After `[Data]`, because the code opens these when it needs them and a later definition wins.
    if (hardcoded)
      for (const { path, key } of HARDCODED_FILES) await game.#load({ key, path }, true)

    return game
  }

  /** Reads a data-relative path as an INI document, whatever encoding it is in. */
  async document(path: string): Promise<Document> {
    return readIni(await this.paths.read(join(this.settings.data, path)))
  }

  /**
   * Reads a data-relative path as a UTF file and merges it into {@link Game.assets}.
   *
   * Skips a file already read, which is what makes this safe to call once per reference.
   *
   * @param path Path relative to the data directory, as authored.
   * @returns Whether the file was read this time.
   */
  async load(path: string): Promise<boolean> {
    const resolved = await this.paths.resolve(join(this.settings.data, path))

    if (resolved === undefined) throw new RangeError(`Asset '${path}' does not resolve`)
    if (this.assets.loaded.has(resolved)) return false

    this.assets.loaded.add(resolved)
    this.assets.add(Directory.read(await this.paths.read(resolved)))

    return true
  }

  async #readLibraries(config: string, language?: number): Promise<void> {
    const images = await Promise.all(
      readLibraries(this.config, config).map(async (path) =>
        readResources(await this.paths.read(path)),
      ),
    )

    const { names, infocards } = readLibrary(images, language)

    for (const [id, value] of names) this.library.names.set(id, value)
    for (const [id, value] of infocards) this.library.infocards.set(id, value)
  }

  async #load(entry: DataEntry, hardcoded = false): Promise<void> {
    const loaded: LoadedEntry = { ...entry, ...(hardcoded && { hardcoded: true as const }) }
    this.entries.push(loaded)

    // `bases` is the only one in retail: a marker for where base loading falls in the order.
    if (isMarker(entry)) return

    const key = fold(entry.key)
    const path = entry.path as string

    // `fonts_dir = fonts\files\` names a directory for in-process font loading, not a file.
    if (key === 'fonts_dir') {
      loaded.resolved = await this.paths.resolve(join(this.settings.data, path))
      if (loaded.resolved === undefined) loaded.error = 'directory does not resolve'
      return
    }

    let document: Document

    try {
      loaded.resolved = await this.paths.resolve(join(this.settings.data, path))
      document = await this.document(path)
    } catch (error) {
      loaded.error = error instanceof Error ? error.message : String(error)
      return
    }

    const documents = this.documents.get(key)
    documents ? documents.push(document) : this.documents.set(key, [document])

    this.#interpret(key, document)
  }

  /**
   * Routes a document to the module that understands it.
   *
   * The stub the remaining domain modules land in, one at a time. Every key is listed rather than
   * left to the default, so adding `./universe` is a matter of filling an arm that already names
   * itself — and so the twelve unwritten modules are visible here rather than implied.
   */
  #interpret(key: string, document: Document): void {
    switch (key) {
      // ./fx — implemented.
      case 'effects':
        this.effects.effects.push(...readEffects(document))
        this.effects.visuals.push(...readVisEffects(document))
        this.effects.types.push(...readEffectTypes(document))
        this.effects.lods.push(...readEffectLODs(document))
        this.effects.beams.push(...readBeams(document))
        break

      case 'effect_shapes':
        this.effects.shapes.push(...readTextureLibraries(document))
        break

      case 'fuses':
        this.effects.fuses.push(...readFuses(document))
        break

      // ./ai — implemented. `pilots` is a hardcoded key, not a `[Data]` one, so this arm is dead
      // unless `hardcoded` was on. `missions` reaches here for `[MetaBehavior]`, which lives in
      // three story mission files rather than with the pilots.
      case 'pilots':
      case 'missions':
        this.ai.pilots.push(...readPilots(document))
        this.ai.blocks.push(...readBlocks(document))
        break

      // `newchardb`'s `[Pilot]` is a different section sharing the name — see ./ai's isBehaviour.
      case 'newchardb':
        this.ai.pilots.push(...readPilots(document))
        break

      // TODO: ./solar
      case 'solar':
      case 'asteroids':
      case 'stars':
        break

      // TODO: ./universe
      case 'universe':
      case 'groups':
        break

      // TODO: ./equipment
      case 'equipment':
      case 'goods':
      case 'markets':
      case 'explosions':
      case 'debris':
        break

      // TODO: ./ships
      case 'ships':
      case 'loadouts':
        break

      // TODO: ./audio
      case 'sounds':
      case 'voices':
        break

      // TODO: ./characters — `newchardb` is above, since ./ai reads its `[Pilot]`
      case 'bodyparts':
      case 'costumes':
        break

      // TODO: ./interface
      case 'fonts':
      case 'rich_fonts':
      case 'hud':
      case 'intro':
      case 'igraph':
      case 'petaldb':
        break

      // TODO: ./fx, the remaining keys
      case 'gate_tunnels':
      case 'jump_effect':
        break

      // TODO: ./constants
      case 'constants':
      case 'concave':
        break

      // TODO: ./missions
      case 'rtcslider':
        break

      // TODO: ./equipment
      case 'weaponmoddb':
        break

      // A key this library has never heard of. Its document is already in `documents`.
      default:
        break
    }
  }
}
