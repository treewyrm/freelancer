# Module decomposition

Retail `DATA` holds **256 distinct section names across 70,250 sections**. This document assigns
every one to a proposed module, so the typed layer is built domain by domain against a known target
rather than file by file against whatever turns up.

Modules are proposed, not fixed — except `./fx`, which is **built** ([FX.md](FX.md)). Counts are
section occurrences across the retail sweep; the directory column is where they predominantly live.
Sections marked **shared** appear in more than one domain's files and are the reason the boundaries
below are not simply directory names.

Two things the counts here do not capture, both found while building `./fx`, and both worth expecting
in the other twelve:

- **A count is what is on disk, not what the game loads.** `FX/fuse_li_battleship.ini` is present and
  absent from `[Data] fuses`, so 209 fuse scripts on disk are 192 in the running game. Walk the load
  list, not the tree — see [GAME.md](GAME.md).
- **A flat count can hide the structure.** The twelve `start_effect` / `destroy_*` / `damage_*` rows
  under `./fx` below are not twelve independent section kinds; they are the **members of 209 `[fuse]`
  scripts**, owned by position. The table counted sections correctly and said nothing about that.

## Proposed entry points

The **wiki** column is how many of the module's `(section, property)` pairs the community
documentation reaches, measured in [DICTIONARY.md](DICTIONARY.md). It is the honest estimate of how
expensive a module will be, and it is not proportional to size: `./interface` is 42 sections at 13%.

| Entry point        | Sections | Occurrences | Pairs | Wiki      | Depends on                 |
| ------------------ | -------- | ----------- | ----- | --------- | -------------------------- |
| `./audio`          | 5        | 26,110      | 46    | 41%       | —                          |
| `./universe`       | 21       | 12,881      | 162   | 72%       | —                          |
| `./missions`       | 36       | 11,325      | 340   | 85%       | universe, ships, equipment |
| `./base`           | 10       | 6,329       | 36    | 44%       | universe                   |
| `./fx` **built**   | 25       | 4,283       | 167   | 89%       | —                          |
| `./equipment`      | 33       | 3,754       | 416   | 47%       | —                          |
| `./solar`          | 29       | 1,766       | 234   | 55%       | —                          |
| `./ships`          | 11       | 1,741       | 92    | 89%       | equipment                  |
| `./ai` **built**   | 18       | 610         | 187   | **92%**   | —                          |
| `./randommissions` | 10       | 584         | 44    | **0%**    | missions                   |
| `./characters`     | 12       | 488         | 32    | 84%       | —                          |
| `./interface`      | 42       | 352         | 303   | **13%**   | —                          |
| `./constants`      | 5        | 27          | 21    | **100%**  | —                          |

