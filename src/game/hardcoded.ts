/**
 * INI files the game loads that `freelancer.ini` never mentions.
 *
 * `[Data]` is not the whole load list. The mission scripts, the faction and NPC tables, the random
 * mission generator's data, the interface layout and the pathfinding tables are all opened by name
 * from code, so a tool that walks `[Data]` alone reads about half the data and reports the rest as
 * unreferenced.
 *
 * **Measured, not recalled.** Every path here came out of a string sweep over `EXE/*.exe`,
 * `EXE/*.dll` and `DLLS/BIN/content.dll` — both ASCII and UTF-16 — filtered to things shaped like an
 * INI path and then checked against the retail tree. The sweep finds 79 distinct strings. **58
 * resolve and are absent from `[Data]`**; they are the table below. Six more are named by a binary
 * and resolve to nothing, and are recorded in {@link UNRESOLVED_FILES} so the next sweep does not go
 * looking for them again. The rest are either `[Data]` entries the code also names literally, or the
 * exclusions below.
 *
 * The paths are spelled the way the binaries spell them, which is neither the tree's case nor
 * consistent between binaries — `Missions\M01a\m01a.ini` and `missions\m01a\rtc_success.ini` sit in
 * the same string table. That is the point: they go through the resolver like every other authored
 * path.
 *
 * Three kinds of string are deliberately left out. `common.dll`'s `bodyparts.ini` and `costumes.ini`
 * are bare basenames whose real paths come from `[Data] bodyparts` / `costumes`. `flserver.exe`'s
 * `freelancer.ini` / `DACOMsrv.ini` and `dalib.dll`'s `DACOM.INI` live in `EXE`, not under the data
 * directory, so they are not data at all. And five strings carry a literal `../data/` prefix
 * (`../Data/interface/keylist.ini`, the three `Universe\shortest_*` tables) — the same files as the
 * unprefixed entries below, spelled from a different working directory.
 */

/** Which binary names a path. Recorded because the sweep is repeatable and the source is evidence. */
export type Origin = 'content.dll' | 'Freelancer.exe' | 'common.dll'

/** An INI the game opens by a name compiled into it. */
export interface HardcodedFile {
  /** Path relative to the data directory, spelled as the binary spells it. */
  path: string

  /** Binary the string was found in. */
  origin: Origin

  /**
   * The `[Data]`-style key this file would have carried, had it been listed.
   *
   * Assigned from what the file contains, so the manager can route these through the same reader
   * switch as `[Data]` rather than needing a second one.
   */
  key: string
}

/**
 * The 58 that resolve, grouped by what they are.
 *
 * Order is the sweep's, not a load order — nothing here is known to be order-sensitive the way
 * `[Data]` is, because the code opens each when it needs it.
 */
