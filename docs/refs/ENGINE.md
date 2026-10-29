# ENGINE — the vocabularies the executables hardcode

[INI.md](../modules/INI.md) describes both encodings and the document they share, and stops there — to this
library `[Solar]` is a section name and `type` a property name. This document records what the engine
does with them. There is no module here and none is planned: deciding what a `[Ship]`'s `type` means
is the policy [the scope rule](ARCHITECTURE.md#invariants) assigns to the consumer.

## Where these live

Freelancer resolves an INI keyword to a number in one of two ways, and only one leaves a table:

- **`EXE/common.dll` uses `{ const char *name; int value }` tables.** Contiguous, 8 bytes an entry, in
  `.data`. Every enum below with numbers comes from one, read directly.
- **`DLLS/BIN/content.dll` uses `strcmp` chains.** No table survives compilation. The vocabulary is
  recoverable — MSVC emits a function's string literals in reverse order of first use, so a run of
  value names sits immediately before the key that consumes them — but the values are not.

A name list from `content.dll` is not evidence of a value, and none is guessed below. This does not
apply to the *keys*, which are recovered from call sites in every binary — see
[Property names](#property-names).

File offsets are also RVAs in both DLLs. Image bases are `0x06260000` for `common.dll` and
`0x06f90000` for `content.dll`.

## Object types

`common.dll` `.data:18b810`, 29 entries.

One bitfield shared by `[Solar] type`, `[Ship] type` and the targeting and nav-map filters. The
warning string beside it names the field — `*** WARNING: unknown OBJECT_TYPE = '%s'`, from
`E:\FL\Scratch\Source\Common\Archetype.cpp`.

| Bit      | Name                | Bit          | Name        |
| -------- | ------------------- | ------------ | ----------- |
| —        | `NONE` = 0          | `0x10000`    | `FIGHTER`   |
| `0x1`    | `MOON`              | `0x20000`    | `FREIGHTER` |
| `0x2`    | `PLANET`            | `0x40000`    | `GUNBOAT`   |
| `0x4`    | `SUN`               | `0x80000`    | `CRUISER`   |
| `0x8`    | `BLACKHOLE`         | `0x100000`   | `TRANSPORT` |
| `0x10`   | `SATELLITE`         | `0x200000`   | `CAPITAL`   |
| `0x20`   | `DOCKING_RING`      | `0x400000`   | `MINING`    |
| `0x40`   | `JUMP_GATE`         | `0x1000000`  | `GUIDED`    |
| `0x80`   | `TRADELANE_RING`    | `0x2000000`  | `BULLET`    |
| `0x100`  | `STATION`           | `0x4000000`  | `MINE`      |
| `0x200`  | `WAYPOINT`          | `0x10000000` | `LOOT`      |
| `0x400`  | `AIRLOCK_GATE`      | `0x20000000` | `ASTEROID`  |
| `0x800`  | `JUMP_HOLE`         |              |             |
| `0x1000` | `WEAPONS_PLATFORM`  |              |             |
| `0x2000` | `DESTROYABLE_DEPOT` |              |             |
| `0x4000` | `NON_TARGETABLE`    |              |             |
| `0x8000` | `MISSION_SATELLITE` |              |             |

`0x800000` and `0x8000000` are unclaimed. Twenty-eight bits are named out of a possible thirty.

Table order is declaration order, not value order — `ASTEROID` is the fifth entry and holds bit 29.
Nothing here may be derived from position.

`MOON`, `BLACKHOLE`, `ASTEROID`, `GUIDED`, `BULLET`, `MINE` and `LOOT` are named and never set by any
retail archetype — they classify objects the engine creates rather than ones the data declares.

**The nav map's mask is `0x2020bdff`** (`Freelancer.exe` `0x48e321`): every solar bit but `WAYPOINT`
and `NON_TARGETABLE`, with `CAPITAL` and `ASTEROID`, so no other ship type gets an icon. A type of
exactly `ASTEROID` is refused anyway (`0x4919c9`), and a `TRADELANE_RING` with both a `prev_ring` and
a `next_ring` loses its type, so only a lane's two ends show. Only `PLANET` and `MOON` icons are
turned, by their bearing from the system's origin (`0x4919e9`).

## The three tables next to it

`0x18b810`–`0x18bc38` is one uninterrupted run of 133 entries: five separate enums, adjacent by link
order rather than meaning, and numerically overlapping — `weapon` and `TRADELANE_RING` are both
`0x80`. They are different fields; nothing may be resolved across them.

**Equipment class** (`0x18b8f8`, 14 flags): `light` `0x1`, `attached_fx` `0x2`, `weapon` `0x80`,
`shield` `0x100`, `thruster` `0x400`, `cloaking_device` `0x1000`, `engine` `0x20000`, `power`
`0x40000`, `scanner` `0x80000`, `tractor` `0x100000`, `repairdroid` `0x200000`, `internal_fx`
`0x400000`, `tradelane` `0x800000`, `armor` `0x1000000`.

**`[CollisionGroup] type`** (`0x18b968`, 19 flags, bits 1 through 19): `Fin` `0x2`, `Top_Fin` `0x4`,
`Port_Fin` `0x8`, `Starboard_Fin` `0x10`, `Port_Wing` `0x20`, `Starboard_Wing` `0x40`, `Middle_Wing`
`0x80`, `Engine` `0x100`, `Port_Engine` `0x200`, `Middle_Engine` `0x400`, `Starboard_Engine` `0x800`,
`Top_Engine` `0x1000`, `Bottom_Engine` `0x2000`, `Spoiler` `0x4000`, `Tail` `0x8000`,
`Port_Side_Panel` `0x10000`, `Starboard_Side_Panel` `0x20000`, `Port_Arm` `0x40000`, `Starboard_Arm`
`0x80000`.

**Dock hardpoint** (`0x18ba00`, an enum rather than flags): `berth` 1, `moor_small` 3, `moor_medium`
4, `moor_large` 5, `ring` 6, `pad` 6, `jump` 7, `airlock` 8. `ring` and `pad` are the same value, and
0 and 2 are unnamed — a genuine enum with a deliberate alias.

## Hardpoint types

`common.dll` `.data:18ba40`, 63 entries — the `HpAttachmentType` enum.

What `hp_type` and `hp_gun_type` name. Values 4 through 66; 0 through 3 are unnamed and no string
reaches them.

| Value | Name                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------- |
| 4     | `hp_gun`                                                                                                 |
| 5–8   | `hp_shield_generator`, `hp_fighter_…`, `hp_elite_…`, `hp_freighter_shield_generator`                     |
| 9–14  | `hp_thruster`, `hp_torpedo`, `hp_mine_dropper`, `hp_countermeasure_dropper`, `hp_turret`, `hp_cargo_pod` |
| 15–24 | `hp_gun_special_1` … `_10`                                                                               |
| 25–34 | `hp_turret_special_1` … `_10`                                                                            |
| 35–36 | `hp_torpedo_special_2`, `hp_torpedo_special_1` — **inverted**                                            |
| 37–46 | `hp_fighter_shield_special_1` … `_10`                                                                    |
| 47–56 | `hp_elite_shield_special_1` … `_10`                                                                      |
| 57–66 | `hp_freighter_shield_special_1` … `_10`                                                                  |

`hp_torpedo_special_1` = 36 and `_2` = 35 is the one place the ordinal in the name disagrees with the
value. Not a transcription slip — the string block, the table and the default-list arrays all agree,
and retail sets `hp_torpedo_special_2` ×27 against `_1` ×16.

### The default lists

Two `int[]` immediately after the table, read by the exported `Archetype::Gun::get_hp_type_by_index`
and `Archetype::ShieldGenerator::get_hp_type_by_index`:

| Offset     | Count | Contents                                                                            |
| ---------- | ----- | ----------------------------------------------------------------------------------- |
| `0x18bc38` | 23    | `hp_gun`, the ten `hp_gun_special_*`, the ten `hp_turret_special_*`, both torpedoes |
| `0x18bc98` | 34    | the four generators, then all thirty `*_shield_special_*`                           |

Both getters check a per-archetype vector first and fall back to these only when it is empty, so this
is the list an archetype gets when the INI declares no `hp_gun_type` — not a constraint on what it
may declare.

Both bounds checks are off by one. Gun compares against `0x17` over 23 entries, so index 23 reads the
trailing `0`; ShieldGenerator compares against `0x22` over 34, so index 34 reads `0xFFFFFFFF`.
Neither is reachable through the data, but a consumer reimplementing the lookup should not reproduce
it.

## Zone shapes

`common.dll` `.data:18cb80`. `sphere` 1, `ellipsoid` 2, `BOX` 3, `CYLINDER` 4, `RING` 5, `MESH` 6.
The mixed casing in the table is another sign the compare folds case: the zone reader matches
`shape` with `stricmp`, and an unknown name logs `*** WARNING: invalid ZoneShape` and stores 0
(`common.dll` `0x6336250`). **`RING` is used** — eight times, written `ring`, every one the zone
an `[Object] ring = zone, ini` builds a planet ring on. Its `size` is outer radius, inner radius and
full height. `MESH` is never used.

**What `size` means per shape**, from the zone's geometric slots (`common.dll` vtable `0x63a5064`).
A `SPHERE` reads only its first value, the radius. An `ELLIPSOID` holds three radii along local X,
Y and Z. A `BOX` holds full edge lengths. A `CYLINDER` is a radius and a full height about local Y.
A `RING` is an outer radius, an inner radius and a full height, also about local Y. `rotate = x, y,
z` in degrees goes through `EulerMatrix` (`0x63041a0`): Rz·Ry·Rx for column vectors, X applied
first, and a point is `R·local + pos`; objects use the same convention. **`MESH` is read and then
rejected.** `mesh =` loads a model handle, but the bounding-radius slot (`0x6339080`) logs `PCI -
zone type not supported!`, the containment slot answers false, and the segment test falls back to a
sphere of radius 0.

Beware the key: `shape` is set 6,270 times overall and only 5,769 of those are zones. The balance
belongs to other sections — asteroid and nebula exclusion shapes, lens-flare shapes — where the value
is a model or effect nickname.

Two more zone keys bear on the shapes. `edge_fraction` is clamped to [0, 1] and **defaults to 0**
(`common.dll` `0x633789a`), so a zone without it has a hard edge. The inside fraction (slot 0,
`0x633abb0`) is 0 outside, 1 deep inside and `(1 − s) / edge_fraction` across the rim, where `s` is
a per-shape scaled distance that is 1 on the surface (`0x633a660`). **`sort` is read by nothing** —
5,754 of the 5,769 zones set it, and neither the zone reader (`0x6337520`–`0x6337e09`) nor any other
binary takes it as a key.

## Zone property flags

The one vocabulary here with no table and no literal. `[Zone] property_flags` is a bitfield the file
writes as a number, so the engine tests bits rather than resolving a name. Searching the whole
install for any name below returns nothing, in either ASCII or UTF-16. These names are the community
reading, not recovered from a binary — but two things in the binaries bear on them, and both agree.

**The top five bits are set by the reader itself.** The zone reader (`common.dll`
`0x6337520`–`0x6337e09`) ORs `property_flags` into a word that other keys also write: `damage > 0`
sets `0x40000`, `drag_modifier > 1` sets `0x80000`, a non-zero `interference` sets `0x100000`, and
`spacedust` and `music` set `0x200000` and `0x400000` — exactly `DAMAGING`, `DRAG_MOD`,
`SCANNER_MOD`, `DUST` and `MUSIC`. They are derived, not authored, which is why retail almost never
writes them.

**The nav map's pattern table names the rest by use.** The zone painter (`Freelancer.exe`
`0x49b9c2`) picks a fill pattern per bit: `0x40` → 0, `0x80` → 1, `0x8000` → 2, `0x1000` → 3,
`0x2000` → 4, `0x100` → 5, `0x200` → 6, `0x400` → 7, `0x800` → 8, and `0x30000` paints black. The
six object bits and the two danger bits get patterns of their own, the nebula bit is the one pattern
tinted — by `property_fog_color`, whose only consumer this is — and the two exclusion bits blank the
zone out. `common.dll`'s nebula test (`0x6339030`) reads `flags & 0x18000`, the nebula and first
exclusion bits together. What the corpus adds is the extent — see [Corpus](#zone-property-flags-1).

| Bit        | Name                     | Bit        | Name                     |
| ---------- | ------------------------ | ---------- | ------------------------ |
| `0x1`      | `OBJECT_DENSITY_LOW`     | `0x2000`   | `BADLAND_DANGER_OBJECTS` |
| `0x2`      | `OBJECT_DENSITY_MED`     | `0x4000`   | `GAS_DANGER_OBJECTS`     |
| `0x4`      | `OBJECT_DENSITY_HIGH`    | `0x8000`   | `NEBULA`                 |
| `0x8`      | `DANGER_DENSITY_LOW`     | `0x10000`  | `EXCLUSION`              |
| `0x10`     | `DANGER_DENSITY_MED`     | `0x20000`  | `EXCLUSION2`             |
| `0x20`     | `DANGER_DENSITY_HIGH`    | `0x40000`  | `DAMAGING`               |
| `0x40`     | `ROCK_OBJECTS`           | `0x80000`  | `DRAG_MOD`               |
| `0x80`     | `DEBRIS_OBJECTS`         | `0x100000` | `SCANNER_MOD`            |
| `0x100`    | `ICE_OBJECTS`            | `0x200000` | `DUST`                   |
| `0x200`    | `LAVA_OBJECTS`           | `0x400000` | `MUSIC`                  |
| `0x400`    | `NOMAD_OBJECTS`          |            |                          |
| `0x800`    | `CRYSTAL_OBJECTS`        |            |                          |
| `0x1000`   | `MINE_DANGER_OBJECTS`    |            |                          |

## Visit flags

`visit` is another bitfield written as a number. **Systems, objects, zones and factions share one
visit map**, keyed by the nickname's id (a faction by its reputation group's), held by the client
(`Freelancer.exe` `0x673320`), merged by OR on the server (`server.dll` `0x6e3f2e0`) and saved as
`[Player] visit = id, flags`. The bits mean different things per kind.

A `[system]`'s `visit` is read for two bits only, and nothing changes it after load: `0x01` puts the
system on the map from the start, and `0x80` keeps visiting from revealing it — entering the system
or docking in it never marks it (`0x4c4840`, `0x4c4910`, both skipping on `visit & 0x81`). The other
bits are copied into the player's map and never tested.

| Bit    | `[Object]`                                                                                                        | `[zone]`                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `0x01` | known: navmap icon, real name, its connection drawn; a sun or lane ring is forced to 1 (`common.dll` `0x62b7aec`) | drawn on the navmap                          |
| `0x02` | set by landing and by `knowledgemap.ini`, never read                                                              | —                                            |
| `0x04` | a base: commodity prices known (`0x46f7b4`, `0x475100`)                                                           | mineable (`0x49c957`)                        |
| `0x08` | a base: equipment dealer known; a lootable solar: looted, on the server only                                      | infocard pickable on the navmap (`0x4a1b50`) |
| `0x10` | a base: ship dealer known; any other solar: found only within 7 km, and looted once                               | —                                            |
| `0x20` | —                                                                                                                 | always set by the reader, never read         |
| `0x80` | never found by flying near (`0x51cc00`)                                                                           | the same                                     |

**`knowledgemap.ini` ignores `0x80`**: it reveals ten retail `visit = 128` holes and four zones.

## Two smaller tables

**Good category** (`0x1896c0`): `Commodity` 0, `Equipment` 1, `ShipHull` 2, `Ship` 3. Retail authors
them lowercase.

**Base-room hotspots** (`0x189bc8`): `ExitDoor` 1, `NewsVendor` 2, `MissionVendor` 3, `Launch` 4,
`StartDealer` 5, `FrontDesk` 6, `StartShipDealer` 7, `StartEquipDealer` 8, `MoveRight` 9, `MoveLeft`
10, `VirtualRoom` 11, `Repair` 12. 6 and 7 are out of table order — `StartShipDealer` precedes
`FrontDesk` in memory.

## Effect types

`Freelancer.exe` `0x612a68`: 48 records of 0x28 bytes, `{name, priority, generic_priority, lod band,
radius, exist-offscreen byte, update-offscreen byte, run_time, fps, pbubble[2]}`. The index is the
value an `[Effect] effect_type` stores, and [`[EffectType]`](SECTIONS.md#effecttype) overwrites a
record by exact name (`0x4fd500`).

`EFT_NONE` 0, `EFT_EXPLOSION_SMALL` 1, `EFT_EXPLOSION_MEDIUM` 2, `EFT_EXPLOSION_LARGE` 3,
`EFT_EXPLOSION_DEBRIS` 4, `EFT_EXPLOSION_SHIP` 5, `EFT_EXPLOSION_MISSILE` 6, `EFT_EXPLOSION_MINE` 7,
`EFT_MUZZLE_FLASH` 8, `EFT_MUZZLE_LARGE_FLASH` 9, `EFT_MISSILE_DRIVE` 10, `EFT_WEAPON_PROJ` 11,
`EFT_WEAPON_LARGE_PROJ` 12, `EFT_WEAPON_IMPACT` 13, `EFT_WEAPON_LARGE_IMPACT` 14,
`EFT_WEAPON_COUNTER_MEASURE` 15, `EFT_WEAPON_MINE` 16, `EFT_DAMAGE_HULL` 17,
`EFT_DAMAGE_LARGE_SHIELD` 18, `EFT_DAMAGE_SHIELD` 19, `EFT_DAMAGE_CRUISE` 20, `EFT_DAMAGE_SMOKE` 21,
`EFT_DAMAGE_LARGE_SMOKE` 22, `EFT_DEBRIS_TRAIL` 23, `EFT_ENGINE_CONTRAIL` 24, `EFT_ENGINE_TRAIL` 25,
`EFT_ENGINE_LARGE_TRAIL` 26, `EFT_ENGINE_FIRE` 27, `EFT_ENGINE_LARGE_FIRE` 28,
`EFT_ENGINE_THRUSTER` 29, `EFT_EQUIP_CLOAK` 30, `EFT_EQUIP_LARGE_CLOAK` 31, `EFT_EQUIP_ATTACHED` 32,
`EFT_EQUIP_ATTACHED_LARGE` 33, `EFT_EQUIP_ATTACHED_INSANELY_LARGE` 34, `EFT_MISC_DUST` 35,
`EFT_MOTION_DUST` 36, `EFT_JUMP_EFFECTS` 37, `EFT_JUMP_GATE_EFFECTS` 38, `EFT_LANE_ACTIVE` 39,
`EFT_LANE_TUBE` 40, `EFT_LANE_SHIP` 41, `EFT_LANE_SHIP_TRAVEL` 42, `EFT_CUSTOM_EFFECTS` 43,
`EFT_CODE_PROJ_EFFECT` 44, `EFT_TRACTORBEAM` 45, `EFT_FLASHLIGHT` 46, and `EFT_NUMTYPES` 47, which
an unknown name maps to.

The index is the draw order: types draw in index order, newest first, with no depth sort, and 44–46
are drawn by the executable after the Alchemy batch (`0x4f7480`). The beam, camera-fade, tractor and
flashlight classes force their type whatever the INI says (`0x4f961a`). LOD bands (`0x6131e8`):
`EFT_LOD_NONE` 0, `EFT_LOD_TRAIL` 1, `EFT_LOD_WEAPON` 2, `EFT_LOD_SMALL` 3, `EFT_LOD_MEDIUM` 4,
`EFT_LOD_LARGE` 5, `EFT_LOD_SMALL_DISTANT` 6; [`[EffectLOD]`](SECTIONS.md#effectlod) `type` uses
`lod_type_*` names in the same order.

## `content.dll` — names without values

Everything below is names only, per [above](#where-these-live): `content.dll` compares with `strcmp`,
so no number is inferred.

### Pilot AI

`pilots_*.ini`'s sixteen blocks: `EvadeDodgeBlock`, `EvadeBreakBlock`, `BuzzHeadTowardBlock`,
`BuzzPassByBlock`, `TrailBlock`, `StrafeBlock`, `EngineKillBlock`, `RepairBlock`, `GunBlock`,
`MineBlock`, `MissileBlock`, `DamageReactionBlock`, `MissileReactionBlock`, `CountermeasureBlock`,
`FormationBlock`, `JobBlock` — plus `[Pilot]` and its `inherit`, and the `*_id` key that selects each
block.

Eleven keys take a fixed set of value names, recovered from literal-emission order:

| Key                                         | Values                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `evade_dodge_style_weight`                  | `CORKSCREW`, `SLIDE`, `WAGGLE_RANDOM`, `WAGGLE`                                 |
| `evade_dodge_direction_weight`              | `DOWN`, `UP`, `LEFT`, `RIGHT`                                                   |
| `evade_dodge_corkscrew_roll_flip_direction` | `TRUE`, `FALSE`                                                                 |
| `evade_break_style_weight`                  | `REVERSE`, `OUTRUN`, `SIDEWAYS`                                                 |
| `buzz_pass_by_style_weight`                 | `ENGINE_KILL`, `STRAIGHT_BY`, `BREAK_AWAY`                                      |
| `buzz_head_toward_style_weight`             | `STRAIGHT_TO`, …                                                                |
| `fire_style`                                | `SINGLE`, `MULTIPLE`                                                            |
| `formation_exit_mode`                       | `BRAKE_REVERSE`, `BREAK_AWAY_FROM_CENTER`, `BREAK_AWAY_FROM_CENTER_AFTERBURNER` |
| `field_targeting`                           | `ALWAYS`, `HIGH_DENSITY`, `LOW_DENSITY`, `NEVER`                                |
| `loot_flee_threshold`                       | `EASIEST`, `EASY`, `EQUAL`, `HARD`, `HARDEST`                                   |
| `loot_preference`                           | `LT_ALL`, `LT_NONE`, `LT_COMMODITIES`, `LT_EQUIPMENT`, `LT_POTIONS`             |

`TRUE`/`FALSE` are compared as strings here, exactly as `INI_Reader` would — against
[INI.md](../modules/INI.md)'s finding that no retail value is boolean-typed.

One run is not confidently attributed: `TURRETS`, `LAUNCHERS`, `TOWERS`, `ENGINES`, `HULL`, `GUNS`,
`GUIDED`, `UNGUIDED`, `TORPEDO`, `ANYTHING` sit beside both `attack_subtarget_order` and
`attack_preference`, and emission order does not separate them.

### Mission scripting

About a hundred `Act_*` and `Cnd_*` names at `.rdata:1139cc` — the action and condition vocabulary of
`[Trigger]` blocks. `Act_SpawnShip`, `Act_SetVibe`, `Act_PlayNN`, `Act_CallThorn`, `Cnd_WatchVibe`,
`Cnd_TLEntered` and the rest — alongside `MissionState` with `COMPLETE`/`INACTIVE`/`ACTIVE`, and
`NNObjective`, `TriggerSave`, `repeatable`.

### Story and random-mission enums

`content.dll`'s only three `{ name, int }` tables:

- **Story rank** (`.data:12d5d0`, 42): `base_0_rank` 0, then `mission_01a_loaded`,
  `mission_01a_accepted`, `mission_01b_*`, `freetime_01_02` … through `mission_end` 41. An unknown
  name keeps the previous value; the stage is saved as `[StoryInfo] MissionNum`, and `[NewsItem]
  rank`, `rumor` windows and `rank_diff` are written in these names.
- **Formation and solar roles** (`.data:12d720`, 8): `big_solar_formation` 0 …
  `loot_group_formation` 3; `big_solar` 0, `defensive_solar` 1, `killable_neutral` 2,
  `background_solar` 3.
- **Random-mission vocabulary** (`.data:12d778`, 44): three enums of `VignetteParams.ini`. The
  first 17 are the events a `comm_sequence` line fires on (`NONE` 0, `IN_SPACE_IN_SYSTEM` 1 …
  `GLOBAL_FAIL_OTHER` 16); the next 12 are its speakers and recipients (`NONE` 0, `BASE` 1,
  `BIG_SOLAR`, `BIG_SHIP`, `DEFENSIVE_SHIP`, `FRIENDLY_SHIP`, `PLAYER`, `ALL_PLAYERS`,
  `PLAYERS_IN_RANGE` … `PLAYERS_OUT_OF_SYSTEM` 11); the last 15 are the tokens an offer, objective,
  failure or reward text substitutes (`FSTRING_PARAM_NONE` 0, `OFFER_GROUP` 1 … `TARGET_SYSTEM` 14).

### The export table names the reader

`common.dll` exports `INI_Reader` in full — 3,856 exports, among them `get_value_int`,
`get_value_float`, `get_value_bool`, `get_value_string`, `get_indexed_value`, `is_number`,
`is_value_empty`, `is_value`, `is_header`, `find_header`, `read_value`, `read_header`, `set_state`,
`reset` — plus `CacheString`, `FmtStr` and `ID_String`. `content.dll`, `server.dll` and the
executable all import it from there; `content.dll` itself exports only seven symbols.

That is the class [INI.md](../modules/INI.md)'s coercion rules are modelled on, and the accessor list is direct
evidence for the rule stated there: there is no accessor asking what type a value is, only accessors
asking for the type you want.

## Property names

The vocabulary above is enum *values*. This section is the keys, and which the engine matches. Two
methods.

### Method 1 — look for the literal

Every key the engine matches by name exists in some binary as a NUL-terminated string. Take the names
retail data uses and look each one up. Cheap, works on every binary, and gives an **upper bound**: a
literal being present does not prove it is used as an INI key. Two traps in
[Literal lookup traps](#literal-lookup-traps).

### Method 2 — disassemble the call sites

`INI_Reader::is_value(const char *)` is exported from `common.dll` and imported by everything else,
so the key is the argument pushed before the call. Find every `call is_value` / `call is_header` /
`call find_header`, walk back for the `push imm32` or `mov reg, imm32` that supplies it, and resolve
the pointer. This gives a **lower bound**, and — unlike method 1 — it says which reader wants the
key.

The retail `Freelancer.exe` cannot be read this way — see
[The executable is SafeDisc-wrapped](#the-executable-is-safedisc-wrapped).

### Value shapes

The same call sites say what shape a property's value has, because `INI_Reader` has no accessor that
asks what type a value is. The code after a matched key names both the position and the type:
`push 2; call get_value_float` is "read index 2 as a float". Bounding each block by its
`test al,al`/`jz` and by the next call site, and reading the index off the `push imm8`/`push imm32`
that precedes each accessor, recovers a shape.

`pos` comes out `float float float`, `rotate` and `color` the same, `nickname` a string,
`num_exhaust_nozzles` an `int`, `dispersion_angle` a `float`. `is_value_empty(i)` probes mark an
optional position — which is how `[Zone] size` reads: one value for a sphere, two for a cylinder,
three for a box.

The declared shape and the written value are different things.
[INI.md](../modules/INI.md#how-the-game-reads-a-value) says the reader coerces, so a `[Light] color` of
`255, 255, 255` is recorded integer-typed and read with `get_value_float`.

A declared shape is a lower bound: `hp_type` reads index 0 as a string and the hardpoint names after
it come from a loop the scan does not follow, so its arity runs to 7 in retail.

A shape is per name, and a name is occasionally per section. The genuine cases are different fields
wearing one name: `[CollisionConsts] damage` takes a name and an amount where `[Zone] damage` takes a
number, and `[MsnSolar] visit` is a string where every `common.dll` reader treats `visit` as an int.

Full table in [SECTIONS.md](SECTIONS.md#declared-value-shapes).

### Attribution

`common.dll` exports 3,856 symbols, so the nearest preceding export names the function a call site
sits in:

```
Archetype::Ship::read
    bay_door_anim, HP_bay_surface, HP_bay_external, HP_tractor_source, num_exhaust_nozzles,
    hold_size, linear_drag, angular_drag, steering_torque, nudge_force, strafe_force,
    strafe_power_usage, ids_info1, ids_info2, ids_info3, ship_class, nanobot_limit,
    shield_battery_limit, max_bank_angle, hp_type
```

The same works for `Archetype::Solar::read`, `Archetype::Gun::read`, `Archetype::Munition::read`,
`GoodInfoList::read_Good_block`, `CSolar::ReadObj`, `RoomData::read_*_block`,
`CmnAsteroid::CAsteroidField::load`, `Universe::Startup` (49 keys over `[Time]`, `[System]`,
`[Zone]`, `[Music]`, `[Object]`, `[Base]`) and `ReadConstants` (78 keys over seven `[*Consts]`
sections).

It does not work outside `common.dll` — `content.dll` exports seven symbols, so its sites collapse
onto four "owners" and the names are meaningless. The grouping is still real, because a run of sites
is one function; only the label is wrong. Those clusters are identified by the section names they
match: one is the mission-script reader (13 sections, 153 keys, every `Cnd_*` and `Act_*`), another
the pilot and faction tables (`[RandomMission]`, `[RankDiffDB]`, `[FactionProps]`).

### The enumeration

[SECTIONS.md](SECTIONS.md) lists all 283 sections — the section/property pairs retail data shows,
plus more recovered from the binaries: properties the engine reads in a section that no retail file
sets there. `dispersion_angle` on `[Gun]` is the case that forced them in.

Three placement rules. Address order within one function and the exported block-reader names are
heuristics; the third is the **archetype class chain**, and it is exact: `common.dll` has no RTTI,
but a virtual override calls its base, so scanning each `Archetype::X::read` for calls to another
`Archetype::Y::read` recovers the hierarchy outright — `Gun → Launcher → AttachedEquipment →
Equipment → Root`, which is why a `[Gun]` accepts 37 keys where retail sets 24. SECTIONS.md lists
what each class contributes, and which class each header instantiates, read off the constructor the
`Archetype::Load*` dispatcher calls. `[Ship]` is direct; `[Solar]` calls `EqObj`'s constructor, its
base.

Address-order segmentation needs function boundaries, and the export table is the wrong source for
them — fine in `common.dll`, useless in `content.dll`. **Every address a direct `call` targets is a
function start**, and collecting those works in any binary regardless of what it exports.

For 24 of the 35 matched-but-absent sections, "what are its properties?" has no answer, in two ways.
Twelve are **obsolete** — the header is matched only to emit `*** WARNING: [Cloud] is obsolete`
(`RoomData.cpp:2046`) and then skipped. Twelve are read **positionally** — their handler calls the
indexed `get_value_int(i)` / `get_value_string(i)` accessors and never `is_value`, eleven of them
sharing one function in `content.dll` that makes 50 indexed calls and zero name comparisons.
`[MsnShipSave]` accepts a sequence, not a set of named keys.

Bounding a header block: take the `test al,al` and `jz` that follow the header call, stop at the jump
target or at any unconditional `jmp`. Without the `jmp` terminator `[Lighting]` absorbs eighteen
properties from the block after it.

## Notes

### Literal lookup traps

- **Literals are frequently preceded by printable data bytes.** `[Good] price` sits at `139e6d` as
  `?33s?price` — the five bytes ahead of it are a float, not text. Splitting the string region on
  printable runs rejects it and concludes the game does not read `price`.
- **The reverse case is real too.** `comment` occurs only inside `Expecting end of comment`, and
  `flag` only inside `original_jump_flag`. Those are not keys.

No mechanical rule separates the two — `Erelief_time` is a data byte plus a key, `spacedust` is a
word containing `pacedust`. The 23 ambiguous names were classified by eye; 14 are keys, 9 are not.

### The executable is SafeDisc-wrapped

The retail `Freelancer.exe`'s `.text` has entropy 7.98 and contains zero `push ebp; mov ebp, esp`
prologues, against 6.46 and normal prologues in the DLLs, and it carries two extra sections named
`stxt774` and `stxt371`. No string in it has a single code reference.

The call-site figures below are from an unprotected build of the same executable; its `.rdata` is
byte-identical in layout and it imports 29 `INI_Reader` entry points from `common.dll`. Method 1
works on the retail executable regardless, because `.rdata` is in the clear either way.

## Corpus

Counts are over all 1,252 retail INI files under `DATA`, read through this library's own reader,
plus `EXE/*.ini` and the two `.fl` saves where noted. A wider sweep than
[RETAIL.md](RETAIL.md#what-is-in-it)'s 70,250-section figure, which is BINI only.

### Object types

`[Solar] type` is set 321 times over 14 distinct spellings — `NON_TARGETABLE` ×75,
`MISSION_SATELLITE` ×59, `PLANET` ×55, `STATION` ×45, `SATELLITE` ×37, `DESTROYABLE_DEPOT` ×26,
`WEAPONS_PLATFORM` ×9, `JUMP_HOLE` ×5, then `SUN`, `DOCKING_RING`, `JUMP_GATE`, `AIRLOCK_GATE` ×2
each and `TRADELANE_RING` ×1. The fourteenth is `waypoint`, lowercase, once — which is how the
comparison is known to fold case, since the table has only `WAYPOINT`.

`[Ship] type` is set 115 times over 7: `FIGHTER` ×81, `FREIGHTER` ×9, `CAPITAL` ×8, `TRANSPORT` ×8,
`CRUISER` ×4, `GUNBOAT` ×4, `MINING` ×1.

`[CollisionGroup] type` is set 100 times across 13 of the 19 flags; the six engine names and `Engine`
itself go unused.

### Hardpoint types

The vocabulary is closed. `hp_type`/`hp_gun_type`/`hp_shield_type` are set 1,350 times over 61
distinct names, every one in the table, with nothing unregistered. The two never used are
`hp_shield_generator` and `hp_freighter_shield_generator`, both of which have a `_special_` series
that covers them.

### Zone shapes

Retail sets 5,769 — `CYLINDER` ×3,307, `SPHERE` ×1,878, `ELLIPSOID` ×361, `BOX` ×215, `RING` ×8.
`MESH` is never used. Every `RING` is written lowercase, `ring`, which is why a case-sensitive count
once made it 5,761 and `RING` unused: `Zone_Br03_ross_ring`, `Zone_Ku02_Fuchu_ring`,
`Zone_Ku03_Aso_ring`, `Zone_Rh04_Weisser_ring`, `Zone_Ew01_sun_ring`, `Zone_Ew03_gravity_ring`,
`Zone_Ew05_lower_ring` and `Zone_Ew05_upper_ring`.

### Zone property flags

Retail sets the key 835 times, all in `[Zone]`, all integer-typed, all one value, over 41 distinct
words — and not one set bit falls outside the 23 named, a strong statement about where the field ends
but not about which name belongs to which bit.

Set counts per bit, in the order [the table above](#zone-property-flags) lists them: 69, 99, 6, 6,
22, 8, 116, 27, 34, 6, 7, 1, 5, 4, 20, 59, 164, 434, 2, **0**, 2, **0**, **0**. Six zones write `0` —
three asteroid fields in Iw05 and three in Iw06.

Four places where the data speaks to a name, and all four agree with it:

- **`NEBULA`** — all 59 zones carrying it set `property_fog_color`, and 51 set `music`.
- **`EXCLUSION`** — 125 of its 164 set `edge_fraction`, against 27 of `EXCLUSION2`'s 434.
- **`DAMAGING`** and **`SCANNER_MOD`** are the same two zones. One word, `0x148020`, written twice:
  `Zone_Li04_Pequena_Negra` and `Zone_Li04_Grande_Negra` — the two black holes in Li04, and the only
  two zones setting both `damage` and `interference`.
- **`CRYSTAL_OBJECTS`** is set once, on `zone_Li02_Tahoe_ice_crystal_field`.

The flag is not a gate on the key — it is the key's output. `DRAG_MOD`, `DUST` and `MUSIC` are never
set by any retail zone, yet `drag_modifier`, `spacedust` ×270 and `music` ×166 are authored on zones
without them; `damage` is the same case from the other side: 173 zones set it and only the two above
set `DAMAGING`. The reader sets all five bits itself from those keys
([above](#zone-property-flags)). The one correlation that holds in both directions is
`property_fog_color`, which appears 182 times and never on a zone without a `property_flags` word.

### Good categories

Retail authors them lowercase: `equipment` ×752, `commodity` ×40, `shiphull` ×32, `ship` ×31.

### Call-site resolution

| Binary           | Call sites | Resolved          |
| ---------------- | ---------- | ----------------- |
| `common.dll`     | 649        | 649               |
| `content.dll`    | 391        | 386               |
| `Freelancer.exe` | 232        | 231               |
| `server.dll`     | 37         | 37                |
| **total**        | **1,309**  | **1,303** (99.5%) |

799 property names and 208 section names come out of it. The 649 `common.dll` sites fall across 78
distinct owners, about 8 apiece.

### What the two methods together say

Over 1,375 distinct property names in 515,428 uses:

| Class                                                          | Names   | Uses            |
| -------------------------------------------------------------- | ------- | --------------- |
| **Proven read** — passed to `is_value` at a resolved call site | 619     | 316,869 (61.5%) |
| **Literal present** — matched by some other path               | 651     | 182,428 (35.4%) |
| **No literal anywhere** — not matched by name at all           | **105** | 16,131 (3.1%)   |

The middle row is not a failure. `is_value` is one of several ways a reader identifies a key —
`get_name_ptr` plus its own comparison is another — so method 2 finds a subset by construction.

### The 105 keys nothing reads

The same class as [THORN.md](THORN.md#userprops-is-not-thorns)'s `Priority`: data the authoring
pipeline emitted that the shipped engine never looks at.

| Key                          | Uses      | Where                                      |
| ---------------------------- | --------- | ------------------------------------------ |
| `faction_weight`             | 5,611     | `[zone]`                                   |
| `pop_type`                   | 3,841     | `[zone]`                                   |
| `difficulty_level`           | 1,489     | `[Object]`                                 |
| `filename`                   | 1,186     | `[EncounterParameters]`, `[ConcaveObject]` |
| `attack_ids`                 | 806       | `[zone]`                                   |
| `comment`                    | 678       | `[zone]`                                   |
| `rumorknowdb` / `knowdb`     | 564 / 538 | `[GF_NPC]`                                 |
| `flag`                       | 365       | `[properties]`                             |
| `offers_missions`            | 241       | `[BaseFaction]`                            |
| `placement_offset`           | 145       | `[DynamicAsteroids]`                       |
| `lane_id` / `tradelane_down` | 139 / 133 | `[zone]`                                   |
| `strength`                   | 86        | `[Explosion]`                              |
| `fog_enabled`                | 59        | `[Fog]`                                    |

`[EncounterParameters] filename` is the one exception: its value is read by position
(`content.dll` `0x7064ae8`) although the name is never matched.

A `[zone]` carries both `faction_weight` (a weighted faction list) and `faction` (per-encounter
weights). Only the second is read. Likewise the engine matches `difficulty` and not
`difficulty_level` — though not in a `[zone]`: no zone reader in any binary takes `difficulty`, so its
300 zone uses are unread as well (`content.dll`'s zone reader is `0x7097530`).

Eight of the 105 are shipped typos, each one edit away from a key that is read:
`spacedust _maxparticles` (embedded space, ×5), `spacedust_masparticles` (×2),
`spacedusr_maxparticles`, `spacedust_maxdust`, `pacedust` (×3), `info_ids` for `ids_info`,
`info_card` for `ids_info_card`, and `fade_distance` for `near_fade_distance`.
`CommodityDealer` and `EquipmentDealer` are not typos: they are `[Spiels]` keys, and no binary reads
`[Spiels]` at all — the `ShipDealer` literal its third key matches is a room nickname.
Two entries are not names at all — `260800`, and a run of 42 dashes.

### The 180 keys retail never sets

Available only from method 2: keys the engine matches that no file in the install provides, so they
take whatever default the reader leaves in place. The substantial groups are the physics constants
(`GOLEM_*` ×11, `RMGR_LOOK_AHEAD_*` ×10, `ANOM_LIMITS_*`, `PHYSICAL_SIM_RATE`,
`MIN_TIME_BETWEEN_COLLISIONS`), sound constants (`INTERIOR_SOUND_NAME`, `EXTERIOR_SOUND_NAME`,
`INSIDE_CONE_ANGLE`, `MAX_VOLUME_FORCE`), weapon fields `gun_azimuth`, `gun_elevation` and
`dispersion_angle`, docking flags `can_dock`, `can_tl`, `dock_exception` and `tlr_exception`, and
`price_variance`, `ship_repair_cost`, `linked_equip`, `tractored_explosion`.

A handful are artefacts: widening the argument search to `mov reg, imm32` picks up the occasional
wrong operand, which is where `/*`, `*/`, `content.dll` and `version` in that list come from. The
list is a lead, not a measurement.

### Declared shapes against recorded types

A shape is recovered for 542 of the 799 property names. Scored against the 495 positions where both
the declared shape and the recorded type are known:

|                                          | Positions |     |
| ---------------------------------------- | --------- | --- |
| Declared type equals the recorded type   | 315       | 64% |
| Compatible under `INI_Reader`'s coercion | 176       | 36% |
| **Incompatible**                         | **4**     | 1%  |

Only four positions resist, and two of them are one name read in two sections. `rank` and
`location` are declared `int` by the save's `[Player]` reader (`server.dll` `0x6e3740a`,
`0x6e373e2`), a level and a room id, while the strings recorded are `[NewsItem] rank`'s two
story-stage names and `[CharacterEncounter] Location`'s base and room, which `content.dll` reads
through a register. `ambient[1]` and `permutation[0]` are declared string and written as integers;
those two are recorded, not explained.

Arity agrees too — the highest index the code touches fits inside the observed value count for 401
names and exceeds it for 7, all residual block overrun.

Of the 542, twenty show more than one shape across their call sites; nine of those differ only by
being a prefix of the longest, which is the scan truncating rather than the engine disagreeing.
Eleven are genuine.

### Section coverage

| | Count |
| --- | --- |
| Sections listed in [SECTIONS.md](SECTIONS.md) | 283 |
| Section/property pairs retail data shows | 2,222, of which 110 unread |
| Pairs added from the binaries that retail never writes | 522 |
| Section names recovered from call sites | 208 |
| Archetype classes recovered from the call graph | 29 exports, 28 distinct bodies |
| Property readings across those classes | 154, one key read twice in a chain |
| Section-to-class bindings confirmed by the dispatcher | 30 of 34, 2 absent, **2 corrected** |

Function boundaries from call targets, not exports, lift `content.dll`'s address-order corroboration
from 31% to 94%; within-function address order corroborates at 94% and the exported block-reader
names at 88%. The archetype class chain is exact.

Of the 35 matched-but-absent sections: 12 obsolete (9 in `RoomData.cpp`, 2 in `Cockpit.cpp`), 12
positional, 11 of those sharing one handler.

## TODO

Pending observation in the running game.

- **What object-type values 0 through 3 and `HpAttachmentType` 0 through 3 are.** Both enums start at
  4 with nothing naming the low values, and no string reaches them. *Experiment*: find a code path
  that produces one — likelier by watching a debug build's `unknown OBJECT_TYPE` path than by editing
  data.
- **Whether `MOON`, `BLACKHOLE` and `ASTEROID` do anything as a `[Solar] type`.** Named, and no
  archetype sets them. `ASTEROID`'s bit sits far from the other solar bits, which suggests it is
  assigned to objects the engine creates. Not evidence. `MOON` is tested in one place: the
  per-object light setup (`Freelancer.exe` `0x539b6c`) masks the object's type with `0x807`
  (`MOON`, `PLANET`, `SUN`, `JUMP_HOLE`) and gives none of them runtime effect lights.
- **Which of `attack_subtarget_order` and `attack_preference` takes which values.** Emission order
  puts one run of ten names beside both. *Experiment*: set an implausible value on each and watch
  which the engine rejects.
- **Whether the 105 unread keys are really inert.** Nothing matches them by name in any binary, which
  is strong but not conclusive — a reader could compare a constructed string. *Experiment*: change
  `faction_weight` in a zone to something absurd and see whether population changes; it is the
  highest-use member of the set at 5,611.
- **What matches the 651 keys with literals but no `is_value` call site.** Finding the other matcher
  — most likely `get_name_ptr` plus a local comparison — would fold them into the attributed set.
  A reading problem rather than an in-game one. Partly answered: `[LightSource]`'s reader is
  `get_name_ptr` plus `stricmp`, and the asteroid field loader calls `is_header` and `is_value`
  through a register; [SECTIONS.md](SECTIONS.md#legend) carries the sections disassembly has traced.
  `[PerfOptions]` is a third: `get_name_ptr` plus a case-sensitive compare (`Freelancer.exe`
  `0x5b3b00`).

---

[INI.md](../modules/INI.md) · [SECTIONS.md](SECTIONS.md) · [THORN.md](THORN.md) · [RETAIL.md](RETAIL.md)