**Two corrections to this table, both found by making the partition total.** Neither changes a count
anywhere else, and both are recorded in [DICTIONARY.md](DICTIONARY.md#two-corrections-to-modulesmd):

- The partition covered 256 names and **the sweep finds 257**. `[locked_gates]` (`initialworld.ini`,
  27 `locked_gate` values) had no home and goes to `./universe`. `[Group]` was counted at 3 and given
  to `./interface`, but 55 of its 58 are the faction groups in `initialworld.ini` — the `groups`
  `[Data]` key — so it goes to `./universe` too, which is why that row moved from 23 sections to 21
  and `./interface` from 43 to 42.
- **`[Pilot]` is not wholly `./ai`.** 319 of the 320 are the AI pilots; the one in
  `CHARACTERS/newcharacter.ini` is the new-character record and is `./characters`' shape.
- `./solar` gains four rows over the original 25 by listing the shared sections it owns explicitly.

Every one of the **257** section names is now assigned exactly once, over **2,080 distinct
`(section, property)` pairs**.

`./audio` dwarfs everything by occurrence (25,814 `[Sound]` entries, almost all voice lines) and is
the cheapest module to build — five section shapes. `./universe` and `./missions` carry the most
distinct structure. **Build order recommendation: audio, then universe + base, then equipment +
ships, then solar, interface, characters, constants, and missions + randommissions last** — missions
references nearly everything else, so its schemas are worth the most once the others exist to
reference.

`./fx` and `./ai` are done, and `./ai` went early rather than in its place in that order because it
was the cheapest way to test the typed layer: 18 sections, one repeated shape, no cross-file
resolution, and the best wiki coverage in the data. It settled the last two of SCHEMA.md's open
design questions — see [AI.md](AI.md#what-building-it-settled).

---

## `./universe` — systems, zones, and what is in them

`UNIVERSE/universe.ini` is the practical root of the whole data set: it lists every `[Base]` and
`[System]` with the file that defines it.

| Section                                            | Count   | Notes                                                   |
| -------------------------------------------------- | ------- | ------------------------------------------------------- |
| `Zone`                                             | 5,769   | the single most structurally varied section in the data |
| `Object`                                           | 3,578   | a placed solar; references a `[Solar]` archetype        |
| `EncounterParameters`                              | 1,163   | 1,163 `filename` references out to encounter scripts    |
| `FlashlightSet`                                    | 852     |                                                         |
| `LightSource`                                      | 140     |                                                         |
| `SystemConnections`                                | 131     | `path` repeats 5,375 times                              |
| `Asteroids`                                        | 210     | a `file` reference into `SOLAR`                         |
| `Field`                                            | 154     | shared with solar                                       |
| `TexturePanels`                                    | 241     | shared with solar                                       |
| `AsteroidBillboards`                               | 99      | shared with solar                                       |
| `Shape`                                            | 82      | shared with solar                                       |
| `Nebula`                                           | 60      | a `file` reference                                      |
| `Music`, `Dust`, `Ambient`, `Background`, `Spiels` | 54 each | per-system atmosphere                                   |
| `SystemInfo`                                       | 54      |                                                         |
| `System`                                           | 53      | in `universe.ini`; the per-system file is the payload   |
| `Archetype`                                        | 18      |                                                         |
| `MissionCreatedSolar`                              | 9       |                                                         |
| `FlashlightLine`                                   | 5       |                                                         |
| `Group`                                            | 58      | 55 in `initialworld.ini`; the 3 in `keylist.ini` are a different section sharing the name |
| `Time`                                             | 1       | singleton                                               |
| `locked_gates`                                     | 1       | `initialworld.ini`; 27 gate ids, stored pre-hashed      |

## `./base` — base interiors

Split from universe because a base's exterior placement and its interior rooms are different data
in different files, joined only by `[Base] file`.

| Section                | Count |
| ---------------------- | ----- |
| `Hotspot`              | 3,581 |
| `Room`                 | 464   |
| `Room_Info`            | 446   |
| `Camera`               | 443   |
| `Room_Sound`           | 439   |
| `CharacterPlacement`   | 265   |
| `PlayerShipPlacement`  | 208   |
| `BaseInfo`             | 200   |
| `Base`                 | 197   |
| `ForSaleShipPlacement` | 86    |

## `./solar` — solar archetypes, fields, and skies

| Section            | Count | Section               | Count |
| ------------------ | ----- | --------------------- | ----- |
| `Solar`            | 321   | `Clouds`              | 66    |
| `Properties`       | 202   | `Fog`                 | 61    |
| `Exclusion Zones`  | 169   | `NebulaLight`         | 60    |
| `Cube`             | 153   | `BackgroundLightning` | 54    |
| `DynamicAsteroids` | 145   | `Texture`             | 51    |
| `Asteroid`         | 86    | `Star_Glow`           | 46    |
| `LootableZone`     | 80    | `Star`                | 38    |
| `Band`             | 74    | `DynamicAsteroid`     | 26    |
| `Exterior`         | 70    | `DynamicLightning`    | 20    |

plus `Spines` 16, `AsteroidMine` 9, `Lens_Flare` 7, `Lens_Glow` 5, `ExclusionBand` 3,
`FadeChunks` 2, `CloseChunks` 2.

`[Solar]` is the archetype `[Object]` in a system file points at, which makes universe → solar the
most-travelled reference edge in the data.

## `./equipment` — everything mountable, and the market

| Section           | Count | Section       | Count |
| ----------------- | ----- | ------------- | ----- |
| `Good`            | 855   | `Light`       | 74    |
| `Munition`        | 513   | `Engine`      | 60    |
| `Gun`             | 513   | `AttachedFX`  | 52    |
| `BaseGood`        | 413   | `FactionGood` | 48    |
| `LOD`             | 388   | `InternalFX`  | 37    |
| `Power`           | 164   | `Shield`      | 36    |
| `Explosion`       | 156   | `LootCrate`   | 29    |
| `ShieldGenerator` | 126   | `Armor`       | 24    |
| `Commodity`       | 105   | `WeaponType`  | 21    |
| `Motor`           | 76    | `CargoPod`    | 15    |

plus `Mine` 10, `MineDropper` 10, `CloakingDevice` 9, `Thruster` 6, `CounterMeasure` 3,
`CounterMeasureDropper` 3, `Scanner` 2, `TradeLane` 1, `Tractor` 1, `RepairKit` 1, `ShieldBattery` 1,
and the `EngineEquipConsts` / `ShieldEquipConsts` singletons (which could equally sit in
`./constants`).

`[Good]`, `[BaseGood]` and `[FactionGood]` are the economy and are worth treating as their own
sub-area: `basegood.marketgood` alone repeats 14,694 times and has four value shapes.

## `./ships`

| Section          | Count | Notes                                                                    |
| ---------------- | ----- | ------------------------------------------------------------------------ |
| `CollisionGroup` | 484   | **shared** with solar; carries the zero-value `separable` flag 456 times |
| `Loadout`        | 803   | **shared** with solar; `equip` repeats 16,074 times                      |
| `Simple`         | 235   | **shared** with FX                                                       |
| `Ship`           | 115   |                                                                          |
| `Cockpit`        | 33    |                                                                          |
| `CockpitCamera`  | 34    |                                                                          |
| `TurretCamera`   | 33    |                                                                          |
| `RearViewCamera` | 1     |                                                                          |

`WinCamera`, `ChaseCamera` and `DeathCamera` are singletons in the root `cameras.ini` and go here
rather than in `./constants`, since they are the same shape as the cockpit cameras.

## `./missions`

The largest module by distinct sections. Story missions, the NPC and faction tables, and the base
population data that missions drive.

| Section       | Count | Section              | Count                               |
| ------------- | ----- | -------------------- | ----------------------------------- |
| `Trigger`     | 2,984 | `MVendor`            | 194                                 |
| `GF_NPC`      | 1,642 | `MsnFormation`       | 188                                 |
| `MsnShip`     | 1,010 | `MsnSolar`           | 116                                 |
| `ObjList`     | 672   | `Formation`          | 93                                  |
| `NPCShipArch` | 660   | `MVoiceProp`         | 93 — **shared**, owned by `./audio` |
| `BaseFaction` | 609   | `Char`               | 84                                  |
| `NPC`         | 443   | `ShipClass`          | 78                                  |
| `MLootProps`  | 434   | `CharacterEncounter` | 68                                  |
| `MRoom`       | 412   | `EncounterFormation` | 57                                  |
| `NewsItem`    | 403   | `FactionProps`       | 55                                  |
| `NNObjective` | 395   | `RepChangeEffects`   | 55                                  |
| `Dialog`      | 231   | `Creation`           | 42                                  |
| `MBase`       | 194   | `MshipProps`         | 28                                  |

plus `Reserve` 22, `Mission` 14, `MsnRandEnc` 7, `MsnLoot` 4, `PhantomLoot` 124,
`PlayerToughnessScale` 1, `RankDiffDB` 1, `Constants` (missions copy) 1, and the `SCRIPTS` trio
`RTCSlider`, `GenericScripts`, `GCS_Exclusions`.

`[Trigger]` is where the mission scripting lives — `act_*` and `cnd_*` properties whose _values_
encode a command and its arguments. Those are effectively a second grammar inside the value list and
are the hardest thing in this repository to type well; expect them to start as raw value lists.

## `./ai` — built, see [AI.md](AI.md)

`MISSIONS/pilots_population.ini` and `pilots_story.ini`. One `[Pilot]` names a set of blocks by
nickname.

`Pilot` 320, `GunBlock` 99, `JobBlock` 59, `EvadeDodgeBlock` 30, `MissileBlock` 20,
`BuzzHeadTowardBlock` 17, `FormationBlock` 10, `EvadeBreakBlock` 8, `BuzzPassByBlock` 6,
`RepairBlock` 6, `CountermeasureBlock` 6, `MetaBehavior` 6, `StrafeBlock` 5,
`DamageReactionBlock` 5, `TrailBlock` 4, `EngineKillBlock` 3, `MineBlock` 3,
`MissileReactionBlock` 3.

The 17 `*Block` sections share a family resemblance, which is what made this the module to prove the
schema machinery on: many small sections, one repeated shape, and no cross-file resolution to worry
about. It worked — the coercion helpers moved to `./schema` and the last two of
[SCHEMA.md](SCHEMA.md)'s open design questions closed.

Three things the count above hides:

- **`Pilot` 320 is 319 plus one.** `CHARACTERS/newcharacter.ini` carries a `[Pilot]` sharing only
  `nickname` with the other 319; it belongs to `./characters` and is read here anyway, because a
  section does not say which file it came from.
- **`inherit` is on 290 of the 319**, so most pilots carry a name and a parent and nothing else.
- **These files are not in `[Data]`.** `content.dll` opens them by name, so reaching them through
  `./game` needs `hardcoded: true` — see [GAME.md](GAME.md).

## `./randommissions`

`RMBonusLoot` 143, `DataNode` 140, `KillableSolar` 126, `DecisionNode` 79, `Critical_Loot` 62,
`DocumentationNode` 20, `SolarFormation` 11, and the three singletons `Global`, `Diff2Money`,
`RankAndFormationSizeToDifficulty`.

`[DataNode]` and `[DecisionNode]` form a graph — the random-mission generator's decision tree — so
this module is a resolver over a node table more than a set of independent records.

## `./fx` — built, see [FX.md](FX.md)

| Section                 | Count | Section               | Count |
| ----------------------- | ----- | --------------------- | ----- |
| `start_effect`          | 1,353 | `BeamSpear`           | 51    |
| `VisEffect`             | 1,218 | `EffectType`          | 45    |
| `Effect`                | 705   | `Debris`              | 41    |
| `destroy_group`         | 291   | `destroy_root`        | 37    |
| `destroy_hp_attachment` | 163   | `LightAnim`           | 26    |
| `Fuse`                  | 209   | `Impulse`             | 16    |
| `ignite_fuse`           | 74    | `start_cam_particles` | 13    |

plus `Layer` 8, `damage_root` 7, `EffectLOD` 6, `JumpGateEffect` 5, `Gate_Tunnel` 4, `BeamBolt` 4,
`damage_group` 3, `JumpShipEffect` 1, `make_invincible` 1, `dump_cargo` 1, `tumble` 1.

`[Effect]` and `[VisEffect]` are the join to the asset side: a `VisEffect` names an `.ale` file and an
effect inside it, which is where an INI reference becomes an Alchemy effect. **The `effect_crc` that
picks it is the case-sensitive hash** — see [FX.md](FX.md).

`[Fuse]` and the `destroy_*` / `damage_*` families are the death-sequence scripting, and the ordering
is stronger than "section order matters": **`[fuse]` opens a run and the sections after it belong to
that script until the next `[fuse]`**, so the twelve action rows above are members of 209 scripts
rather than independent sections. Spelled `fuse` lowercase in all 209 occurrences, and identified by
`name` rather than `nickname`.

## `./audio`

`Sound` 25,814, `Voice` 199, `MVoiceProp` 93 (**shared** with missions), `Reverb` 3, `Cfg` 1.

`[Sound]` has two shapes — 1,817 carry a `nickname`, 23,997 do not — split by file: sound
definitions vs voice banks. The voice-bank entries are the ones whose names hash to the UTF files in
`DATA/AUDIO`, so this module pairs directly with
[AUDIO.md](AUDIO.md).

## `./interface`

43 sections but only 352 occurrences — mostly singletons describing the HUD, plus the keymap.

`KeyCmd` 146, `Key` 92, `KeyMap` 5, `Montage` 4, `Group` 3, `KnowledgeMapTable` 2, and one each of
`Hud`, `Interface`, `Audio`, `Video`, `Images`, `RolloverTable`, `InfocardMapTable`, `Receiver`,
`Waypoint`, `Status`, `Target`, `Core`, `ContactList`, `Maneuvers`, `Steer`, `TargetableObjects`,
`DamageIndicator`, `CruiseProgress`, `BaseFrame`, `NavBar`, `RoomControl1..7`, `ButtonControl1..5`.

`TrueType` 22 and `Style` 15 (`FONTS/`) and `IGraph` 11 and `Cursor` 19 (root files) belong here too.
Note `keymap=1.1` — a section name containing `=`, which is why section headers stay opaque strings.

## `./characters`

`Costume` 154, `Accessory` 106, `Head` 104, `Body` 88, `DetailSwitchTable` 7, `PetalAnimations` 7,
`Skeleton` 7, `RightHand` 6, `LeftHand` 6, `Animations` 1, `Package` 1, `Faction` 1.

Pairs with [DEFORMABLE.md](DEFORMABLE.md): a `[Body]` names the `.dfm`
and a `[Skeleton]` names the `.anm` that drives it.

## `./constants` — the root singletons

The root-level `constants.ini` and `concave.ini`, plus the scattered constant blocks:
`ConcaveObject` 23, `ObjectTable` 1, `PhySysConsts` 1, `CommConsts` 1, `AsteroidConsts` 1 — five
sections and 27 occurrences, the smallest module by a wide margin.

Three near neighbours are assigned elsewhere on shape rather than location: `EngineEquipConsts` and
`ShieldEquipConsts` go to `./equipment`, `Constants` (×2, in `MISSIONS`) to `./missions`, and
`Cursor` (`mouse.ini`) and `IGraph` (`igraph.ini`) to `./interface`.

Small and unglamorous, but it is where a reader first meets `EXE/`-style plain text and the
`[MaterialMap]` table [MATERIAL.md](MATERIAL.md) already documents.

---

## Sections that resist assignment

Four appear across domains and are the argument for shared modules rather than directory-shaped ones:

| Section                                                 | Appears in          | Resolution                                                            |
| ------------------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| `Loadout`                                               | `SHIPS`, `SOLAR`    | one shape; owned by `./ships`, imported by solar                      |
| `CollisionGroup`                                        | `SHIPS`, `SOLAR`    | same                                                                  |
| `Simple`                                                | `SHIPS`, `FX`       | same                                                                  |
| `MVoiceProp`                                            | `MISSIONS`, `AUDIO` | owned by `./audio`                                                    |
| `Explosion`                                             | `EQUIPMENT`, `FX`   | owned by `./equipment`; also the one section spelled two ways ×86/×70 |
| `Field`, `TexturePanels`, `AsteroidBillboards`, `Shape` | `SOLAR`, `UNIVERSE` | owned by `./solar`                                                    |

This is the same situation as `compound/` — a structure shared byte-for-byte by two
domains gets its own home and neither domain owns it.

---

[INI.md](INI.md) · [SCHEMA.md](SCHEMA.md) · [RETAIL.md](RETAIL.md) · [THN.md](THN.md)