export const HARDCODED_FILES: readonly HardcodedFile[] = [
  // The thirteen story missions. `content.dll` opens `Missions\MNN\mNN.ini` by number.
  { path: 'Missions\\M01a\\m01a.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M01b\\m01b.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M02\\m02.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M03\\m03.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M04\\m04.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M05\\m05.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M06\\m06.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M07\\m07.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M08\\m08.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M09\\m09.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M10\\m10.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M11\\m11.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M12\\m12.ini', origin: 'content.dll', key: 'missions' },
  { path: 'Missions\\M13\\m13.ini', origin: 'content.dll', key: 'missions' },
  { path: 'missions\\m01a\\M001a_s006x_Li01_02_nrml.ini', origin: 'content.dll', key: 'missions' },

  // The tables missions and base population read from.
  { path: 'missions\\mBases.ini', origin: 'content.dll', key: 'mbases' },
  { path: 'missions\\news.ini', origin: 'content.dll', key: 'news' },
  { path: 'missions\\npcships.ini', origin: 'content.dll', key: 'npcships' },
  { path: 'missions\\npcships_test.ini', origin: 'content.dll', key: 'npcships' },
  { path: 'missions\\specific_npc.ini', origin: 'content.dll', key: 'npcs' },
  { path: 'missions\\faction_prop.ini', origin: 'content.dll', key: 'factions' },
  { path: 'missions\\empathy.ini', origin: 'content.dll', key: 'factions' },
  { path: 'missions\\formations.ini', origin: 'content.dll', key: 'formations' },
  { path: 'missions\\lootprops.ini', origin: 'content.dll', key: 'loot' },
  { path: 'missions\\shipclasses.ini', origin: 'content.dll', key: 'shipclasses' },
  { path: 'missions\\PTough.ini', origin: 'content.dll', key: 'toughness' },
  { path: 'missions\\RankDiff.ini', origin: 'content.dll', key: 'toughness' },
  { path: 'missions\\voice_properties.ini', origin: 'content.dll', key: 'voice_properties' },

  // Pilots and the behaviour blocks — the `./ai` module's whole input.
  { path: 'missions\\pilots_population.ini', origin: 'content.dll', key: 'pilots' },
  { path: 'missions\\pilots_story.ini', origin: 'content.dll', key: 'pilots' },

  // The random mission generator.
  { path: 'RandomMissions\\VignetteParams.ini', origin: 'content.dll', key: 'randommissions' },
  {
    path: 'RandomMissions\\VignetteCriticalLoot.ini',
    origin: 'content.dll',
    key: 'randommissions',
  },
  { path: 'RandomMissions\\RMLootInfo.ini', origin: 'content.dll', key: 'randommissions' },
  { path: 'RandomMissions\\KillableSolars.ini', origin: 'content.dll', key: 'randommissions' },
  { path: 'RandomMissions\\SolarFormations.ini', origin: 'content.dll', key: 'randommissions' },
  { path: 'RandomMissions\\NpcRankToDiff.ini', origin: 'content.dll', key: 'randommissions' },
  { path: 'RandomMissions\\Diff2Money.ini', origin: 'content.dll', key: 'randommissions' },

  // Generic character scripts. `[Data] rtcslider` names the third file in this directory.
  { path: 'scripts\\gcs\\genericScripts.ini', origin: 'content.dll', key: 'scripts' },
  { path: 'scripts\\GCS\\GCSExcl.ini', origin: 'content.dll', key: 'scripts' },

  // Precomputed pathfinding over the system graph, and the per-faction commodity table.
  { path: 'Universe\\systems_shortest_path.ini', origin: 'content.dll', key: 'shortest_path' },
  { path: 'Universe\\shortest_legal_path.ini', origin: 'content.dll', key: 'shortest_path' },
  { path: 'Universe\\shortest_illegal_path.ini', origin: 'content.dll', key: 'shortest_path' },
  { path: 'equipment\\commodities_per_faction.ini', origin: 'content.dll', key: 'markets' },

  // Solars the mission system creates, which is why universe.ini does not list them.
  { path: 'Universe\\MissionCreatedSolars.ini', origin: 'Freelancer.exe', key: 'universe' },

  // The root singletons and the light animation table.
  { path: 'cameras.ini', origin: 'Freelancer.exe', key: 'cameras' },
  { path: 'mouse.ini', origin: 'Freelancer.exe', key: 'mouse' },
  { path: 'audio\\SoundCFG.ini', origin: 'Freelancer.exe', key: 'soundcfg' },
  { path: 'fx\\lightanim.ini', origin: 'Freelancer.exe', key: 'lightanim' },

  // The interface, none of which `[Data]` lists beyond `HUD` and `intro`.
  { path: 'interface\\keylist.ini', origin: 'Freelancer.exe', key: 'keylist' },
  { path: 'interface\\optlist.ini', origin: 'Freelancer.exe', key: 'optlist' },
  { path: 'interface\\Rollover.ini', origin: 'Freelancer.exe', key: 'rollover' },
  { path: 'interface\\InfocardMap.ini', origin: 'Freelancer.exe', key: 'infocardmap' },
  { path: 'interface\\KnowledgeMap.ini', origin: 'Freelancer.exe', key: 'knowledgemap' },
  { path: 'interface\\ButtonMontage.ini', origin: 'Freelancer.exe', key: 'montage' },
  { path: 'Interface\\ButtonTextures.ini', origin: 'Freelancer.exe', key: 'textures' },
  { path: 'Interface\\UI\\UITextures.ini', origin: 'Freelancer.exe', key: 'textures' },
  { path: 'interface\\baseside\\navbar.ini', origin: 'Freelancer.exe', key: 'navbar' },
  {
    path: 'Interface\\NeuroNet\\NavMap\\NewNavMap\\NavMapTextures.ini',
    origin: 'Freelancer.exe',
    key: 'textures',
  },
]

/**
 * Names found in the binaries that resolve to nothing in retail.
 *
 * Recorded so a later sweep does not chase them, and asserted by the corpus suite so that a tree
 * which *does* hold one is noticed. The first four are dead — a feature that shipped without its
 * data, or a default the code never reaches; `MISSIONS/M01A` holds `m01a.ini` and five
 * `m001a_*` scene files, and no `rtc_success.ini`. The last two are user-directory paths rather than
 * data: both are written into the player's save folder.
 */
export const UNRESOLVED_FILES: readonly { path: string; origin: Origin; reason: string }[] = [
  {
    path: 'missions\\m01a\\rtc_success.ini',
    origin: 'content.dll',
    reason: 'no such file in retail',
  },
  { path: 'cockpits\\cockpit.ini', origin: 'Freelancer.exe', reason: 'no such file in retail' },
  { path: 'effects.ini', origin: 'Freelancer.exe', reason: 'no such file at the data root' },
  { path: 'state_graph.ini', origin: 'common.dll', reason: 'no such file in retail' },
  { path: 'PerfOptions.ini', origin: 'Freelancer.exe', reason: 'written to the save folder' },
  { path: 'UserKeyMap.ini', origin: 'Freelancer.exe', reason: 'written to the save folder' },
]
