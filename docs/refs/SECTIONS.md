# SECTIONS — every section and property the game reads

Every section name and every property in it, whether or not retail data uses it.
[ENGINE.md](ENGINE.md) explains where the vocabulary lives in the binaries and how it was recovered;
this is the enumeration.

No module, and there will not be one. To this library `[Solar]` is a section name and `type` is a
property name — see the scope rule in [ARCHITECTURE.md](ARCHITECTURE.md#invariants).

## Where each row comes from

Two routes, carrying different weight:

- **Observed in retail data** — from reading all 1,257 retail INI files (`DATA/**/*.ini`,
  `EXE/*.ini` and the two `.fl` saves) through this library's own reader.
- **Recovered from the binaries** — a property the engine reads in that section that no retail file
  sets there. `dispersion_angle` on `[Gun]` is the case that forced them in.

The read/unread mark comes from the binaries either way, by the two methods in
[ENGINE.md](ENGINE.md#property-names).

### The three placement rules, and what each is worth

| Rule  | How a property is placed                                                                                         | Corroboration              |
| ----- | ---------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **A** | Address order **inside one function** — an `is_header` match opens a group, following `is_value` matches join it | **93%** (248/268)          |
| **B** | The exported symbol names the block — `RoomData::read_Hotspot_block` → `[Hotspot]`                               | **88%** (52/59)            |
| **C** | The section's **archetype class chain**, recovered from the call graph                                           | not measurable — see below |

Corroboration is the share of placements whose property retail *does* set in that section, so it is
only a meaningful test for A and B. Rule C cannot be scored that way, because its purpose is to add
properties retail never sets there; it rests on the call graph instead.

### The archetype hierarchy is exact, not inferred

`common.dll` was built without RTTI, but a virtual override calls its base, so scanning each
`Archetype::X::read` body for calls to another `Archetype::Y::read` recovers the inheritance exactly:

```
Root ─┬─ Asteroid, DynamicAsteroid
      ├─ EqObj ── Ship, Solar
      └─ Equipment ─┬─ Armor, Commodity, Engine, InternalFXEquip, Light, Power,
                    │  RepairDroid, RepairKit, Scanner, ShieldBattery, Tractor
                    ├─ Projectile ── CounterMeasure, Mine, Munition
                    └─ AttachedEquipment ─┬─ CloakingDevice, ShieldGenerator, Thruster
                                          └─ Launcher ── Gun, CounterMeasureDropper
```

`Explosion` stands outside it with no base. So **a `[Gun]` accepts everything
`Gun` + `Launcher` + `AttachedEquipment` + `Equipment` + `Root` read** — 37 keys, of which retail
sets 24. That is why `mass`, `hit_pts` and `nickname` are legal in a `[Light]`: they are `Root`'s.

Where a section has no same-named class the chain was fitted by which one best explains the
properties retail *does* set there, then checked against what the dispatcher constructs — see below.
Every such fit covers 100% of the observed properties except `[CollisionGroup]` (missing `fuse`, read
by its constructor) and `[Explosion]` (missing `nickname`, read by `Archetype::LoadExplosion`).

### Which class consumes which section

The chain a section inherits is one question; **which class the dispatcher actually instantiates for
that header** is another, and it is measurable. Each `Archetype::Load*` function matches a header and
then constructs something — bounding the block as above and resolving the constructor call gives the
class, or its nearest exported ancestor when the derived constructor was inlined.

**`[Ship]` is direct**: `Archetype::LoadShips` matches the header and calls `Archetype::Ship`'s own
constructor. **`[Solar]` is one step removed**: `Archetype::LoadSolar` calls the `EqObj` constructor,
which is `Solar`'s base — its own having been inlined — and `Archetype::Solar::read` supplies the six
keys (`toughness`, `destructible`, `open_anim`, `loadout`, `jump_out_hp`, `solar_radius`) that retail
sets only in `[Solar]`. Both resolve to `… → EqObj → Root`.

Across the 34 archetype sections the constructor evidence agrees with the class fitted from the data
in **30 cases**, is absent in two (`[CollisionGroup]` and `[Motor]` construct nothing in their block),
and **corrected two**: `[LootCrate]` was fitted to `Root` on thin evidence and the dispatcher calls
`Equipment`, and `[RepairKit]`'s base was unrecoverable because its reader is folded with
`ShieldBattery` — the constructor call reaching `Root` settles that its chain runs through
`Equipment`. Both corrections are applied below.

| Section                   | Class                   | Chain                                                                             | Dispatch evidence                                                |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `[Armor]`                 | `Armor`                 | `Armor` → `Equipment` → `Root`                                                    | `Equipment` constructor, its base                                |
| `[asteroid]`              | `Asteroid`              | `Asteroid` → `Root`                                                               | `Root` constructor, its base                                     |
| `[AsteroidMine]`          | `Asteroid`              | `Asteroid` → `Root`                                                               | `Root` constructor, its base                                     |
| `[AttachedFX]`            | `Root`                  | `Root`                                                                            | **direct** — `Load*` calls `Root`'s own constructor              |
| `[CargoPod]`              | `AttachedEquipment`     | `AttachedEquipment` → `Equipment` → `Root`                                        | **direct** — `Load*` calls `AttachedEquipment`'s own constructor |
| `[CloakingDevice]`        | `CloakingDevice`        | `CloakingDevice` → `AttachedEquipment` → `Equipment` → `Root`                     | `AttachedEquipment` constructor, its base                        |
| `[CollisionGroup]`        | `AttachedEquipment`     | `AttachedEquipment` → `Equipment` → `Root`                                        | — no constructor in the dispatch block                           |
| `[Commodity]`             | `Commodity`             | `Commodity` → `Equipment` → `Root`                                                | `Equipment` constructor, its base                                |
| `[CounterMeasure]`        | `CounterMeasure`        | `CounterMeasure` → `Projectile` → `Equipment` → `Root`                            | `Projectile` constructor, its base                               |
| `[CounterMeasureDropper]` | `CounterMeasureDropper` | `CounterMeasureDropper` → `Launcher` → `AttachedEquipment` → `Equipment` → `Root` | `Launcher` constructor, its base                                 |
| `[DynamicAsteroid]`       | `Root`                  | `Root`                                                                            | **direct** — `Load*` calls `Root`'s own constructor              |
| `[Engine]`                | `Engine`                | `Engine` → `Equipment` → `Root`                                                   | `Equipment` constructor, its base                                |
| `[explosion]`             | `Explosion`             | `Explosion`                                                                       | **direct** — `Load*` calls `Explosion`'s own constructor         |
| `[Gun]`                   | `Gun`                   | `Gun` → `Launcher` → `AttachedEquipment` → `Equipment` → `Root`                   | `Launcher` constructor, its base                                 |
| `[InternalFX]`            | `InternalFXEquip`       | `InternalFXEquip` → `Equipment` → `Root`                                          | `Root` constructor, its base                                     |
| `[Light]`                 | `Light`                 | `Light` → `Equipment` → `Root`                                                    | `Root` constructor, its base                                     |
| `[LootCrate]`             | `Equipment`             | `Equipment` → `Root`                                                              | **direct** — `Load*` calls `Equipment`'s own constructor         |
| `[Mine]`                  | `Mine`                  | `Mine` → `Projectile` → `Equipment` → `Root`                                      | `Equipment` constructor, its base                                |
| `[MineDropper]`           | `Launcher`              | `Launcher` → `AttachedEquipment` → `Equipment` → `Root`                           | **direct** — `Load*` calls `Launcher`'s own constructor          |
| `[Motor]`                 | `Projectile`            | `Projectile` → `Equipment` → `Root`                                               | — no constructor in the dispatch block                           |
| `[Munition]`              | `Munition`              | `Munition` → `Projectile` → `Equipment` → `Root`                                  | `Equipment` constructor, its base                                |
| `[Power]`                 | `Power`                 | `Power` → `Equipment` → `Root`                                                    | `Equipment` constructor, its base                                |
| `[repairdroid]`           | `RepairDroid`           | `RepairDroid` → `Equipment` → `Root`                                              | `Root` constructor, its base                                     |
| `[RepairKit]`             | `RepairKit`             | `RepairKit` → `Equipment` → `Root`                                                | `Root` constructor, its base                                     |
| `[Scanner]`               | `Scanner`               | `Scanner` → `Equipment` → `Root`                                                  | `Root` constructor, its base                                     |
| `[Shield]`                | `AttachedEquipment`     | `AttachedEquipment` → `Equipment` → `Root`                                        | **direct** — `Load*` calls `AttachedEquipment`'s own constructor |
| `[ShieldBattery]`         | `Equipment`             | `Equipment` → `Root`                                                              | **direct** — `Load*` calls `Equipment`'s own constructor         |
| `[ShieldGenerator]`       | `ShieldGenerator`       | `ShieldGenerator` → `AttachedEquipment` → `Equipment` → `Root`                    | `AttachedEquipment` constructor, its base                        |
| `[ship]`                  | `Ship`                  | `Ship` → `EqObj` → `Root`                                                         | **direct** — `Load*` calls `Ship`'s own constructor              |
| `[Simple]`                | `Root`                  | `Root`                                                                            | **direct** — `Load*` calls `Root`'s own constructor              |
| `[Solar]`                 | `Solar`                 | `Solar` → `EqObj` → `Root`                                                        | `EqObj` constructor, its base                                    |
| `[Thruster]`              | `Thruster`              | `Thruster` → `AttachedEquipment` → `Equipment` → `Root`                           | `AttachedEquipment` constructor, its base                        |
| `[Tractor]`               | `Tractor`               | `Tractor` → `Equipment` → `Root`                                                  | `Equipment` constructor, its base                                |
| `[TradeLane]`             | `Root`                  | `Root`                                                                            | **direct** — `Load*` calls `Root`'s own constructor              |

A section whose class column is a base — `[Shield]` on `AttachedEquipment`, `[MineDropper]` on
`Launcher`, `[CargoPod]` on `AttachedEquipment` — has **no class of its own**: the engine reuses the
base reader unchanged, so those headers are distinguished by what the caller does with the object,
not by any extra property.

### What each `Archetype` class reads

The hierarchy above says which classes a section inherits; this says what each one contributes. 28
readers, **154 property readings between them**. Marks are the table's: **⁺** for a property retail
never sets, and the trailing code is its declared shape.

A key is almost always read by exactly one class in any given chain, which is what makes the union
well defined. **Fourteen names are read by more than one class, and only one of those is a
same-chain collision**: `hit_pts` is matched by `Root` *and* by `Equipment`, so an equipment
archetype tests it twice in one pass. The other thirteen — `power_usage` across `Engine`, `Thruster`,
`Scanner`, `CloakingDevice` and `Launcher`, `linear_drag` across `Ship`, `Engine`, `Mine` and
`CounterMeasure`, and so on — sit on separate branches and never meet in one chain.

`RepairKit` and `ShieldBattery` are the **same function** — the linker folded two identical bodies to
one address (`0x062f4d70`), so the export names are indistinguishable and the reader is listed once.
`RepairKit`'s base is taken from its folded twin, corroborated by the constructor call above.

**`Archetype::Root`** — 13 own, base **none**. Fits `[AttachedFX]`, `[DynamicAsteroid]`, `[Simple]`, `[TradeLane]`.

**`attachment_archetype`⁺**, `DA_archetype`, `explosion_arch` `s`, `explosion_resistance` `f`,
`hit_pts` `f`, `ids_info` `i`, `ids_name` `i`, `mass` `f`, `mission_property` `s`,
`nickname` `s`, `phantom_physics` `b`, `rotation_inertia` `f f f`, `type` `s`

**`Archetype::Explosion`** — 14 own, base **none**. Fits `[explosion]`.

`debris_impulse` `f`, `debris_type` `s i?`, `effect` `s f?`, `energy_damage` `f`,
`hull_damage` `f`, `impulse` `f`, `innards_debris_num` `f`, `innards_debris_object` `s`,
`innards_debris_radius` `f`, `innards_debris_start_time` `f`, `lifetime` `f f?`,
`num_child_pieces` `f`, `process` `s`, `radius` `f`

**`Archetype::Asteroid`** — 3 own, base `Archetype::Root`. Fits `[asteroid]`, `[AsteroidMine]`.

`detect_radius` `f`, `explosion_offset` `f`, `recharge_time` `f`

**`Archetype::EqObj`** — 5 own, base `Archetype::Root`. No section fits it directly.

`docking_camera` `b`, `docking_sphere` `s s f s?`, `fuse` `s f f`, `nomad` `b`,
`shield_link` `s?`

**`Archetype::Equipment`** — 7 own, base `Archetype::Root`. Fits `[LootCrate]`, `[ShieldBattery]`.

`hit_pts` `f`, `inherit` `s`, `lootable` `b`, **`tractored_explosion`⁺** `s`,
`units_per_container` `i`, **`use_count`⁺** `b`, `volume` `f`

**`Archetype::Armor`** — 1 own, base `Archetype::Equipment`. Fits `[Armor]`.

`hit_pts_scale` `f`

**`Archetype::AttachedEquipment`** — 6 own, base `Archetype::Equipment`. Fits `[CargoPod]`, `[CollisionGroup]`, `[Shield]`.

`child_impulse` `f`, `debris_type` `s`, `HP_child` `s`, `parent_impulse` `f`,
`separation_explosion` `s`, `toughness` `i`

**`Archetype::Commodity`** — 3 own, base `Archetype::Equipment`. Fits `[Commodity]`.

`decay_per_second` `f`, `loot_appearance` `s`, `pod_appearance` `s`

**`Archetype::Engine`** — 7 own, base `Archetype::Equipment`. Fits `[Engine]`.

`cruise_charge_time` `f`, `cruise_power_usage` `f`, `indestructible` `b`, `linear_drag` `f`,
`max_force` `f`, `power_usage` `f`, `reverse_fraction` `f`

**`Archetype::InternalFXEquip`** — 1 own, base `Archetype::Equipment`. Fits `[InternalFX]`.

`use_animation` `s`

**`Archetype::Light`** — 2 own, base `Archetype::Equipment`. Fits `[Light]`.

`always_on` `b`, `docking_light` `b`

**`Archetype::Power`** — 4 own, base `Archetype::Equipment`. Fits `[Power]`.

`capacity` `f`, `charge_rate` `f`, `thrust_capacity` `f`, `thrust_charge_rate` `f`

**`Archetype::Projectile`** — 5 own, base `Archetype::Equipment`. Fits `[Motor]`.

`force_gun_ori` `b`, `lifetime` `f`, `loot_appearance` `s`, `owner_safe_time` `f`,
`requires_ammo` `b`

**`Archetype::RepairDroid`** — 1 own, base `Archetype::Equipment`. Fits `[repairdroid]`.

**`repair_rate`⁺** `f`

**`Archetype::RepairKit`** — 1 own, base `Archetype::Equipment` (from its folded twin `ShieldBattery`). Fits `[RepairKit]`.

`loot_appearance` `s`

**`Archetype::Scanner`** — 3 own, base `Archetype::Equipment`. Fits `[Scanner]`.

`cargo_scan_range` `f`, `power_usage` `f`, `range` `f`

**`Archetype::Ship`** — 20 own, base `Archetype::EqObj`. Fits `[ship]`.

`angular_drag` `f f f`, `bay_door_anim` `s`, `hold_size` `f`, `HP_bay_external` `s`,
`HP_bay_surface` `s`, `HP_tractor_source` `s`, `hp_type` `s`, `ids_info1` `i`, `ids_info2` `i`,
`ids_info3` `i`, `linear_drag` `f`, `max_bank_angle` `f`, `nanobot_limit` `i`,
`nudge_force` `f`, `num_exhaust_nozzles` `i`, `shield_battery_limit` `i`, `ship_class` `i`,
`steering_torque` `f f f`, `strafe_force` `f`, `strafe_power_usage` `f`

**`Archetype::Solar`** — 6 own, base `Archetype::EqObj`. Fits `[Solar]`.

`destructible` `b`, `jump_out_hp` `s`, `loadout` `s`, `open_anim` `s`, `solar_radius` `f`,
`toughness` `i`

**`Archetype::Tractor`** — 2 own, base `Archetype::Equipment`. Fits `[Tractor]`.

`max_length` `f`, `reach_speed` `f`

**`Archetype::CloakingDevice`** — 5 own, base `Archetype::AttachedEquipment`. Fits `[CloakingDevice]`.

`cloakin_fx` `s`, `cloakin_time` `f`, `cloakout_fx` `s`, `cloakout_time` `f`,
`power_usage` `f`

**`Archetype::CounterMeasure`** — 3 own, base `Archetype::Projectile`. Fits `[CounterMeasure]`.

`diversion_pctg` `f`, `linear_drag` `f`, `range` `f`

**`Archetype::Launcher`** — 6 own, base `Archetype::AttachedEquipment`. Fits `[MineDropper]`.

`damage_per_fire` `f`, `muzzle_velocity` `f`, `power_usage` `f`, `projectile_archetype` `s`,
`refire_delay` `f`, `use_animation` `s`

**`Archetype::Mine`** — 5 own, base `Archetype::Projectile`. Fits `[Mine]`.

`acceleration` `f`, `detonation_dist` `f`, `linear_drag` `f`, `seek_dist` `f`, `top_speed` `f`

**`Archetype::Munition`** — 13 own, base `Archetype::Projectile`. Fits `[Munition]`.

`cruise_disruptor` `b`, `damage`, `detonation_dist` `f`, `energy_damage` `f`, `hp_type` `s`,
`hull_damage`, `max_angular_velocity` `f`, `Motor` `s`, `seeker` `s`, `seeker_fov_deg` `f`,
`seeker_range` `f`, `time_to_lock` `f`, `weapon_type` `s`

**`Archetype::ShieldGenerator`** — 9 own, base `Archetype::AttachedEquipment`. Fits `[ShieldGenerator]`.

`constant_power_draw` `f`, **`hp_shield_type`⁺** `s?`, `hp_type` `s`, `max_capacity` `f`,
`offline_rebuild_time` `f`, `offline_threshold` `f`, `rebuild_power_draw` `f`,
`regeneration_rate` `f`, `shield_type` `s`

**`Archetype::Thruster`** — 2 own, base `Archetype::AttachedEquipment`. Fits `[Thruster]`.

`max_force` `f`, `power_usage` `f`

**`Archetype::CounterMeasureDropper`** — 1 own, base `Archetype::Launcher`. Fits `[CounterMeasureDropper]`.

`AI_range` `f`

**`Archetype::Gun`** — 6 own, base `Archetype::Launcher`. Fits `[Gun]`.

`auto_turret` `b`, **`dispersion_angle`⁺** `f`, **`gun_azimuth`⁺** `f f`,
**`gun_elevation`⁺** `f f`, `hp_gun_type` `s?`, `turn_rate` `f`

### Function boundaries come from call targets, not exports

Rule A only works if a group stops at the end of its function. Using the export table for that is
fine in `common.dll` (3,856 exports) and useless in `content.dll` (seven), where groups ran on and
gave `[NewsItem]` 134 mission-script keys and `[LOD]` 100 — 31% corroboration.

**Every address that a direct `call` targets is a function start.** Collecting those gives boundaries
in any binary regardless of what it exports, and it is what lifts `content.dll` from 31% to **94%**:

| Binary           | Call targets | Groups | Corroboration |
| ---------------- | ------------ | ------ | ------------- |
| `common.dll`     | 3,307        | 78     | 94%           |
| `content.dll`    | 2,561        | 63     | **94%**       |
| `Freelancer.exe` | 4,003        | 60     | 88%           |
| `server.dll`     | 1,132        | 12     | 100% (n=1)    |

Following the call a header match dispatches to, so a helper's `is_value` calls attach to the section
that selected it, corroborates at only 74% and fails systematically — an unbounded forward scan
crosses into the next `if`, handing `[AvailableShip]` the whole of `[Hotspot]`. Bound the scan: take
the `test al,al` and its `jz` that follow the header call, and stop at the jump target or at any
unconditional `jmp`. That is what established that ten of those sections are obsolete rather than
unread; without the `jmp` terminator `[Lighting]` picks up eighteen properties belonging to the block
after it.

### One consequence worth being clear about

**An unmarked property's read status is a fact about the name, not the name in that section.** `type`
is read somewhere, so it is unmarked wherever it appears — that does not prove the engine reads
`type` in each of the 17 sections that set it. ~~Struck~~ is the strong claim (nothing anywhere
matches this name); plain is the weak one.

## Legend

| Mark          | Meaning                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `name`        | In retail data here; passed to `INI_Reader::is_value`, or traced to its reader by disassembly — **proven read** |
| `name`*       | In retail data here; a literal exists but at no resolved call site                                              |
| ~~`name`~~    | In retail data here; **no literal in any binary** — nothing matches this name                                   |
| **`name`⁺**   | **Not in retail data here** — the engine reads it in this section anyway                                        |
| `[Section]` ‡ | The section header itself is never matched by `is_header`/`find_header`, and no reader has been traced          |

Retail-observed properties come first, most-frequent first; engine-only ones follow, alphabetically.
Spelling is retail's **most common** for that name — **76 names are written more than one way**
(`shape` ×6,270 against `Shape` ×82, `ship` ×874 against `Ship` ×115) and every comparison the game
makes on these names folds case, [`[PerfOptions]`](#perfoptions) excepted, so the variants are one key and the choice here is cosmetic.

**Disassembly corrects the resolver.** The marks come from resolving matcher call sites, and a reader
that calls `is_header` or `is_value` through a register, or compares `get_name_ptr()` itself, is
invisible to that. Where disassembly has since traced a section's reader, the section's marks follow
it and a note under the section gives the addresses. A key such a note says is **not read in that
section** keeps its sweep mark, so the note, not the mark, is the claim.

## Totals

|                                                            |         |
| ---------------------------------------------------------- | ------- |
| Sections                                                   | 289     |
| — in retail data                                           | 280     |
| — engine-only, with properties recovered                   | 9       |
| — engine-only, obsolete (no property read, by design)      | 10      |
| — engine-only, read positionally (no property names exist) | 15      |
| — engine-only, fuse action                                 | 1       |
| Section/property pairs from the data                       | 2,222   |
| Section/property pairs added from the binaries             | **543** |
| Distinct property names in the data                        | 1,375   |
| — proven read                                              | 619     |
| — literal only                                             | 651     |
| — **no literal anywhere**                                  | **105** |
| Property names read but never set anywhere in retail       | 180     |
| — placed into a section                                    | 104     |
| — section undetermined                                     | 76      |

280 against [RETAIL.md](RETAIL.md#what-is-in-it)'s 256 is a sweep difference: that figure counts the
1,251 BINI files alone; this one adds `initialworld.ini`, the three plain-text INIs under `EXE` and
the two `.fl` saves, which contribute the save-game and configuration sections.

These are the resolver sweep's counts. The corrections from disassembly described under
[Legend](#legend) — marks cleared, engine-only keys added, the engine-only `[Lightning]`,
`[ObjectFog]` and `[ThirdPersonCamera]`, and `[PerfOptions]`, `[RearView]` and `[Turret]` moved out
of the positional row — are not folded into them.

## Sections the engine matches that retail never contains

35 of them, recovered from `is_header`/`find_header` call sites — a string handed to a header matcher
is a section name whatever function it sits in. For 24 of the 35, "what are its properties?" has no
answer, in two different ways.

**Twelve are obsolete.** The header is matched only to emit a diagnostic — `*** WARNING: [Cloud] is
obsolete in %s` at `RoomData.cpp:2046` — and then skipped. No property is read, by design. Nine come
from `RoomData.cpp`, two from `Cockpit.cpp` and one from `GoodList.cpp`:

`[AvailableShip]`, `[Billboard]`, `[Cloud]`, `[GoodsCartPlacement]`, `[GoodsPilePlacement]`,
`[GoodType]`, `[Lighting]`, `[MonitorPlacement]`, `[RearView]`, `[RepairRobotPlacement]`,
`[ShipPlacement]`, `[Turret]`

A room file's reader (`RoomData::read_from_ini`, `common.dll` `0x6277400`) also warns and skips
`[Fog]`, `[Effect]` and `[Light]` — names retail uses elsewhere, so they are not among the 35 — and
accepts `[Room]` for `[Room_Info]` and `[Sound]` for `[Room_Sound]`.

**Twelve are read positionally, so they have no property names at all.** Their handler calls the
indexed `INI_Reader::get_value_int(i)` / `get_value_string(i)` accessors and never `is_value` — the
engine walks the values by position and never compares a key. Eleven of the twelve share **one
function** in `content.dll` at `0x070b60`, which makes **50 indexed calls and zero name comparisons**;
these are the mission and save-game blocks the game writes and reads back, where the format is fixed
by order rather than by name:

`[Decloaked]`, `[DynBaseInfo]`, `[DynSysInfo]`, `[Invulnerables]`, `[MarkObj]`, `[MObjective]`,
`[MsnRandEncSave]`, `[MsnShipSave]`, `[MsnSolarSave]`, `[MsnVibeInfo]`, `[MsnWingSave]`,
`[RandomEncounter]`

**Asking which properties `[MsnShipSave]` accepts is the wrong question** — it accepts a sequence, and
a name would not be matched if one were written.

**Ten have recoverable property names** and appear in the table with every property marked ⁺:

`[CollisionConsts]`, `[Display]`, `[Mission01aSave]`, `[Mission01bSave]`, `[PerfCount]`,
`[PerfOptions]`, `[PerfVersion]`, `[RandomMission]`, `[RepairDroid]`, `[ThrusterEquipConsts]`

**One is a fuse action.** `[damage_hp_attachment]` is dispatched in `server.dll` alongside ten other
action blocks — `ignite_fuse`, `destroy_root`, `damage_root`, `destroy_group`, `damage_group`,
`destroy_hp_attachment`, `impulse`, `tumble`, `make_invincible` and `dump_cargo` — and is the only
one of the eleven retail never writes; the next `[fuse]` header ends a fuse, and a block a side does
not know is skipped. The client's loader (`Freelancer.exe` `0x529e10`) reads `[start_effect]`,
`[start_cam_particles]`, `[start_explosion]`, `[impulse]` and `[ignite_fuse]` the same way. Each
action's reader (`ServerFuse::Read`, `0x6dec1d0`, calls them through a vtable) tries
`FuseAction::ReadFuseActionValue` for `at_t` and then matches its own keys by name, so the sweep saw
none of them; the sections below give the addresses. `at_t` is one time on 0–1, or two values as a
range from which each object's copy of the fuse draws once (`common.dll` `0x62bee60`, `0x62beeb0`);
without it a block keeps −1 (`0x62bd787`) and never fires. Of the keys retail writes in these
blocks, `[fuse]`'s `LODranges` and `[destroy_group]`'s `separable`, `dmg_hp` and `dmg_obj` are read
by none of them, and `server.dll` holds none of the last three strings.

## Read, section undetermined

62 property names the engine matches that retail never sets and that no rule could place — the
sweep's 76 less those disassembly has since placed in a section, among them two under
[`[JumpShipEffect]`](#jumpshipeffect), four under [`[Player]`](#player), two under
[`[Object]`](#object), and `fps`, `const_effect_delay` and `turret_sound` under their archetypes.
Almost all come
from `content.dll`'s mission scripting and the executable's interface widgets, where function
boundaries are not recoverable. They are read; which section they belong to is open.

`act_pilotparams`, `act_playerform`, `act_playnn`, `act_relocateform`, `act_repchangerequest`,
`act_setflee`, `act_spawnshiprel`, `active_effect`, `attack_order`, `attacker_rep`, `back_hp`,
`back_mesh`, `back_mouse`, `back_no_mesh_render`, `back_offset`, `cnd_cmptoplane`,
`cnd_jumpgateact`, `cnd_npcsystemexit`, `cnd_rumorheard`, `destroy_parent`, `formation_position`,
`hidden`, `linked_equip`, `max_range`, `min_range`, `nextb_hp`, `nextb_mesh`, `nextb_mouse`,
`nextb_no_mesh_render`, `nextb_offset`, `object_pos`, `object_ypr`, `page_size`, `pilot_id`,
`prevb_hp`, `prevb_mesh`, `prevb_mouse`, `prevb_no_mesh_render`, `prevb_offset`, `rect_color`,
`rot_speed`, `saved_formation`, `show_rect`, `show_wireframe`, `slider_behavior`, `speaker_offset`,
`target_toughness_preference`, `target_tradelane`, `target_tradelane_name`, `thumb_hp0`,
`thumb_hp1`, `thumb_mesh`, `thumb_mouse`, `thumb_no_mesh_render`, `thumb_offset0`, `thumb_offset1`,
`tl_attack_chance`, `tl_attack_chance_read_in`, `trigger`, `vibe`, `viewsize`, `wire_color`

(Five further entries — `*/`, `/*`, `content.dll`, `skipmachinewarnings`, `version` — are
artefacts of the widened argument search described in
[ENGINE.md](ENGINE.md#the-180-keys-retail-never-sets), not keys.)

## Declared value shapes

What the engine asks each property to be, from the accessor it calls after matching the key —
`push 2; call get_value_float` is "index 2 as a float". 542 of the 799 names, recovered as
[ENGINE.md](ENGINE.md#value-shapes) sets out.

**Declared is what the engine coerces to; recorded is what the file holds**, and they differ freely
because [INI.md](../modules/INI.md#how-the-game-reads-a-value)'s reader converts — a `color` of `255, 255, 255`
is integer-typed in the file and read as three floats. Of the 495 positions where both are known, 315
match exactly, 176 are compatible under coercion, and 4 are neither.

**A declared shape is a lower bound.** Values read in a loop rather than at a literal index are not
followed, which is why `hp_type` declares one string and retail writes up to seven values.

**It is also per name rather than per section**, which is right for 531 of the 542 and wrong for 11 —
see [The same name is not always read the same way](#the-same-name-is-not-always-read-the-same-way).

| Mark | |
| --- | --- |
| `f` `i` `s` `b` `w` `v` | float, int, string, bool, wide string, vector |
| position order | left to right, index 0 first |
| `?` | that position is probed with `is_value_empty` — optional |
| `+x` | also read through the index-less accessor |
| `a/b` | different call sites disagree, both recorded |

Recorded types are the commonest per position, one letter each, up to six positions.

| Property                                   | Declared                  | Retail arity           | Recorded |
| ------------------------------------------ | ------------------------- | ---------------------- | -------- |
| `accel`                                    | `f`                       | 1×76                   | `f`      |
| `acceleration`                             | `f`                       | 1×10                   | `i`      |
| `accessory`                                | `s`                       | 1×232                  | `s`      |
| `action`                                   | `s`                       | 1×43                   | `s`      |
| `activation_type`                          | `f f f f +s`              | 3×6, 5×1               | `siiii`  |
| `active_effect`                            | `s`                       | —                      | `—`      |
| `addon`                                    | `s s i s?`                | 3×507                  | `ssi`    |
| `ai_range`                                 | `f`                       | 1×3                    | `i`      |
| `always_on`                                | `b`                       | 1×2                    | `s`      |
| `ambient`                                  | `s s?`                    | 1×436, 3×64, 2×2       | `sii`    |
| `angular_drag`                             | `f f f`                   | 3×110                  | `fff`    |
| `angular_velocity`                         | `f f f`                   | —                      | `—`      |
| `anim`                                     | `s`                       | 1×28, 3×19             | `sii`    |
| `animated_textures`                        | `b`                       | 1×1                    | `s`      |
| `animation`                                | `s`                       | 1×162, 0×2             | `s`      |
| `animation_oneshot`                        | `s`                       | —                      | `—`      |
| `anom_limits_max_angular_velocity_per_psi` | `f`                       | —                      | `—`      |
| `anom_limits_max_velocity`                 | `f`                       | —                      | `—`      |
| `archetype`                                | `s`                       | 1×4563                 | `s`      |
| `asteroid`                                 | `f f f +s`                | 7×740, 1×145, 8×70     | `sfffii` |
| `asteroids`                                | `s`                       | 1×1                    | `s`      |
| `at_t`                                     | `f f?`                    | 1×1907, 2×17           | `ff`     |
| `atmosphere_range`                         | `f`                       | 1×127                  | `i`      |
| `attached`                                 | `b`                       | 1×938                  | `s`      |
| `attachment_archetype`                     | `s`                       | —                      | `—`      |
| `attacker_rep`                             | `i`                       | —                      | `—`      |
| `attacker_rep_name`                        | `s`                       | 1×7                    | `s`      |
| `auto_turret`                              | `b`                       | 1×513                  | `s`      |
| `autosave_forbidden`                       | `b`                       | 1×4                    | `s`      |
| `back_hp`                                  | `s`                       | —                      | `—`      |
| `back_mesh`                                | `s`                       | —                      | `—`      |
| `back_mouse`                               | `f f`                     | —                      | `—`      |
| `back_no_mesh_render`                      | `f`                       | —                      | `—`      |
| `back_offset`                              | `f f`                     | —                      | `—`      |
| `backdrop`                                 | `s`                       | 1×1                    | `s`      |
| `bad_buy_price`                            | `f`                       | 1×40                   | `f`      |
| `bad_sell_price`                           | `f`                       | 1×40                   | `f`      |
| `base`                                     | `s`                       | 1×5741                 | `s`      |
| `bay_door_anim`                            | `s`                       | 1×44                   | `s`      |
| `behavior`                                 | `s`                       | 1×5346, 0×1            | `s`      |
| `bgcs_base_run_by`                         | `s`                       | 1×169                  | `s`      |
| `billboard_count`                          | `f`                       | 1×2                    | `i`      |
| `blink`                                    | `f`                       | 1×857                  | `f`      |
| `body`                                     | `s`                       | 1×1728                 | `s`      |
| `body.anim`                                | `s`                       | 1×1                    | `s`      |
| `body_hardpoint`                           | `s`                       | 1×106                  | `s`      |
| `bodyparts`                                | `s`                       | 1×1                    | `s`      |
| `bold`                                     | `b`                       | 1×15                   | `s`      |
| `bonuslootdropchance`                      | `f`                       | 1×1                    | `f`      |
| `can_dock`                                 | `b`                       | —                      | `—`      |
| `can_jettison`                             | `b`                       | 1×4                    | `s`      |
| `can_tl`                                   | `b`                       | —                      | `—`      |
| `capacity`                                 | `f`                       | 1×164                  | `i`      |
| `cargo_scan_range`                         | `f`                       | 1×2                    | `i`      |
| `category`                                 | `s`                       | 1×1258                 | `s`      |
| `charge_rate`                              | `f`                       | 1×164                  | `i`      |
| `chatter_max_dist`                         | `f`                       | 1×1                    | `f`      |
| `chatter_max_dist_atten`                   | `f`                       | 1×1                    | `f`      |
| `chatter_start_atten`                      | `f`                       | 1×1                    | `f`      |
| `child_impulse`                            | `f`                       | 1×1146                 | `i`      |
| `child_node`                               | `i`                       | 1×309                  | `i`      |
| `cloakin_fx`                               | `s`                       | 1×9                    | `s`      |
| `cloakin_time`                             | `f`                       | 1×9                    | `i`      |
| `cloakout_fx`                              | `s`                       | 1×9                    | `s`      |
| `cloakout_time`                            | `f`                       | 1×9                    | `i`      |
| `close_sound`                              | `s`                       | 1×36                   | `s`      |
| `cnd_npcsystementer`                       | `—`                       | 2×7, 3×5, 6×5          | `ssssss` |
| `cnd_npcsystemexit`                        | `s`                       | —                      | `—`      |
| `collision_damage_factor`                  | `f`                       | 1×1                    | `f`      |
| `color`                                    | `f f f`                   | 3×443, 4×6             | `iiii`   |
| `combinable`                               | `b`                       | 1×792                  | `s`      |
| `comm`                                     | `s`                       | 1×1                    | `s`      |
| `comm.anim`                                | `s`                       | 2×1                    | `ss`     |
| `comm_appr`                                | `s`                       | —                      | `—`      |
| `comm_conflict_priority_cutoff`            | `f`                       | 1×1                    | `i`      |
| `comm_player_far_dist`                     | `f`                       | 1×1                    | `f`      |
| `comm_player_far_dist_atten`               | `f`                       | 1×1                    | `f`      |
| `const_effect`                             | `s`                       | 1×526                  | `s`      |
| `const_effect_delay`                       | `f`                       | —                      | `—`      |
| `constant_power_draw`                      | `f`                       | 1×126                  | `i`      |
| `constants`                                | `s`                       | 1×1                    | `s`      |
| `content.dll`                              | `i`                       | —                      | `—`      |
| `costumes`                                 | `s`                       | 1×1                    | `s`      |
| `count`                                    | `f`                       | 1×244                  | `i`      |
| `cruise_accel_time`                        | `f`                       | —                      | `—`      |
| `cruise_atten_mod_range`                   | `f`                       | 1×1                    | `f`      |
| `cruise_charge_time`                       | `f`                       | 1×60                   | `i`      |
| `cruise_disrupt_time`                      | `f`                       | 1×1                    | `i`      |
| `cruise_disruptor`                         | `b`                       | 1×3                    | `s`      |
| `cruise_drag`                              | `f`                       | —                      | `—`      |
| `cruise_power_usage`                       | `f`                       | 1×60                   | `i`      |
| `cruise_steady_time`                       | `f`                       | 1×1                    | `f`      |
| `cruising_speed`                           | `f`                       | —                      | `—`      |
| `cutoff_shadow_z`                          | `f`                       | —                      | `—`      |
| `damage`                                   | `s f`                     | 1×185                  | `i`      |
| `damage_per_fire`                          | `f`                       | 1×523                  | `i`      |
| `death_fuse`                               | `b`                       | 1×105                  | `s`      |
| `debris_impulse`                           | `f`                       | 1×49                   | `i`      |
| `debris_type`                              | `s i?`                    | 1×1156, 2×133          | `sf`     |
| `decay_per_second`                         | `f`                       | 1×105                  | `i`      |
| `default_angular_damping`                  | `f`                       | 3×1                    | `fff`    |
| `default_linear_damping`                   | `f`                       | 1×1                    | `f`      |
| `delay`                                    | `f`                       | 1×165                  | `i`      |
| `delta_cruise_atten_mod_steady`            | `f`                       | 1×1                    | `f`      |
| `delta_throttle_atten_mod_changing`        | `f`                       | 1×1                    | `f`      |
| `delta_throttle_atten_mod_steady`          | `f`                       | 1×1                    | `f`      |
| `descrip_strid`                            | `i`                       | —                      | `—`      |
| `destroy_parent`                           | `—`                       | —                      | `—`      |
| `destructible`                             | `b`                       | 1×77                   | `s`      |
| `detect_radius`                            | `f`                       | 1×9                    | `i`      |
| `detonation_dist`                          | `f`                       | 1×86                   | `i`      |
| `diff2money`                               | `f`                       | 2×23                   | `fi`     |
| `difficulty_range`                         | `f`                       | 2×143                  | `ii`     |
| `dispersion_angle`                         | `f`                       | —                      | `—`      |
| `distance_render`                          | `f`                       | 1×4                    | `i`      |
| `diversion_pctg`                           | `f`                       | 1×3                    | `i`      |
| `dmg_obj`                                  | `s`                       | 1×323                  | `s`      |
| `dock_with`                                | `s`                       | 1×260                  | `s`      |
| `docking_camera`                           | `b`                       | 1×44                   | `i`      |
| `docking_light`                            | `b`                       | 1×2                    | `s`      |
| `docking_sphere`                           | `s s f s?`                | 3×162, 4×102           | `ssfs`   |
| `drag_modifier`                            | `f`                       | 1×1                    | `f`      |
| `dry_fire_sound`                           | `s`                       | 1×29                   | `s`      |
| `dynamic_loot_commodity`                   | `s`                       | 1×80                   | `s`      |
| `dynamic_loot_container`                   | `s`                       | 1×80                   | `s`      |
| `dynamic_loot_count`                       | `f f`                     | 2×80                   | `ii`     |
| `dynamic_loot_difficulty`                  | `f`                       | 1×80                   | `i`      |
| `edge_fraction`                            | `f`                       | 1×144                  | `f`      |
| `effect`                                   | `s f?`                    | 1×1447, 2×31           | `sf`     |
| `empty_cube_frequency`                     | `f`                       | 1×152                  | `f`      |
| `encounter_type`                           | `s`                       | 1×7                    | `s`      |
| `endpause`                                 | `f`                       | 1×786                  | `f`      |
| `energy_damage`                            | `f`                       | 1×523                  | `i`      |
| `envmap_material`                          | `s`                       | 1×178                  | `s`      |
| `equip_amount`                             | `i`                       | 1×4                    | `i`      |
| `equipment`                                | `s`                       | 1×821                  | `s`      |
| `exclude_billboards`                       | `f`                       | 1×165                  | `i`      |
| `exclude_dynamic_asteroids`                | `f`                       | 1×11                   | `i`      |
| `exclusion`                                | `s`                       | 1×634                  | `s`      |
| `exclusion_tint`                           | `f f f`                   | 3×43                   | `iii`    |
| `explosion_arch`                           | `s`                       | 1×310                  | `s`      |
| `explosion_offset`                         | `f`                       | 1×9                    | `i`      |
| `explosion_resistance`                     | `f`                       | 1×655                  | `f`      |
| `explosions`                               | `s`                       | 1×1                    | `s`      |
| `exterior_sound_name`                      | `s`                       | —                      | `—`      |
| `extra_shadow_height_offset`               | `f`                       | —                      | `—`      |
| `faction`                                  | `s f`                     | 2×7156, 1×983, 17×43   | `sfssss` |
| `female_speaker_offset`                    | `f f`                     | 3×1                    | `iff`    |
| `file`                                     | `s`                       | 1×3095                 | `s`      |
| `fire_failed_delay`                        | `f`                       | —                      | `—`      |
| `fire_failed_sound`                        | `s`                       | —                      | `—`      |
| `flash_particle_name`                      | `s`                       | 1×445                  | `s`      |
| `flash_radius`                             | `f`                       | 1×447                  | `i`      |
| `flee_when_hull_damaged_percent`           | `f`                       | 1×51                   | `f`      |
| `fog_far`                                  | `f`                       | 1×100                  | `i`      |
| `font`                                     | `s +i`                    | 1×36, 3×8              | `isi`    |
| `force_gun_ori`                            | `b`                       | 1×529                  | `s`      |
| `formation`                                | `f f/s?`                  | 1×190, 2×158, 6×7      | `ssiisi` |
| `formation_position`                       | `f`                       | —                      | `—`      |
| `fovx`                                     | `f`                       | 1×4                    | `i`      |
| `fps`                                      | `f`                       | —                      | `—`      |
| `frame`                                    | `f f f f f`               | 5×72                   | `fiiif`  |
| `free_ammo`                                | `s i`                     | 2×32                   | `si`     |
| `fuse`                                     | `s f f`                   | 3×553, 1×74            | `sfi`    |
| `fuses`                                    | `s`                       | 1×16                   | `s`      |
| `gap`                                      | `f`                       | 1×226                  | `f`      |
| `generic_priority`                         | `f`                       | 1×45                   | `f`      |
| `golem_angular_damp_factor`                | `f`                       | —                      | `—`      |
| `golem_child_angular_damp`                 | `f f`                     | —                      | `—`      |
| `golem_child_linear_damp`                  | `f`                       | —                      | `—`      |
| `golem_child_mass`                         | `f`                       | —                      | `—`      |
| `golem_damp_factor`                        | `f`                       | —                      | `—`      |
| `golem_delta_orientation`                  | `f`                       | —                      | `—`      |
| `golem_force_factor`                       | `f`                       | —                      | `—`      |
| `golem_max_delta_position`                 | `f`                       | —                      | `—`      |
| `golem_max_torque`                         | `f`                       | —                      | `—`      |
| `golem_max_translation_force`              | `f f`                     | —                      | `—`      |
| `golem_torque_factor`                      | `f`                       | —                      | `—`      |
| `good_buy_price`                           | `f`                       | 1×40                   | `f`      |
| `good_sell_price`                          | `f`                       | 1×40                   | `f`      |
| `goods`                                    | `s`                       | 1×5                    | `s`      |
| `goodscart_script`                         | `s?`                      | 1×19                   | `s`      |
| `goto`                                     | `s s`                     | 3×239                  | `sss`    |
| `group`                                    | `s`                       | 1×55                   | `s`      |
| `group_dmg_hp`                             | `s`                       | 1×46                   | `s`      |
| `group_dmg_obj`                            | `s`                       | 1×46                   | `s`      |
| `groups`                                   | `s`                       | 1×1                    | `s`      |
| `gun_azimuth`                              | `f f`                     | —                      | `—`      |
| `gun_elevation`                            | `f f`                     | —                      | `—`      |
| `hardpoint`                                | `s`                       | 1×7436, 0×14           | `s`      |
| `health`                                   | `f`                       | 1×4                    | `f`      |
| `hidden`                                   | `b`                       | —                      | `—`      |
| `hit_pts`                                  | `f/i`                     | 1×2219                 | `i`      |
| `hit_pts_scale`                            | `f`                       | 1×24                   | `f`      |
| `hold_size`                                | `f`                       | 1×69                   | `i`      |
| `house`                                    | `s +f`                    | 2×110                  | `fs`     |
| `hp_bay_external`                          | `s`                       | 1×64                   | `s`      |
| `hp_bay_surface`                           | `s`                       | 1×64                   | `s`      |
| `hp_child`                                 | `s`                       | 1×718                  | `s`      |
| `hp_gun_type`                              | `s?`                      | 1×266                  | `s`      |
| `hp_particles`                             | `s`                       | 1×6                    | `s`      |
| `hp_shield_type`                           | `s?`                      | —                      | `—`      |
| `hp_tractor_source`                        | `s`                       | 1×68                   | `s`      |
| `hp_trail_parent`                          | `s`                       | 1×76                   | `s`      |
| `hp_type`                                  | `s`                       | 1×636, 2×461, 7×101    | `ssssss` |
| `hull`                                     | `s`                       | 1×31                   | `s`      |
| `hull_damage`                              | `f`                       | 1×530                  | `f`      |
| `hull_damage_factor`                       | `f`                       | 1×1                    | `f`      |
| `icolor`                                   | `f f f`                   | 3×857                  | `iii`    |
| `id`                                       | `s`                       | 1×92                   | `s`      |
| `ids_info`                                 | `f/i`                     | 1×4994                 | `i`      |
| `ids_info1`                                | `i`                       | 1×33                   | `i`      |
| `ids_info2`                                | `i`                       | 1×33                   | `i`      |
| `ids_info3`                                | `i`                       | 1×33                   | `i`      |
| `ids_name`                                 | `i`                       | 1×5094                 | `i`      |
| `ids_short_name`                           | `f`                       | 1×55                   | `i`      |
| `implemented`                              | `b`                       | 1×4                    | `s`      |
| `impulse`                                  | `f`                       | 1×86                   | `i`      |
| `indestructible`                           | `b`                       | 1×60                   | `s`      |
| `inherit`                                  | `s`                       | 1×348                  | `s`      |
| `initstate`                                | `s`                       | 1×16                   | `s`      |
| `innards_debris_num`                       | `f`                       | 1×22                   | `i`      |
| `innards_debris_object`                    | `s`                       | 1×109                  | `s`      |
| `innards_debris_radius`                    | `f`                       | 1×22                   | `i`      |
| `innards_debris_start_time`                | `f`                       | 1×47                   | `f`      |
| `inside_cone_angle`                        | `f`                       | —                      | `—`      |
| `inside_sound_cone`                        | `f`                       | 1×60                   | `i`      |
| `intensity_fade_in`                        | `f`                       | 1×36                   | `i`      |
| `intensity_fade_out`                       | `f`                       | 1×36                   | `i`      |
| `interference`                             | `f`                       | 1×59                   | `f`      |
| `interior_sound_name`                      | `s`                       | —                      | `—`      |
| `italic`                                   | `b`                       | 1×15                   | `s`      |
| `item_icon`                                | `s`                       | 1×762                  | `s`      |
| `jettisoned_cargo_velocity`                | `f`                       | —                      | `—`      |
| `jump_dist`                                | `i`                       | 1×40                   | `i`      |
| `jump_out_hp`                              | `s`                       | 1×9                    | `s`      |
| `justify`                                  | `s`                       | 1×1                    | `s`      |
| `key`                                      | `s`                       | 1×225, 2×49            | `ss`     |
| `label`                                    | `s`                       | 1×2165                 | `s`      |
| `landing_script`                           | `s`                       | 1×29                   | `s`      |
| `launching_script`                         | `s`                       | 1×29                   | `s`      |
| `lens_flare`                               | `s`                       | 1×32                   | `s`      |
| `lens_glow`                                | `s`                       | 1×34                   | `s`      |
| `lifetime`                                 | `f f?`                    | 1×834, 2×174           | `ff`     |
| `light_anim`                               | `s`                       | 1×457                  | `s`      |
| `linear_drag`                              | `f`                       | 1×183                  | `f`      |
| `linked_equip`                             | `s f`                     | —                      | `—`      |
| `loadout`                                  | `s`                       | 1×2617                 | `s`      |
| `loadouts`                                 | `s`                       | 1×4                    | `s`      |
| `local_faction`                            | `s`                       | 1×248                  | `s`      |
| `location`                                 | `i`                       | 2×68                   | `ss`     |
| `log`                                      | `s`                       | 2×7, 3×2               | `ssi`    |
| `loot_appearance`                          | `s`                       | 1×139                  | `s`      |
| `loot_owner_safe_time`                     | `f`                       | —                      | `—`      |
| `loot_unseen_life_time`                    | `f`                       | —                      | `—`      |
| `loot_unseen_radius`                       | `f`                       | —                      | `—`      |
| `lootable`                                 | `b`                       | 1×692                  | `s`      |
| `male_speaker_offset`                      | `f f`                     | 3×1                    | `iff`    |
| `maneuver`                                 | `s`                       | 5×4                    | `siiss`  |
| `map`                                      | `f f f? f? f?`            | 3×4752, 2×472          | `isi`    |
| `marketgood`                               | `f? f? i? i? i? f? f? +s` | 7×12865, 8×1829, 3×626 | `siiiii` |
| `markets`                                  | `s`                       | 1×3                    | `s`      |
| `mass`                                     | `f`                       | 1×2422                 | `i`      |
| `material_elasticity`                      | `f`                       | 1×1                    | `f`      |
| `material_friction`                        | `f`                       | 1×1                    | `f`      |
| `material_library`                         | `i/s?`                    | 1×2660                 | `s`      |
| `max_alpha`                                | `f`                       | 1×94                   | `f`      |
| `max_angular_velocity`                     | `f`                       | 1×216                  | `f`      |
| `max_bank_angle`                           | `f`                       | 1×36                   | `i`      |
| `max_capacity`                             | `f`                       | 1×126                  | `i`      |
| `max_delta_fx_throttle`                    | `f`                       | 1×1                    | `f`      |
| `max_engine_fx_throttle`                   | `f`                       | —                      | `—`      |
| `max_force`                                | `f`                       | 1×66                   | `i`      |
| `max_impact_speed`                         | `f`                       | —                      | `—`      |
| `max_length`                               | `f`                       | 1×1                    | `i`      |
| `max_player_ammo`                          | `f`                       | —                      | `—`      |
| `max_range`                                | `f`                       | —                      | `—`      |
| `max_spawned_mindist_count`                | `f`                       | —                      | `—`      |
| `max_volume_force`                         | `f`                       | —                      | `—`      |
| `maximum_leader_target_distance`           | `f`                       | 1×32                   | `i`      |
| `mesh`                                     | `s`                       | 1×355, 0×1             | `s`      |
| `min_range`                                | `f`                       | —                      | `—`      |
| `min_time_between_collisions`              | `f`                       | —                      | `—`      |
| `min_volume_force`                         | `f`                       | —                      | `—`      |
| `mission_offer`                            | `i`                       | 1×4                    | `i`      |
| `mission_property`                         | `s`                       | 1×65                   | `s`      |
| `mission_title`                            | `i`                       | 1×4                    | `i`      |
| `money`                                    | `f`                       | 1×3                    | `i`      |
| `motor`                                    | `s`                       | 1×76                   | `s`      |
| `msg_id_prefix`                            | `s`                       | 1×609                  | `s`      |
| `munition_hit_effect`                      | `s`                       | 1×434                  | `s`      |
| `music`                                    | `s s?`                    | 1×341, 2×22            | `ss`     |
| `music_cross_fade_delay`                   | `f`                       | 1×1                    | `f`      |
| `muzzle_cone_angle`                        | `f`                       | 1×1                    | `i`      |
| `muzzle_velocity`                          | `f`                       | 1×526                  | `i`      |
| `name`                                     | `i +s`                    | 1×5050                 | `s`      |
| `nanobot_limit`                            | `i`                       | 1×31                   | `i`      |
| `navmapscale`                              | `f`                       | 1×37                   | `i`      |
| `newchardb`                                | `s`                       | 1×1                    | `s`      |
| `next_ring`                                | `s`                       | 1×925                  | `s`      |
| `nextb_hp`                                 | `s`                       | —                      | `—`      |
| `nextb_mesh`                               | `s`                       | —                      | `—`      |
| `nextb_mouse`                              | `f f`                     | —                      | `—`      |
| `nextb_no_mesh_render`                     | `f`                       | —                      | `—`      |
| `nextb_offset`                             | `f f`                     | —                      | `—`      |
| `nickname`                                 | `f/s f f f f f`           | 1×31412                | `s`      |
| `no_z_enable`                              | `f`                       | 1×13                   | `i`      |
| `node_id`                                  | `i`                       | 1×239                  | `i`      |
| `nomad`                                    | `b`                       | 1×4                    | `s`      |
| `nooffer_text_id`                          | `i`                       | 1×10                   | `i`      |
| `npc_class`                                | `—`                       | 3×254, 2×229, 1×35     | `ssssss` |
| `npc_ship_file`                            | `s`                       | 1×14                   | `s`      |
| `npcrank`                                  | `f? +i`                   | 9×17, 2×6, 7×1         | `ifffff` |
| `nudge_force`                              | `f`                       | 1×69                   | `f`      |
| `num_child_pieces`                         | `f`                       | 1×24                   | `i`      |
| `num_exhaust_nozzles`                      | `i`                       | 1×69                   | `i`      |
| `num_to_drop`                              | `—`                       | 2×164, 1×103           | `ii`     |
| `numlights`                                | `f`                       | 1×49                   | `i`      |
| `obj`                                      | `s`                       | 1×872                  | `s`      |
| `object`                                   | `s`                       | 1×1                    | `s`      |
| `object_pos`                               | `f f f`                   | —                      | `—`      |
| `object_ypr`                               | `f f f`                   | —                      | `—`      |
| `offline_rebuild_time`                     | `f`                       | 1×126                  | `i`      |
| `offline_threshold`                        | `f`                       | 1×126                  | `f`      |
| `offset`                                   | `f f f`                   | 3×13                   | `fff`    |
| `one_shot_sound`                           | `s`                       | 1×526                  | `s`      |
| `open_anim`                                | `s`                       | 1×2                    | `s`      |
| `open_sound`                               | `s`                       | 1×36                   | `s`      |
| `operating_effect`                         | `s`                       | 1×1                    | `s`      |
| `orientation`                              | `f f? f f`                | 4×332                  | `ffff`   |
| `outside_cone_angle`                       | `f`                       | —                      | `—`      |
| `outside_cone_attenuation`                 | `f`                       | 1×60                   | `i`      |
| `outside_sound_cone`                       | `f`                       | 1×60                   | `i`      |
| `owner_safe_time`                          | `f`                       | 1×13                   | `i`      |
| `package`                                  | `s`                       | 1×1                    | `s`      |
| `page_size`                                | `f`                       | —                      | `—`      |
| `parent`                                   | `s`                       | 1×269                  | `s`      |
| `parent_impulse`                           | `f`                       | 1×1118                 | `i`      |
| `particle_effect`                          | `s`                       | 1×3                    | `s`      |
| `particles`                                | `s`                       | 1×61                   | `s`      |
| `path`                                     | `s?`                      | 8×924, 7×865, 9×846    | `ssssss` |
| `pbubble`                                  | `f f`                     | 2×45                   | `ii`     |
| `permutation`                              | `s`                       | 2×54, 3×2              | `iii`    |
| `petaldb`                                  | `s`                       | 1×1                    | `s`      |
| `phantom_physics`                          | `b`                       | 1×10                   | `s`      |
| `physical_sim_rate`                        | `f`                       | —                      | `—`      |
| `pilot`                                    | `s`                       | 1×2208                 | `s`      |
| `pilot_id`                                 | `i`                       | —                      | `—`      |
| `player_attached_equip_hit_pts_scale`      | `f`                       | 1×1                    | `i`      |
| `player_collision_group_hit_pts_scale`     | `f`                       | 1×1                    | `i`      |
| `pod_appearance`                           | `s`                       | 1×102                  | `s`      |
| `point`                                    | `f f`                     | 2×56                   | `ii`     |
| `pos`                                      | `f f f?`                  | 3×10087, 9×71, 2×53    | `iiiifi` |
| `pos_offset`                               | `f f f`                   | 3×990                  | `iii`    |
| `position`                                 | `f f f`                   | 3×520                  | `iii`    |
| `power_usage`                              | `f`                       | 1×575                  | `i`      |
| `preload`                                  | `s`                       | —                      | `—`      |
| `prev_ring`                                | `s`                       | 1×925                  | `s`      |
| `prevb_hp`                                 | `s`                       | —                      | `—`      |
| `prevb_mesh`                               | `s`                       | —                      | `—`      |
| `prevb_mouse`                              | `f f`                     | —                      | `—`      |
| `prevb_no_mesh_render`                     | `f`                       | —                      | `—`      |
| `prevb_offset`                             | `f f`                     | —                      | `—`      |
| `price`                                    | `i`                       | 1×824                  | `i`      |
| `price_variance`                           | `f`                       | —                      | `—`      |
| `priority`                                 | `f`                       | 1×17021                | `i`      |
| `process`                                  | `s`                       | 1×156                  | `s`      |
| `projectile_archetype`                     | `s`                       | 1×526                  | `s`      |
| `property_flags`                           | `i`                       | 1×835                  | `i`      |
| `property_fog_color`                       | `f f`                     | 3×182                  | `fff`    |
| `radius`                                   | `f`                       | 1×649                  | `i`      |
| `range`                                    | `f`                       | 2×369, 1×157           | `ii`     |
| `rank`                                     | `i`                       | 2×403, 1×2             | `ss`     |
| `rank_diff`                                | `s`                       | 2×9                    | `sf`     |
| `rc_max_delta_orientation`                 | `f`                       | —                      | `—`      |
| `rc_max_delta_position`                    | `f`                       | —                      | `—`      |
| `reach_speed`                              | `f`                       | 1×1                    | `i`      |
| `real_pos`                                 | `f f`                     | —                      | `—`      |
| `rebuild_power_draw`                       | `f`                       | 1×126                  | `i`      |
| `recharge_time`                            | `f`                       | 1×13                   | `f`      |
| `rect_color`                               | `f f f f`                 | —                      | `—`      |
| `refire_delay`                             | `f`                       | 1×526                  | `f`      |
| `regeneration_rate`                        | `f`                       | 1×126                  | `f`      |
| `rel_pos_obj`                              | `s`                       | 1×3                    | `s`      |
| `rel_pos_offset`                           | `f f f`                   | 3×3                    | `iii`    |
| `rep`                                      | `s`                       | 2×3025                 | `is`     |
| `rep_group`                                | `s`                       | 1×1                    | `s`      |
| `repair_rate`                              | `f`                       | —                      | `—`      |
| `repeatable`                               | `b`                       | 1×35                   | `s`      |
| `reputation`                               | `s`                       | 1×2124                 | `s`      |
| `requires_ammo`                            | `b`                       | 1×526                  | `s`      |
| `reverse_fraction`                         | `f`                       | 1×60                   | `f`      |
| `reward`                                   | `i`                       | 1×1                    | `i`      |
| `rmgr_look_ahead_max_distance_intra`       | `f`                       | —                      | `—`      |
| `rmgr_look_ahead_max_distance_world`       | `f`                       | —                      | `—`      |
| `rmgr_look_ahead_max_radius_intra`         | `f`                       | —                      | `—`      |
| `rmgr_look_ahead_max_radius_world`         | `f`                       | —                      | `—`      |
| `rmgr_look_ahead_min_distance_intra`       | `f`                       | —                      | `—`      |
| `rmgr_look_ahead_min_distance_world`       | `f`                       | —                      | `—`      |
| `rmgr_look_ahead_min_seconds_intra`        | `f`                       | —                      | `—`      |
| `rmgr_look_ahead_min_seconds_world`        | `f`                       | —                      | `—`      |
| `rmgr_look_ahead_time_intra`               | `f`                       | —                      | `—`      |
| `rmgr_look_ahead_time_world`               | `f`                       | —                      | `—`      |
| `room_switch`                              | `s`                       | 1×1879                 | `s`      |
| `root_health_proxy`                        | `b`                       | 1×329                  | `s`      |
| `rot_speed`                                | `f f f`                   | —                      | `—`      |
| `rotate`                                   | `f f f`                   | 3×6229                 | `iii`    |
| `rotation_inertia`                         | `f f f`                   | 3×71                   | `fff`    |
| `rpop_solar_detection`                     | `b`                       | 1×1                    | `s`      |
| `rtcslider`                                | `s`                       | 1×1                    | `s`      |
| `run_time`                                 | `f`                       | 1×45                   | `i`      |
| `scale`                                    | `f`                       | 1×921                  | `f`      |
| `seek_dist`                                | `f`                       | 1×10                   | `i`      |
| `seeker`                                   | `s`                       | 1×76                   | `s`      |
| `seeker_fov_deg`                           | `f`                       | 1×71                   | `i`      |
| `seeker_range`                             | `f`                       | 1×71                   | `i`      |
| `separation_explosion`                     | `s`                       | 1×761                  | `s`      |
| `set`                                      | `s? f?`                   | 2×38                   | `sf`     |
| `set_less`                                 | `s? f?`                   | 2×4                    | `sf`     |
| `set_script`                               | `s`                       | 1×443                  | `s`      |
| `set_virtual_room`                         | `s`                       | 1×350                  | `s`      |
| `setpoint`                                 | `s`                       | —                      | `—`      |
| `sex`                                      | `s`                       | 1×7                    | `s`      |
| `shape`                                    | `s`                       | 1×6270                 | `s`      |
| `shape_name`                               | `s`                       | 1×362                  | `s`      |
| `shell_scalar`                             | `f`                       | 1×25                   | `f`      |
| `shield_battery_limit`                     | `i`                       | 1×31                   | `i`      |
| `shield_collapse_particle`                 | `s`                       | 1×3                    | `s`      |
| `shield_collapse_sound`                    | `s`                       | 1×126                  | `s`      |
| `shield_hit_effects`                       | `f/s`                     | 2×372                  | `is`     |
| `shield_link`                              | `s?`                      | 3×43                   | `sss`    |
| `shield_mod`                               | `f +s`                    | 2×189                  | `sf`     |
| `shield_rebuilt_sound`                     | `s`                       | 1×126                  | `s`      |
| `shield_type`                              | `s`                       | 1×121                  | `s`      |
| `ship`                                     | `s`                       | 1×874                  | `s`      |
| `ship_class`                               | `i`                       | 1×33                   | `i`      |
| `ship_lrg_01`                              | `s`                       | —                      | `—`      |
| `ship_lrg_02`                              | `s`                       | —                      | `—`      |
| `ship_lrg_03`                              | `s`                       | —                      | `—`      |
| `ship_mdm_01`                              | `s`                       | —                      | `—`      |
| `ship_mdm_02`                              | `s`                       | —                      | `—`      |
| `ship_mdm_03`                              | `s`                       | —                      | `—`      |
| `ship_repair_cost`                         | `f`                       | —                      | `—`      |
| `ship_sml_01`                              | `s`                       | —                      | `—`      |
| `ship_sml_02`                              | `s`                       | —                      | `—`      |
| `ship_sml_03`                              | `s`                       | —                      | `—`      |
| `ships`                                    | `s`                       | 1×2                    | `s`      |
| `shop_archetype`                           | `s`                       | 1×727                  | `s`      |
| `show_rect`                                | `f`                       | —                      | `—`      |
| `show_wireframe`                           | `f`                       | —                      | `—`      |
| `size`                                     | `f?`                      | 2×3410, 1×1877, 3×593  | `iii`    |
| `sizex`                                    | `f`                       | —                      | `—`      |
| `skipmachinewarnings`                      | `b`                       | —                      | `—`      |
| `slider_behavior`                          | `f`                       | —                      | `—`      |
| `snd_cargo_jettisoned`                     | `s`                       | —                      | `—`      |
| `solar`                                    | `s`                       | 1×21                   | `s`      |
| `solar_radius`                             | `f`                       | 1×316                  | `i`      |
| `space`                                    | `s`                       | 1×54                   | `s`      |
| `space_costume`                            | `s?`                      | 3×699, 2×195           | `sss`    |
| `spacedust`                                | `s`                       | 1×324                  | `s`      |
| `spacedust_maxparticles`                   | `i`                       | 1×262                  | `i`      |
| `speaker_rotate`                           | `f f`                     | 3×1                    | `iii`    |
| `spin`                                     | `f f f`                   | 3×66, 1×10             | `iii`    |
| `spines`                                   | `s`                       | 1×29                   | `s`      |
| `star_glow`                                | `s`                       | 1×38                   | `s`      |
| `start_room`                               | `s`                       | 1×215                  | `s`      |
| `start_script`                             | `s`                       | 1×208                  | `s`      |
| `state_read`                               | `f`                       | 1×961                  | `i`      |
| `state_send`                               | `f`                       | 1×961                  | `i`      |
| `steering_torque`                          | `f f f`                   | 3×69                   | `fff`    |
| `strafe_force`                             | `f`                       | 1×34                   | `i`      |
| `strafe_power_usage`                       | `f`                       | 1×34                   | `i`      |
| `strid_desc`                               | `f`                       | 1×1                    | `i`      |
| `strid_name`                               | `f/i`                     | 1×251                  | `i`      |
| `string_id`                                | `i`                       | 1×242                  | `i`      |
| `surface_hit_effects`                      | `s? +f`                   | 4×207, 2×53            | `isss`   |
| `switch`                                   | `f f`                     | 2×42                   | `if`     |
| `system`                                   | `s`                       | 1×2436, 0×2            | `s`      |
| `target_ship_name`                         | `s`                       | 1×6                    | `s`      |
| `target_tradelane`                         | `i`                       | —                      | `—`      |
| `target_tradelane_name`                    | `s`                       | —                      | `—`      |
| `terrain_dyna_01`                          | `s`                       | 1×32                   | `s`      |
| `terrain_dyna_02`                          | `s`                       | 1×32                   | `s`      |
| `terrain_lrg`                              | `s`                       | 1×51                   | `s`      |
| `terrain_mdm`                              | `s`                       | 1×51                   | `s`      |
| `terrain_sml`                              | `s`                       | 1×51                   | `s`      |
| `terrain_tiny`                             | `s`                       | 1×51                   | `s`      |
| `teststring`                               | `s`                       | —                      | `—`      |
| `testvalue`                                | `f`                       | —                      | `—`      |
| `throttle_atten_mod_range`                 | `f`                       | 1×1                    | `f`      |
| `throttle_steady_time`                     | `f`                       | 1×1                    | `f`      |
| `thrust_capacity`                          | `f`                       | 1×32                   | `i`      |
| `thrust_charge_rate`                       | `f`                       | 1×32                   | `i`      |
| `thumb`                                    | `s`                       | 1×1                    | `s`      |
| `thumb_hp0`                                | `s`                       | —                      | `—`      |
| `thumb_hp1`                                | `s`                       | —                      | `—`      |
| `thumb_mesh`                               | `s`                       | —                      | `—`      |
| `thumb_mouse`                              | `f f`                     | —                      | `—`      |
| `thumb_no_mesh_render`                     | `f`                       | —                      | `—`      |
| `thumb_offset0`                            | `f f`                     | —                      | `—`      |
| `thumb_offset1`                            | `f f`                     | —                      | `—`      |
| `time_to_lock`                             | `f`                       | 1×71                   | `i`      |
| `tl_attack_chance_read_in`                 | `i`                       | —                      | `—`      |
| `tool_tip_id`                              | `f`                       | 1×1                    | `i`      |
| `top_speed`                                | `f`                       | 1×10                   | `i`      |
| `toughness`                                | `i`                       | 1×4452                 | `i`      |
| `tractor_complete_snd`                     | `s`                       | 1×1                    | `s`      |
| `tractored_explosion`                      | `s`                       | —                      | `—`      |
| `tradelane_space_name`                     | `i`                       | 1×271                  | `i`      |
| `turn_rate`                                | `f`                       | 1×513                  | `i`      |
| `turret_sound`                             | `s`                       | —                      | `—`      |
| `type`                                     | `s`                       | 1×2041, 8×179, 2×116   | `ssiiii` |
| `underline`                                | `b`                       | 1×15                   | `s`      |
| `units_per_container`                      | `i`                       | 1×139                  | `i`      |
| `universe`                                 | `s`                       | 1×1                    | `s`      |
| `use_animation`                            | `s`                       | 1×245                  | `s`      |
| `use_count`                                | `b`                       | —                      | `—`      |
| `use_sound`                                | `s`                       | 1×27                   | `s`      |
| `use_throttle`                             | `b`                       | 1×1                    | `s`      |
| `velocity`                                 | `f f f`                   | 3×4                    | `iii`    |
| `version`                                  | `f`                       | —                      | `—`      |
| `video_fovx`                               | `f`                       | 1×1                    | `i`      |
| `view_position`                            | `f f f`                   | 3×1                    | `fff`    |
| `viewsize`                                 | `f f f`                   | —                      | `—`      |
| `virtual_room`                             | `s`                       | 1×1137                 | `s`      |
| `visit`                                    | `i/s`                     | 1×1259, 2×25           | `ii`     |
| `voice`                                    | `s`                       | 1×2370, 2×6            | `ss`     |
| `volume`                                   | `f`                       | 1×1527                 | `f`      |
| `walla_max_dist`                           | `f`                       | 1×1                    | `f`      |
| `walla_max_dist_atten`                     | `f`                       | 1×1                    | `f`      |
| `walla_priority_cutoff`                    | `f`                       | 1×1                    | `i`      |
| `walla_start_atten`                        | `f`                       | 1×1                    | `f`      |
| `weapon_type`                              | `s`                       | 1×229                  | `s`      |
| `weaponmoddb`                              | `s`                       | 1×1                    | `s`      |
| `wire_color`                               | `f f f f`                 | —                      | `—`      |
| `xaxis_rotation`                           | `f`                       | 4×21                   | `iiii`   |
| `yaxis_rotation`                           | `f`                       | 4×21                   | `iiii`   |
| `zaxis_rotation`                           | `f`                       | 4×21                   | `iiii`   |
| `zone`                                     | `s`                       | 1×291                  | `s`      |
| `zone_occlusion_fade_in`                   | `f`                       | 1×36                   | `f`      |
| `zone_occlusion_fade_out`                  | `f`                       | 1×36                   | `f`      |
| `zone_shell`                               | `s`                       | 1×86                   | `s`      |

### The same name is not always read the same way

**542 names have a shape; 20 of them show more than one across their call sites, and 11 of those are
genuine.** The other nine differ only by being a prefix of the longest variant, which is this scan
truncating rather than the engine disagreeing — `[Zone] pos` reads `f f` only because the block bound
cut before the third accessor, and retail writes three values there.

So the table above is **per name, and a name is occasionally per section**. Where they conflict, this
is the list; rows marked ⚠ are ones where at least one variant still looks like residual overrun
rather than a real reading (a `[lens_flare] nickname` is not six floats).

| Property           | Shape         | Where                                                                                  |
| ------------------ | ------------- | -------------------------------------------------------------------------------------- |
| `damage`           | `f`           | `[zone]`                                                                               |
|                    | `s f`         | `[collisionconsts]`                                                                    |
| `faction` ⚠        | `f`           | `[zone]`                                                                               |
|                    | `s f`         | `DestroyInstance`                                                                      |
| `font` ⚠           | `i`           | `??4MD5Hash@@QAEAAV0@ABV0@@Z`                                                          |
|                    | `s`           | `??4MD5Hash@@QAEAAV0@ABV0@@Z`                                                          |
| `formation` ⚠      | `f f/s?`      | `??1IDLL@@UAE@XZ`                                                                      |
|                    | `f s?`        | `??1IDLL@@UAE@XZ`                                                                      |
| `hit_pts`          | `f`           | `Archetype::Equipment::read`, `Archetype::Root::read`                                  |
|                    | `i`           | `??1CollisionGroup@Archetype@@Q`                                                       |
| `ids_info`         | `f`           | `[group]`, `[missioncreatedsolar]`                                                     |
|                    | `i`           | `Archetype::Root::read`, `[object]`, `[zone]`                                          |
| `material_library` | `i/s?`        | `IDPMsgHandler::OnDisconnect`                                                          |
|                    | `s`           | `CostumeDescriptions::load_accessory`, `GoodInfoList::read_Good_block`                 |
| `name`             | `i`           | `[key]`                                                                                |
|                    | `s`           | `??4MD5Hash@@QAEAAV0@ABV0@@Z`, `Fuse::ReadFuseValues`, `RoomData::read_Camera_block` … |
| `nickname` ⚠       | `f f f f f f` | `[lens_flare]`                                                                         |
|                    | `s`           | `??1IDLL@@UAE@XZ`, `??4CDPClient@@QAEAAV0@ABV0@@Z`, `??4MD5Hash@@QAEAAV0@ABV0@@Z` …    |
| `strid_name`       | `f`           | `[package]`                                                                            |
|                    | `i`           | `[base]`, `[object]`                                                                   |
| `visit`            | `i`           | `CSolar::ReadObj`, `HardpointSummary::expire_instance`, `[object]` …                   |
|                    | `s`           | `[msnsolar]`                                                                           |

The clearest of these are different fields wearing the same name: `[CollisionConsts]
damage` takes a name and an amount where `[Zone] damage` takes a number; `[MsnSolar] visit` is a
string where every `common.dll` reader treats `visit` as an int. `[Zone] faction` is not one of
them: `common.dll`'s zone reader takes a name and a weight (`0x6337bb8`), as `content.dll`'s does,
and the scan missed the name.

## The table

### `[Sound]`

25,814 sections.

`attenuation`*, `msg`*, `duration`*, `Priority`, `nickname`, `file`, `type`, `is_2d`*, `range`,
`crv_pitch`*, `streamer`*, `pitch_bendable`*, `persistent`*, `ambient`, ~~`flash`~~,
**`Music`⁺**

### `[zone]`

5,769 sections.

`density_restriction`, `faction`, `nickname`, `pos`, `shape`, `size`, `sort`*,
~~`faction_weight`~~, `encounter`, `density`, `relief_time`, `max_battle_size`,
`repop_time`, ~~`pop_type`~~, `toughness`, `rotate`, `path_label`, `usage`,
`mission_eligible`, `property_flags`, ~~`attack_ids`~~, `tradelane_attack`, `vignette_type`,
`visit`, ~~`comment`~~, `difficulty`*, `mission_type`, `spacedust`, `spacedust_maxparticles`,
`property_fog_color`, `damage`, `Music`, `ids_info`, `ids_name`, `edge_fraction`,
~~`lane_id`~~, ~~`tradelane_down`~~, `population_additive`, `interference`,
`zone_creation_distance`*, ~~`spacedust _maxparticles`~~, ~~`spacedust_maxdust`~~,
~~`pacedust`~~, ~~`spacedust_masparticles`~~, `reputation`, `spin`, ~~`power_modifier`~~,
`drag_modifier`, ~~`spacedusr_maxparticles`~~, **`mesh`⁺**, **`name`⁺**

**`sort` is read by nothing**: the literal exists, but the zone reader (`common.dll`
`0x6337520`–`0x6337e09`) never takes it, and no other binary does. `edge_fraction` is clamped to
[0, 1] and **defaults to 0** (`0x633789a`). `damage`, `drag_modifier`, `interference`, `spacedust`
and `music` each also set a bit of the `property_flags` word — see
[ENGINE.md](ENGINE.md#zone-property-flags).

`size` takes up to three floats, and a missing second or third is 0 (`0x63377fc`); what each means
per shape is in [ENGINE.md](ENGINE.md#zone-shapes). A `drag_modifier` below 1 logs a warning and
becomes 1. `property_fog_color` is divided by 255 and defaults to white. `visit` is stored with
`0x20` set. `spin`, set once in retail, is not read in this section, and `mesh` loads a model only
for the `MESH` shape. A `spacedust_maxparticles` of 0, or none, becomes 50 when the dust is built
(`Freelancer.exe` `0x54c013`), and a zone's dust replaces the system's only while
[`[PerfOptions]`](#perfoptions) `space_dust_detail` is above 0.75 (`0x54bf7e`).

`content.dll`'s zone reader (`0x7097530`) reads `mission_type`, `vignette_type`, `mission_eligible`,
`usage`, `path_label`, `density` and `repop_time` (`0x7097899`, `0x7097924`, `0x709780f`,
`0x709778e`, `0x7097622`, `0x7097845`, `0x7097864`). **`difficulty` and `toughness` are read by
nothing in this section**: no zone reader in any binary takes either; `toughness` is matched only by
the `[Solar]` and `AttachedEquipment` archetype readers (`common.dll` `0x62f3406`, `0x62f540d`). A zone is a random-mission location when it has
`mission_type`, or has none and its nickname contains lower-case `vignette` (a case-sensitive
`strstr`, `0x709760c`); `vignette_type` only says open, field or exclusion.

The rest of a zone `content.dll` hands to its population reader (`0x6fe9270`), which takes
`encounter`, `density_restriction`, `population_additive`, `tradelane_attack` (scaled by 0.01),
`max_battle_size` and `relief_time`. **An `encounter` owns the `faction` lines that follow it**:
`encounter = name, level, chance` hashes the name, truncates `level` to an integer and reads
`chance` as a float (`0x6fe92b7`–`0x6fe92e7`), then the reader reads ahead, adds each
`faction = name, weight` to that encounter, and rewinds at the first other key
(`0x6fe9366`–`0x6fe93df`). A `faction` line anywhere else is skipped by `content.dll` (`0x7097830`),
while `common.dll`'s zone reader collects every `faction` line, name and weight, into one zone-wide
list (`0x6337bb8`). A `repop_time` of 0 or less becomes 1 (`0x709787c`). `zone_creation_distance` is
matched only by an encounter-file reader (`0x6fe64ee`).

### `[Hotspot]`

3,581 sections.

`name`, `behavior`, `room_switch`, `virtual_room`, `state_read`, `state_send`,
`set_virtual_room`, **`state_transition`⁺**, **`zoom_in`⁺**, **`zoom_out`⁺**

Read by `common.dll` `RoomData::read_Hotspot_block` (`0x6276d30`). `behavior` is one of twelve names
(table `0x63e9bc8`). `state_send` is stored and read by nothing in any binary; `state_transition`
works. `zoom_in` and `zoom_out` are matched only to log "ERROR: zoom_in/zoom_out is obsolete".

### `[Object]`

3,578 sections.

`nickname`, `pos`, `archetype`, `ids_name`, `ids_info`, `rotate`, `reputation`, `behavior`,
`loadout`, `pilot`, ~~`difficulty_level`~~, `next_ring`, `prev_ring`, `visit`,
`tradelane_space_name`, `parent`, `base`, `dock_with`, `jump_effect`, `goto`, `msg_id_prefix`,
`space_costume`, `voice`, `atmosphere_range`, `burn_color`, `spin`, `star`, `ambient_color`*,
`ring`, ~~`260800`~~, ~~`info_ids`~~, `faction`, `ambient`, `size`, ~~`info_card`~~,
~~`info_card_ids`~~, **`anim`⁺**, **`comm_appr`⁺**, **`destructible`⁺**, **`dock_script`⁺**,
**`group`⁺**, **`ids_info_card`⁺**, **`infocard_ids`⁺**

Eight passes read the section, each a chain of `is_value`, so a repeated key is last-wins unless
said otherwise: `CSolar::ReadObj` (`common.dll` `0x62b83e0`), on the client and on a multiplayer
server; the client's own pass (`Freelancer.exe` `0x5485c0`); at boot, the reputation pass
(`common.dll` `0x62b91e0`, each object read by `0x62b9020`) and `Universe::Startup`'s own
(`0x6337e76`); the system's object table (`0x6336300`), which the nav map reads; `content.dll`'s AI
record (`0x7064770`) and its lane and gate graph (`0x7064c7c`); and last the client's archetype
preload (`Freelancer.exe` `0x5547c0`).

`ring`, `burn_color`, `jump_effect` and `dock_script` are read by the client's own pass
(`Freelancer.exe` `0x5485ee`, `0x548688`, `0x5487dc`, `0x54871f`), not by `CSolar::ReadObj`.
`ring = zone, ini` builds a planet ring on a `RING` zone. `burn_color` is scaled by 1/255 with no
clamp and defaults to white (`0x548bb6`). A gate with no `jump_effect` takes `jump_effect_default`
(`0x502c28`–`0x502c40`), one of the five `[JumpGateEffect]` sections retail ships.

`CSolar::ReadObj` reads neither `ids_name` nor `ids_info`. The object table takes `ids_info`,
`ids_info_card` and `infocard_ids` as one key (`0x63364d0`–`0x63364fd`), and the reputation pass
takes `ids_info` and `infocard_ids` (`0x62b90c5`, `0x62b90d7`). **`faction`, `size` and `ambient` are
not read in this section**: no pass takes them. `ambient_color`'s one matcher (`Freelancer.exe`
`0x520cbb`) is `[Field]`'s.

`nickname` and a known `archetype` are required, or `ReadObj` logs and creates nothing (`0x62b8aa8`,
`0x62b8af0`, `0x62b8b33`). An archetype whose `solar_radius` exceeds `atmosphere_range` logs an error
and loads anyway (`0x62b8a4e`). Without a `loadout` the archetype's applies (`0x62b8be8`), but a name
that is not found logs `Unable to find [Loadout]` and gives no equipment, not that fallback
(`0x62b8dd6`); without `destructible` the archetype's applies (`0x62b8e08`). `visit` is stored as a
byte, so 256 wraps, and `CSolar::init` sets 1 on a sun or a lane ring (`0x62b7aec`). A dockable type
with neither `dock_with` nor `goto` is logged (`0x62b7aa1`). Each `anim` line adds a continual
animation (`0x62b877f`, started at `0x62b7b1c`).

`behavior` and `pilot` are read by `content.dll` alone. `reputation` defaults to −1, no affiliation
(`content.dll` `0x7064802`), but the lane and gate graph does not reset it per section
(`0x7064c91`–`0x7064ce6`), so there a ring without one takes the previous object's. That graph knows
rings and gates by a case-insensitive compare of the archetype with `Trade_Lane_Ring`, `jumpgate` or
`jumphole` (`0x7064f26`–`0x7064f64`). `content.dll` keeps the first `base` line (`0x6fc5db1`) where
every other pass keeps the last. `group` is the only key that sets the reputation pass's affiliation.

`space_costume` is a head, a body and then accessories — no hands. Accessories accumulate across
repeated lines into eight slots whose count is never tested, and an accessory that is not found is
dereferenced without a test (`0x62b898b`). `comm_appr` names a whole costume instead and writes the
same slot, so whichever comes last wins (`CSolar::ReadObj`,
`common.dll` `0x62b887b`–`0x62b8a02`).

`pos` and `rotate` are absolute, `rotate` by the same `EulerMatrix` as a zone's. **`parent` does not
move the object** (`0x62b85f0`); it is a link only. `spin` is an angular velocity about the object's
own axes, handed to the physics at creation (`0x62b7cfd`). `goto` is read for two values, a system
and an object (`common.dll` `0x62b8619`, `content.dll` `0x7064fd3`); no binary reads the third value
retail writes there. The tunnel a jump draws comes from `jump_effect`, through its
[`[JumpGateEffect]`](#jumpgateeffect) `jump_tunnel`. Every object with a `goto` adds a connection
record whatever its archetype (`common.dll` `0x6337e76`–`0x633814b`), and `server.dll`'s
`EnumerateConnections` (`0x6deac80`) copies them into ten slots unchecked, so an eleventh jump object
in a system overruns it.

Five keys an earlier sweep placed here belong elsewhere. `links`, `NavMapScale`, `real_pos` and
`strid_name` are [`[system]`](#system) keys, read after the universe loader's object pass has ended
(`common.dll` `0x63382bf`–`0x633836e`, the pass being `0x6337e76`–`0x63381b4`), and `local_faction`
is [`[SystemInfo]`](#systeminfo)'s (`content.dll` `0x7065180`). None is read in an `[Object]`.

**A lane ring is named after its lane's two ends.** `Freelancer.exe` `0x4e8d30` follows `prev_ring`
to the first ring and `next_ring` to the last and joins their `tradelane_space_name` values with
`->` (`0x5cef58`), ordered by which side of the ring's plane the player is on; a middle ring's own is
never read. An end that is not a lane ring, or whose name is 0, falls back to the ring's own name
(`0x5472a0`).

### `[Trigger]` ‡

2,984 sections.

`Act_ActTrig`, `nickname`, `system`, `Act_DeactTrig`, `Act_GiveObjList`,
`Act_SetVibeLblToShip`, `Cnd_CommComplete`, `Act_SetVibe`, `Cnd_True`, `Act_SetNNObj`,
`Act_SendComm`, `Act_SpawnShip`, `Act_Invulnerable`, `Cnd_Timer`, `Act_SetVibeLbl`,
`Act_MarkObj`, `Act_Cloak`, `Act_SpawnFormation`, `Act_SetVibeShiptoLbl`, `Cnd_Destroyed`,
`Act_PlayMusic`, `Act_StartDialog`, `Act_EtherComm`, `Cnd_DistShip`, `Act_SetNNState`,
`Act_SpawnSolar`, `Act_NagOff`, `Act_LockDock`, `Act_SetRep`, `Cnd_DistVec`,
`Act_PlayerCanDock`, `Act_LightFuse`, `Act_ChangeState`, `Act_NNIds`, `Act_NagDistLeaving`,
`Act_MovePlayer`, `Cnd_WatchTrigger`, `Act_Destroy`, `Act_NagDistTowards`, `Act_AdjHealth`,
`Act_SetLifeTime`, `Cnd_SpaceEnter`, `Act_PlayerEnemyClamp`, `Act_RandomPop`,
`Act_RelocateShip`, `Act_CallThorn`, `Act_AddRTC`, `Cnd_ProjHit`, `Act_PlayerCanTradelane`,
`Cnd_HealthDec`, `Act_LockManeuvers`, `Cnd_BaseEnter`, `Act_SetNNHidden`, `Act_PobjIdle`,
`Cnd_DistCircle`, `Cnd_LocEnter`, `Act_RevertCam`, `Act_SetOffer`, `Act_Save`, `repeatable`,
`Cnd_TLEntered`, `Act_RandomPopSphere`, `Cnd_TLExited`, `Act_SetTitle`, `Act_RemoveRTC`,
`Act_Jumper`, `Act_SetInitialPlayerPos`, `Cnd_SystemExit`, `Act_PlaySoundEffect`,
`Cnd_MsnResponse`, `Cnd_NPCSystemEnter`, `Act_SetPriority`, `Act_EnableManeuver`,
`Act_GiveNNObjs`, `Cnd_PlayerLaunch`, `Cnd_SystemEnter`, `Act_GCSClamp`, `Cnd_LaunchComplete`,
`Act_Popupdialog`, `Act_NNPath`, `InitState`, `Act_AdjAcct`, `Act_DebugMsg`, `Cnd_InSpace`,
`Act_NagClamp`, `Act_RpopAttClamp`, `Act_SetVibeOfferBaseHack`, `Cnd_PlayerManeuver`,
`Cnd_BaseExit`, `Cnd_SpaceExit`, `Act_DisableTradelane`, `Cnd_LocExit`, `Cnd_EncLaunched`,
`Cnd_ProjHitShipToLbl`, `Act_DisableFriendlyFire`, `Cnd_CharSelect`, `Cnd_TetherBroke`,
`Act_DisableEnc`, `Act_EnableEnc`, `Act_SpawnLoot`, `Act_AddAmbient`, `Act_RemoveAmbient`,
`Cnd_PopUpDialog`, `Act_HostileClamp`, `Act_Forceland`, `Act_DockRequest`, `Cnd_WatchVibe`,
`Cnd_InTradelane`, `Cnd_DistVecLbl`, `Cnd_LootAcquired`, `Act_RemoveCargo`,
`Act_RpopTLAttacksEnabled`, `Act_NagGreet`, `Act_StaticCam`, `Cnd_InZone`, `Cnd_HasMsn`,
`Act_SetShipAndLoadout`, `Cnd_RTCDone`, ~~`system St02`~~, `Act_GiveMB`, `Cnd_JumpInComplete`,
`Cnd_CargoScanned`, `Act_SetOrient`

### `[GF_NPC]`

1,642 sections.

`rumor`, `rumor_type2`, `bribe`, `nickname`, `individual_name`, `affiliation`, `voice`,
`body`, `head`, `lefthand`, `righthand`, `room`, `misn`, ~~`rumorknowdb`~~, `know`,
~~`knowdb`~~, `accessory`, `base_appr`

Read by `content.dll` `0x6f97ea0`, which first hands each line to the NPC reader it shares with
`specific_npc.ini` `[NPC]` (`0x7022540`). `rumor` and `rumor_type2` are one parser into one list
(`0x6fc47a0`).

### `[start_effect]`

1,353 sections.

`hardpoint`, `effect`, `at_t`, `pos_offset`, `attached`, `ori_offset`, `particles`, ~~`ONLY`~~,
~~`age_fire`~~

Read by `Freelancer.exe` `0x52b5f0`, from the client fuse loader at `0x529f29`; `server.dll` skips
the block. `hardpoint` repeats, and each `pos_offset` and `ori_offset` replaces the offset of the
last `hardpoint` before it. **`particles` is not read in this section.** `attached` defaults to
false, and a `pos_offset` or `ori_offset` before any `hardpoint` is logged and dropped. **Each
firing starts one effect, on one listed hardpoint** tried from a random start (`0x52bba4`), skipping
names the model lacks; `ROOT`, folding case, is the root, and a block with no `hardpoint` uses it.
The offset is in the hardpoint's frame, and `ori_offset = a, b, c` is degrees composed
`Rz(b)·Rx(a)·Ry(c)` (`0x52b7c0`–`0x52b88b`), not the `rotate` order. Without `attached` the effect
starts in the world with the owner's velocity at that moment and does not follow it.

### `[VisEffect]`

1,218 sections.

`textures`, `nickname`, `alchemy`, `effect_crc`, **`has_alpha`⁺**

Matched by the `[Data] effects` loader (`Freelancer.exe` `0x40eccb`) through a register and read by
`0x42dc40` (keys `0x42de30`). `effect_crc` is an integer and `alchemy` the `.ale` path; each
`textures` adds one texture library, and `has_alpha` is a bool. A key before `nickname` is dropped,
and an unknown key is ignored without a message. The libraries and the `.ale` load when the effect
is first used (`0x42e080`); an empty `alchemy` logs `[VisEffect]: Missing ale file name!`. `[Effect]`
resolves `vis_effect` and `vis_generic` against records already loaded (`0x40e463`, `0x40e4df`), so
a `[VisEffect]` must come before the `[Effect]` that names it.

### `[EncounterParameters]`

1,163 sections.

`nickname`, ~~`filename`~~, `faction`

`content.dll` reads the section by position (`0x7064ae8`): the first line's value is the nickname,
hashed, and the second's the encounter file. No key is compared, so `filename` is read for its value
although nothing matches its name, and a third line such as `faction` is not read.

### `[MsnShip]`

1,010 sections.

`label`, `nickname`, `NPC`*, `random_name`*, `radius`, `position`, `orientation`, `jumper`*,
`rel_pos`*, `init_objectives`*, `arrival_obj`, `cargo`, `system`

### `[Good]`

855 sections.

`nickname`, `category`, `price`, `equipment`, `combinable`, `item_icon`, `shop_archetype`,
`ids_name`, `ids_info`, `material_library`, `addon`, `msg_id_prefix`, `good_sell_price`,
`bad_buy_price`, `bad_sell_price`, `good_buy_price`, `jump_dist`, `ship`, `free_ammo`, `hull`,
**`attachment_archetype`⁺**, **`HP_child`⁺**, **`info_desc`⁺**, **`name`⁺**

### `[FlashlightSet]`

852 sections.

`hardpoint`, `icolor`, `scale`, `blink`, `endpause`, `gap`, `numlights`, ~~`:gap`~~,
**`color`⁺**, **`setpoint`⁺**

Read by `common.dll` `0x6276f60`. **`numlights` is not read in this section**; only
`[FlashlightLine]` reads it (`0x627731e`).

### `[loadout]`

803 sections.

`equip`, `cargo`, `nickname`, `archetype`

**`equip` is a nickname and an optional hardpoint, and any number of rows may name one hardpoint**:
the game seats every one of them, and retail stacks rows on 18 hardpoints in 9 loadouts. A row with no
hardpoint is internal equipment. In retail the kind alone decides which: every engine, power plant,
scanner, armor, tractor and internal effect row is internal, every other kind mounted. `cargo` is a
nickname, a count and, on a solar, a cargo pod's hardpoint.

### `[effect]`

705 sections.

`nickname`, `effect_type`, `vis_effect`, `vis_generic`, `snd_effect`, `vis_beam`, `lgt_effect`,
`lgt_range_scale`, `lgt_radius`, `:`*, **`lgt_color`⁺**, **`lgt_time_scale`⁺**

Read by `Freelancer.exe` `0x40e300`, from the `[Data] effects` dispatcher at `0x40ebc9`. An
`effect_type` that names no `EFT_*` is an error, but the out-of-range index is stored anyway.
`:` is not one of its keys. `effect_type` is matched case-sensitively by `[EffectType]`'s lookup
(`0x4fd500`, called at `0x40e364`). A missing `vis_effect` or `snd_effect` logs `couldn't find`; a
missing `vis_generic` is left empty without a word. A repeated nickname is dropped with `value is not
unique. Aborted second version.` (`0x40ec3e`). A `vis_beam` is drawn only for a munition's
`const_effect`: `0x53f4fd` is the one place a beam is built, and an `[Effect]` with both `vis_beam`
and `vis_effect` plays both. With G = 1 − effect detail, `vis_generic` replaces `vis_effect` while
the type's `Priority` is above G and `generic_priority` is at least G (`0x4f8259`).

### `[ObjList]`

672 sections.

`nickname`, `GotoVec`*, `system`, `GotoShip`*, `BreakFormation`*, `StayInRange`*,
`SetPriority`*, `Follow`*, `Delay`, `MakeNewFormation`*, `Avoidance`*, `Dock`*, `SetLifetime`*,
`GotoSpline`*, `FollowPlayer`*, `StayOutOfRange`*, `Idle`*

### `[NPCShipArch]`

660 sections.

`nickname`, `loadout`, `ship_archetype`, `state_graph`, `pilot`, `npc_class`, `level`

### `[BaseFaction]`

609 sections.

`NPC`, `faction`, `weight`, ~~`offers_missions`~~, `mission_type`

Read by `content.dll` `0x6f9b350`, whose `is_header` goes through a register (`0x6f9b406`).
`mission_type`'s first value is not read: the literal `DestroyMission` is stored instead
(`0x6f9b4b0`). `weight` defaults to −1, and a faction weighted 0 or less is never drawn. Each NPC an
`npc` line lists has its `affiliation` overwritten with this `faction` (`0x6f9adc1`–`0x6f9ae21`).

### `[Gun]`

513 sections.

Archetype chain: `Gun`.

`nickname`, `ids_name`, `ids_info`, `DA_archetype`, `HP_child`, `hit_pts`,
`explosion_resistance`, `debris_type`, `parent_impulse`, `child_impulse`, `volume`, `mass`,
`damage_per_fire`, `power_usage`, `refire_delay`, `muzzle_velocity`, `toughness`,
`projectile_archetype`, `separation_explosion`, `auto_turret`, `turn_rate`, `lootable`,
`material_library`, `light_anim`, `flash_particle_name`, `flash_radius`, `LODranges`,
`hp_gun_type`, `use_animation`, `dry_fire_sound`, **`attachment_archetype`⁺**,
**`dispersion_angle`⁺**, **`explosion_arch`⁺**, **`gun_azimuth`⁺**, **`gun_elevation`⁺**,
**`inherit`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`turret_sound`⁺**, **`type`⁺**, **`units_per_container`⁺**,
**`use_count`⁺**

**The barrels are `HpFire01` onward, consecutive, at most eight** (`CELauncher::Connect`
`0x6299790`), and every barrel fires every shot. A projectile leaves each barrel toward the aim point;
the first barrel's −Z only gates the aim cone. `flash_particle_name` plays attached at `HpFire01`
alone, while `flash_radius` and `light_anim` make a point light shown in the player's cockpit view
instead (`Freelancer.exe` `0x52cfd0`). `use_animation` plays on every shot.

### `[Munition]`

513 sections.

Archetype chain: `Munition`.

`nickname`, `hp_type`, `requires_ammo`, `hit_pts`, `one_shot_sound`, `lifetime`,
`force_gun_ori`, `const_effect`, `mass`, `volume`, `hull_damage`, `energy_damage`,
`munition_hit_effect`, `weapon_type`, `DA_archetype`, `material_library`, `explosion_arch`,
`detonation_dist`, `Motor`, `HP_trail_parent`, `seeker`, `time_to_lock`, `seeker_range`,
`seeker_fov_deg`, `max_angular_velocity`, `loot_appearance`, `units_per_container`, `ids_name`,
`ids_info`, `cruise_disruptor`, **`attachment_archetype`⁺**, **`const_effect_delay`⁺**,
**`damage`⁺**, **`explosion_resistance`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mission_property`⁺**,
**`owner_safe_time`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`use_count`⁺**

`const_effect_delay` defers the `const_effect`'s Alchemy, sound and light, but not a beam
(`Freelancer.exe` `0x542719`); it is read by `Archetype::CliMunition` (`0x4083a0`), beside
`munition_hit_effect` (`0x408433`), and for `[Mine]` and `[CounterMeasure]` by `Archetype::CliProj`
(`0x407e60`).

### `[CollisionGroup]`

484 sections.

Archetype chain: `AttachedEquipment`.

`obj`, `separable`, `child_impulse`, `debris_type`, `hit_pts`, `parent_impulse`, `mass`,
`root_health_proxy`, `dmg_hp`, `dmg_obj`, `fuse`, `separation_explosion`, `type`,
`group_dmg_hp`, `group_dmg_obj`, ~~`------------------------------------------`~~,
**`attachment_archetype`⁺**, **`DA_archetype`⁺**, **`explosion_arch`⁺**,
**`explosion_resistance`⁺**, **`HP_child`⁺**, **`ids_info`⁺**, **`ids_name`⁺**, **`inherit`⁺**,
**`lootable`⁺**, **`mission_property`⁺**, **`nickname`⁺**, **`phantom_physics`⁺**,
**`rotation_inertia`⁺**, **`toughness`⁺**, **`tractored_explosion`⁺**,
**`units_per_container`⁺**, **`use_count`⁺**, **`volume`⁺**

`fuse` is a fuse `name`, a start time `t` on its clock and a hit-point threshold, and it may repeat;
`common.dll` `0x62f18c4` reads it on `[Solar]` and `[ship]`, and the collision-group reader here.
The threshold is absolute hit points, not a fraction. Damage that crosses down to it lights the fuse
at `t`, and repair that crosses back above it unlights that burn (`server.dll` `0x6ddb6e5`,
`0x6ddb731`).

### `[room]`

464 sections.

`nickname`, `file`

Read by `common.dll` `BaseData::read_Room_block` (`0x6264e60`); an entry missing either key is
dropped with a message (`0x626503d`). The room's id is the hash of the base id in hex, `_` and its
`nickname` (`MakeLocationID` `0x6266290`), so a misspelt room is a valid id that names nothing. The
room file is opened only on first entry into the base (`RoomData::load` `0x6277fb0`).

### `[Room_Info]`

446 sections.

`scene`, `set_script`, `animation`, `goodscart_script`, **`animation_oneshot`⁺**,
**`background_script`⁺**, **`background_script_oneshot`⁺**, **`cutoff_shadow_z`⁺**,
**`extra_shadow_height_offset`⁺**, **`goodscart_script_elite`⁺**,
**`goodscart_script_fighter`⁺**, **`goodscart_script_freighter`⁺**, **`is_outside`⁺**,
**`mesh`⁺**, **`mission_vendor_type`⁺**, **`news_material`⁺**

Read by `common.dll` `0x62757f0`; `[Room]` is an alias of this header in a room file. Of the
engine-only keys, `animation_oneshot` plays once, and `cutoff_shadow_z` and
`extra_shadow_height_offset` are stored with no consumer found. **The other nine are matched only to
log "obsolete"** (`0x6275834`–`0x6275b49`): both `background_script` keys, all three
`goodscart_script_*` variants, and `is_outside`, `mesh`, `mission_vendor_type` and `news_material`.

### `[Camera]`

443 sections.

`name`, **`far_plane`⁺**, **`index`⁺**, **`near_plane`⁺**

In a room file (`common.dll` `0x6275e00`) `far_plane`, `index` and `near_plane` are matched only to
log "obsolete … use a camera name".

### `[NPC]`

443 sections.

`nickname`, `individual_name`, `affiliation`, `npc_ship_arch`, `voice`, `space_costume`,
`base_appr`

Read by two `content.dll` readers, keys through a register: `0x7021060`, which takes `nickname`,
`space_costume`, `voice`, `npc_ship_arch`, `affiliation` and `individual_name`, and the reader
`[GF_NPC]` shares (`0x7022540`), which also takes `base_appr`, the four body parts and `accessory`.

### `[Room_Sound]`

439 sections.

`ambient`, `Music`

### `[mLootProps]`

434 sections.

`nickname`, `drop_properties`*

### `[BaseGood]`

413 sections.

`MarketGood`, `base`

Read by `common.dll` `BaseDataList::load_market_data` (`0x62658c0`), which accepts no other header.
`MarketGood` is a good, then a required level and a required reputation, a minimum and a maximum
stock, a transaction type and a price multiplier, each optional (`0x6265a95`–`0x6265b7b`); **an
eighth value is read and discarded**, and retail writes one on every row of `market_ships.ini`. The
level is tested only in single player. The stock pair is a switch, not a quantity: a good is sold,
without limit, when the minimum is not 0 and the maximum is above 0 (`Freelancer.exe` `0x437ebd`).
The transaction type is 0 to buy and sell, 1 for a base that only buys and 2 for one that only
sells. The multiplier scales the good's `price` at load (`0x6265be1`). A row before the block's
`base` is dropped, as is one naming no good or holding only defaults, and a later row for the same
good at the same base replaces the earlier, across files too (`0x6265c6c`).

### `[MRoom]`

412 sections.

`fixture`, `nickname`, `character_density`

Read by `content.dll` `0x6f9ab2c` (`character_density` `0x6f9ab9c`, `fixture` `0x6f9abba`).

### `[NewsItem]`

403 sections.

`base`, `rank`, `icon`, `logo`, `category`, `headline`, `text`, `audio`, `autoselect`,
**`breaking`⁺**

Read by `content.dll` `0x6fa47b0`. `rank` is the story stage, not the player's level.

### `[NNObjective]`

395 sections.

`nickname`, `state`, `type`

### `[LOD]`

388 sections.

`obj`, `LODranges`

A sub-section of the archetype above it, read by `Freelancer.exe` `0x4023f0`. **`obj` is a part
name**, hashed with `GetCRC32` (`0x40245c`) and matched against each part's `Object name` hashed the
same way. Each block is **prepended** to its archetype's list (`0x4024b3`), so the last block comes
first and the archetype's own `LODranges` last; a block whose `LODranges` never arrived is freed.

`LODranges`, here and on every archetype, is read by `0x402310`: up to 8 values, then a −1, so at
most seven levels, and a second line replaces the first. **`MinSpecLOD` defaults to 1, or to 0 when
the list holds two values or fewer** (`0x4023b8`). When the object is created the list overwrites
its parts' `Switch2` entry by entry, as far as it reaches — see
[VMESH.md](../modules/VMESH.md#levels-of-detail).

**`MinSpecLOD` is how many of the finest levels the low detail setting retires.** Below 0.75 on the
`level_of_detail` slider (`Freelancer.exe` `0x5b4560`) those levels are given an empty range, so a
one-level part under a list of three or more values is not drawn. Above 0.75 the slider scales no
range; it only applies a cap: when a list's last end is under 15 000 and the scaled end passes it,
every end that passes becomes 15 000 plus its index (`0x5c7478`). The list is applied when an object
is created.

### `[Solar]`

321 sections.

Archetype chain: `Solar`.

`material_library`, `nickname`, `type`, `DA_archetype`, `solar_radius`, `shape_name`, `mass`,
`docking_sphere`, `LODranges`, `hit_pts`, `ids_info`, `ids_name`, `envmap_material`, `fuse`,
`loadout`, `destructible`, `explosion_arch`, `surface_hit_effects`, `docking_camera`,
`open_sound`, `close_sound`, `jump_out_hp`, `phantom_physics`, `shield_link`, `open_anim`,
`distance_render`, `animated_textures`, `nomad`, **`attachment_archetype`⁺**,
**`explosion_resistance`⁺**, **`infocard_ids`⁺**, **`inherit`⁺**, **`mission_property`⁺**,
**`rotation_inertia`⁺**, **`toughness`⁺**

**The fourth value of `docking_sphere` is that port's door script** (`0x62f1806`), played forward once
and held while the port is open and backward from wherever it stands when it closes
(`CEqObj::update_docking_animations` `0x62aaea0`). **`open_anim` belongs to gates**: it is opened only
for a solar with a jump target (`0x62b7a08`), and a jump gate, jump hole or airlock gate plays it
forward over 10 s on activation and backward 5 s after deactivation (`0x62b7ea0`), never its docking
spheres' scripts.

The client's own pass over the archetype (`Archetype::CliSolar`, `Freelancer.exe` `0x407bd0`) reads
`shape_name`, `open_sound`, `close_sound` and `animated_textures`, and takes `infocard_ids` as
`ids_info` (`0x407c57`). **`shape_name` is the nav-map icon**,
`INTERFACE\NeuroNet\NavMap\NewNavMap\SpaceObjects\<shape_name>.3db` with `spaceobjects.mat`
(`0x491f90`); no icon is drawn when that file is missing. `distance_render` (`0x406e93`, default
−1, so off) is the distance past which the object draws without its environment-map pass
(`0x53990c`, `0x539a7f`).

### `[pilot]`

320 sections.

`nickname`, `inherit`, `gun_id`, `evade_dodge_id`, `job_id`, `missile_id`,
`buzz_head_toward_id`, `buzz_pass_by_id`, `evade_break_id`, `damage_reaction_id`, `trail_id`,
`strafe_id`, `mine_id`, `countermeasure_id`, `formation_id`, `engine_kill_id`,
`missile_reaction_id`, `repair_id`, `body`, `comm`, `voice`, `body.anim`, `thumb`, `comm.anim`

### `[destroy_group]`

291 sections.

`at_t`, `group_name`, `fate`, `separable`, `dmg_hp`, `dmg_obj`

Read by `server.dll` `0x6deddd0`. `fate` is matched exactly, case and all: `debris` or `disappear`;
anything else logs `FATE_UNKNOWN, using FATE_DISAPPEAR` and disappears. **`separable`, `dmg_hp` and
`dmg_obj` are not read in this section.** `group_name = random`, folding case, picks a target once
per object by `rand() · N >> 15` against a count incremented before it is compared (`0x6dedf9d`), so
it may pick nothing and never picks the last candidate.

### `[CharacterPlacement]`

265 sections.

`name`, `start_script`, **`zoom_in`⁺**, **`zoom_out`⁺**

`zoom_in` and `zoom_out` are matched only to log "ERROR: … is obsolete" (`common.dll` `0x62768a0`).

### `[TexturePanels]`

241 sections.

`file`

### `[Simple]`

235 sections.

Archetype chain: `Root`.

`nickname`, `DA_archetype`, `material_library`, `mass`, `LODranges`, `hit_pts`, `MinSpecLOD`,
**`attachment_archetype`⁺**, **`explosion_arch`⁺**, **`explosion_resistance`⁺**,
**`ids_info`⁺**, **`ids_name`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**,
**`rotation_inertia`⁺**, **`type`⁺**

### `[Dialog]`

231 sections.

`line`, `nickname`, `system`

### `[Asteroids]`

210 sections.

`file`, `zone`

### `[fuse]`

209 sections.

`name`, `lifetime`, `death_fuse`, `LODranges`*

Read by `common.dll` `Fuse::ReadFuseValues` (`0x62be010`), for both the client (`Freelancer.exe`
`0x529e10`) and `server.dll` (`0x6dec1d0`). **`LODranges` is not read in this section.**
`lifetime` (default −1, `Freelancer.exe` `0x52a881`) is the seconds the timeline 0 → 1 takes; every
retail fuse sets it. A `name` already loaded keeps its first definition (`0x52a8ef`, `server.dll`
`0x6ded17f`). While an unspent fuse with `death_fuse` is on an object (`server.dll` `0x6ddc8a0`),
damage from anything but a fuse destroys neither the root nor a collision group (`0x6ddb4ae`).

### `[PlayerShipPlacement]`

208 sections.

`name`, `landing_script`, `launching_script`

### `[properties]` ‡

202 sections.

~~`flag`~~

### `[BaseInfo]`

200 sections.

`nickname`, `start_room`, **`price_variance`⁺**, **`ship_repair_cost`⁺**

Read by `common.dll` `BaseData::read_Base_block` (`0x6264d40`), which a base file also reaches with
the header `[Base]`. `nickname` is matched and discarded. `ship_repair_cost` defaults to 0.33.

### `[voice]`

199 sections.

`script`, `nickname`, `extend`*

### `[base]`

197 sections.

`nickname`, `system`, `strid_name`, `file`, `BGCS_base_run_by`, `terrain_tiny`, `terrain_sml`,
`terrain_mdm`, `terrain_lrg`, `terrain_dyna_01`, `terrain_dyna_02`, `autosave_forbidden`,
**`price_variance`⁺**, **`ship_lrg_01`⁺**, **`ship_lrg_02`⁺**, **`ship_lrg_03`⁺**,
**`ship_mdm_01`⁺**, **`ship_mdm_02`⁺**, **`ship_mdm_03`⁺**, **`ship_repair_cost`⁺**,
**`ship_sml_01`⁺**, **`ship_sml_02`⁺**, **`ship_sml_03`⁺**, **`start_room`⁺**

**`price_variance`, `ship_repair_cost` and `start_room` are not read by the `universe.ini` reader**
(`common.dll` `0x6338637`–`0x6338c4d`): they are `[BaseInfo]`'s, read under this header only in a
base file, where `[Base]` is an alias. `ship_*` fill the THN prop templates `$ship_*`
(`Freelancer.exe` `0x446280`).

### `[MBase]`

194 sections.

`nickname`, `local_faction`, `diff`, `msg_id_prefix`

Read by `content.dll` in two passes. At startup (`0x6f9b790`) the section's first value is taken as
the base nickname whatever its key (`0x6f9b9ae`), and the `[BaseFaction]`s up to the next `[MBase]`
are read with it (`0x6f9b350`); a first value that names no base ends the pass unless another
`[MBase]` follows at once, so every later base loses its factions (`0x6f9ba05`). On a base's first
entry the file is read again for that base's `[MVendor]`, `[GF_NPC]` and `[MRoom]` (`0x6f9a800`).
`diff` defaults to 10 and `local_faction` is stored (`0x6f9b390`); no reader of either was found.
`msg_id_prefix` goes to the shared comm reader (`common.dll` `0x632e6a0`).

### `[MVendor]`

194 sections.

`num_offers`

Read by `content.dll` `0x6f9a983`.

### `[MsnFormation]`

188 sections.

`ship`, `nickname`, `formation`, `position`, `orientation`, `rel_pos`*, `label`

### `[Exclusion Zones]`

169 sections.

`exclusion`, `exclude_billboards`, `fog_far`, `zone_shell`, `max_alpha`, `exclusion_tint`,
`shell_scalar`, `exclude_dynamic_asteroids`, `empty_cube_frequency`, `billboard_count`,
`color`, ~~`exclude`~~

Two readers, one per kind of file. In an asteroid field (`common.dll` `0x62a5150`–`0x62a5318`) each
`exclusion` adds a zone, and the keys after it apply to that zone: `exclude_billboards`,
`billboard_count`, `empty_cube_frequency` and `exclude_dynamic_asteroids`, the last honoured only on
a `SPHERE` or `ELLIPSOID` zone (`0x62a52bf`). In a nebula INI (`Freelancer.exe` `0x505ac1`) the
reader takes `exclusion` and `fog_far` (default −1, meaning none), then `zone_shell` and three keys
that belong to the shell model rather than the zone: `shell_scalar` (raised to at least 1),
`max_alpha` (at most 1) and `exclusion_tint` (divided by 255). Two exclusions that name one shell
share these, and the last line read wins. `exclusion` does not reset the current shell, so after a
shell-less exclusion they re-target the previous one. A nebula exclusion must be a `SPHERE` with an
`edge_fraction`; anything else is logged and kept (`common.dll` `0x62bd010`, `0x62bca90`). **`color`
is not read** in a nebula INI; retail's one use, in `ku04_hiyo_cloud.ini`, has no effect.

### `[Power]`

164 sections.

Archetype chain: `Power`.

`nickname`, `volume`, `mass`, `DA_archetype`, `capacity`, `charge_rate`, `material_library`,
`hit_pts`, `ids_name`, `ids_info`, `thrust_capacity`, `thrust_charge_rate`, `lootable`,
**`attachment_archetype`⁺**, **`explosion_arch`⁺**, **`explosion_resistance`⁺**,
**`inherit`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**

### `[destroy_hp_attachment]`

163 sections.

`at_t`, `hardpoint`, `fate`

Read by `server.dll` `0x6dee3d0`. `fate` is matched exactly: `debris`, `disappear` or `loot`.
`loot` drops the equipment as loot, or as debris where it cannot (`0x6dda056`); any other value
disappears as `FATE_UNKNOWN`. `hardpoint = random` picks the way [`[destroy_group]`](#destroy_group)'s
`random` does.

### `[explosion]`

156 sections.

Archetype chain: `Explosion`.

`nickname`, `lifetime`, `process`, `effect`, `debris_type`, `innards_debris_object`, `radius`,
`hull_damage`, ~~`strength`~~, `energy_damage`, `impulse`, `debris_impulse`,
`innards_debris_start_time`, `num_child_pieces`, `innards_debris_num`, `innards_debris_radius`

### `[Costume]`

154 sections.

`nickname`, `body`, `righthand`*, `lefthand`*, `head`*, **`accessory`⁺**

`body`, `head`, `lefthand` and `righthand` are not matched as names: any other key is looked up,
case-insensitively, in the part-type table `Body`, `Head`, `LeftHand`, `RightHand` (`common.dll`
`0x63ebd68`, from `load_costumes` `0x6300b80`), and an unknown one logs *Invalid part type*.
`accessory` may repeat up to eight times; a ninth overruns the record unchecked. A nickname that
`atol` reads as non-zero is taken as the id itself rather than hashed — true of every
`bodyparts.ini` and `costumes.ini` nickname.

### `[Field]`

154 sections.

`cube_size`, `fill_dist`, `empty_cube_frequency`, `diffuse_color`, `ambient_color`,
`ambient_increase`, `tint_field`, `max_alpha`, `contains_fog_zone`, **`LOD`⁺**,
**`test_asteroid_placement`⁺**

Read by the client's field loader (`Freelancer.exe` `0x520ae2`–`0x520e2d`), in file order, so a
`diffuse_color` after `tint_field` wins. `contains_fog_zone` and `test_asteroid_placement` are read
by presence alone; the second makes the cube draw return at once (`0x522a80`). `LOD` is read as an
integer. `cube_size` is reset to 250 at each load (`0x5208b1`), and `fill_dist` defaults to 1200.
`diffuse_color`, `ambient_color` and `tint_field` are divided by 255, and `tint_field` sets both of
the other two. `ambient_increase` is stored as three bytes. A field zone that is not a `SPHERE` or
`ELLIPSOID` logs `not a valid shape` and loads anyway.

### `[Cube]`

153 sections.

`asteroid`, `xaxis_rotation`, `yaxis_rotation`, `zaxis_rotation`

Read by `common.dll` `CAsteroidField::load` (`0x62a4cb0`). `asteroid` takes an archetype, a
position and three rotations, then an optional eighth value, `mine` or `instant_kill`. The position
is clamped to [−1, 1] and scaled by half the field's `cube_size`. A missing rotation logs `invalid
rotation specified for an asteroid` and becomes 0, 0, 0; the rotation is Rz·Ry·Rx in degrees.
`mine` is read by the server (`server.dll` `0x6df4520`), which arms the rock with its archetype's
`detect_radius`. `instant_kill` is read by the client (`Freelancer.exe` `0x524cb0`): the player's
ship that touches such a rock is destroyed through `SPBadLandsObjCollision` (`server.dll`
`0x6de0390`). Retail writes `mine` 70 times and `instant_kill` never. Each `*axis_rotation` takes
four angles in degrees, defaulting to 0, 90, 180 and 270 (`0x62a4a2f`). The whole field draws with
one material, the first rock's whose mesh has one (`Freelancer.exe` `0x521552`–`0x521a90`).

### `[KeyCmd]`

146 sections.

`nickname`, `state`, `ids_name`, `ids_info`, `key`

### `[DynamicAsteroids]`

145 sections.

`asteroid`, `count`, `placement_radius`, ~~`placement_offset`~~, `max_velocity`,
`max_angular_velocity`, `color_shift`, **`zone`⁺**

Matched at `Freelancer.exe` `0x521071` and read by `0x525800`; `zone` is read by the field loader
(`0x521160`) and defaults to the field's own. `placement_offset`, set 145 times, is still read by
nothing.

### `[RMBonusLoot]`

143 sections.

`archetype`, `num_to_drop`, `faction`, `difficulty_range`, `weight`

Read by `content.dll` `0x70460b0`. `faction` is matched against the mission's enemy and
`difficulty_range` against the mission difficulty.

### `[DataNode]`

140 sections.

`offer_text`, `node_id`, `child_node`, `Offer_group`, `comm_sequence`, `objective_text`,
`weight`, `Hostile_group`, `difficulty`, `Implemented`, `Allowable_zone_types`,
`Failure_text`, `Reward_text`

`VignetteParams.ini`, read by `content.dll` `0x708e550` (header test `0x708e6ad`). The three tree
headers — this one, `[DecisionNode]` and `[DocumentationNode]` — are one kind of section: each goes
through the same node reader (`0x7089610`) and data reader (`0x7089150`), so every key here is also
read under the other two. `tree_path` is not a tree key but the `[RandomMission]` save key.

### `[LightSource]`

140 sections.

`nickname`, `pos`, `color`, `range`, `type`, `atten_curve`, `attenuation`, `direction`,
`color_curve`, `rotate`, `ids_name`, `behavior`, **`ambient_curve`⁺**

Matched by the system loader (`Freelancer.exe` `0x553d7a`), which hands every key to `EngineLight`'s
property reader (`0x411690`). That reader compares `get_name_ptr()` with `stricmp` instead of
calling `is_value`, which is why the resolver found no call site. It has no branch for `nickname`,
`rotate`, `ids_name` or `behavior`, and nothing else reads `[LightSource]`, so **those four are not
read in this section**; an unknown key is dropped silently.

`type` is `AMBIENT` (−2), `POINT` (1), `CONE` (2) or `DIRECTIONAL` (3), case folded (`0x411838`);
anything else logs `invalid [LightSource] type` and stores −1. `atten_curve` is `name[, type]`: the
optional second value re-types the light (`0x411ae7`) before the first names an `[IGraph]`, which on
an `AMBIENT` light becomes its ambient curve. `ambient_curve` names the graph that weights an
`AMBIENT` light by distance (`0x411a5c`).

The constructor (`0x410ca0`) sets `color` to 1, 1, 1, `range` to 0 and `attenuation` to 0, 1, 0.
Each `color` value is truncated and clamped to 0–255 before it is divided by 255 (`0x411bc0`).
`color_curve` is a graph name and a period (`0x411b36`); an unknown graph name logs `unknown graph
name` and leaves the curve unset.

### `[SystemConnections]`

131 sections.

`Path`

Loaded by `content.dll` `0x7019410` from three fixed paths: `universe\systems_shortest_path.ini`,
`shortest_legal_path.ini` and `shortest_illegal_path.ini`, which retail fills with 50, 35 and 46 of
these sections. Each `Path` names two systems and then the route between them, both ends included.
A system missing from them is no error: a lookup for it gives no route, and a course plotted to it
falls back to one direct waypoint (`0x6fef7e4`).

### `[KillableSolar]`

126 sections.

`nickname`, `solar_type`, `string_id`, `faction`, `archetype`, `loadout`, `hitpoints`,
`difficulty`, `pilot_choices`, `only_allowed_in_zone_type`

Read by `content.dll` `0x7084c50`. `string_id` is an index into the installation-name table at string
329680, with the next index as the plural. Every material that `only_allowed_in_zone_type` lists must
be present at the spot (`0x7085332`), so a line naming two never matches a retail zone.

### `[ShieldGenerator]`

126 sections.

Archetype chain: `ShieldGenerator`.

`shield_hit_effects`, `nickname`, `DA_archetype`, `material_library`, `ids_name`, `ids_info`,
`mass`, `volume`, `hit_pts`, `HP_child`, `debris_type`, `regeneration_rate`,
`constant_power_draw`, `rebuild_power_draw`, `max_capacity`, `offline_rebuild_time`,
`offline_threshold`, `shield_collapse_sound`, `shield_rebuilt_sound`, `LODranges`,
`explosion_resistance`, `parent_impulse`, `child_impulse`, `toughness`, `hp_type`,
`separation_explosion`, `lootable`, `shield_type`, `shield_collapse_particle`,
**`attachment_archetype`⁺**, **`explosion_arch`⁺**, **`hp_shield_type`⁺**, **`inherit`⁺**,
**`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**

**Each `shield_hit_effects` line is a damage and its effects.** A hit plays one of the effects of the
last line whose damage is at most the hit's, at random (`Freelancer.exe` `0x409f10`); a munition's
damage is `hull_damage` times the hull damage factor plus `energy_damage`. The effect is attached to
the ship at the hit point with its +Y along the surface normal (`0x539f90`), at most three alive per
object. `shield_collapse_particle` plays where the bubble is when the shield fails.

### `[PhantomLoot]`

124 sections.

`nickname`, `toughness_range`*, `percent_chance`*, `num_to_drop`

### `[MsnSolar]`

116 sections.

`label`, `nickname`, `faction`, `archetype`, `position`, `string_id`, `loadout`, `system`,
`radius`, `orientation`, `pilot`, `voice`, `Costume`, `base`, `visit`

### `[ship]`

115 sections.

Archetype chain: `Ship`.

`hp_type`, `surface_hit_effects`, `material_library`, `fuse`, `nickname`, `LODranges`,
`DA_archetype`, `type`, `ids_name`, `ids_info`, `mass`, `hold_size`, `linear_drag`, `hit_pts`,
`explosion_arch`, `steering_torque`, `angular_drag`, `rotation_inertia`, `nudge_force`,
`num_exhaust_nozzles`, `HP_tractor_source`, `msg_id_prefix`, `mission_property`,
`HP_bay_surface`, `HP_bay_external`, `envmap_material`, `bay_doors_open_snd`*,
`bay_doors_close_snd`*, `bay_door_anim`, `cockpit`*, `shield_link`, `pilot_mesh`*,
`camera_offset`*, `max_bank_angle`, `camera_angular_acceleration`*,
`camera_horizontal_turn_angle`*, `camera_vertical_turn_up_angle`*,
`camera_vertical_turn_down_angle`*, `camera_turn_look_ahead_slerp_amount`*, `strafe_force`,
`strafe_power_usage`, `ids_info1`, `ids_info2`, `ids_info3`, `ship_class`, `nanobot_limit`,
`shield_battery_limit`, `nomad`, `docking_sphere`, `docking_camera`, `distance_render`,
`camera_angular_slerp_multiplier`*, **`attachment_archetype`⁺**, **`explosion_resistance`⁺**,
**`inherit`⁺**, **`phantom_physics`⁺**

**`num_exhaust_nozzles` counts the engine's nozzles.** The `CEEngine` constructor (`common.dll`
`0x6295f40`) looks up `HpEngine01` through `HpEngine0N` by the format `HpEngine0%d` and keeps those the
model has, skipping a missing one silently; unset, N is 9 (`0x62f2013`), and it is never clamped. A
hardpoint past N carries no flame, and no binary names `HpEngineGlow`. An engine that finds no nozzle
gives no thrust unless it is `indestructible` (`0x62961e0`).

**`bay_door_anim` is the cargo bay, opened only by a jettison** (`CShip::open_bay` `0x62b2e40`,
`close_bay` `0x62b2fb0`): played forward once, held for what remains of it plus
`JETTISON_CLEARANCE_TIME`, then backward, with every shield off while it is open. Jettisoned cargo
leaves from `HP_bay_surface` toward `HP_bay_external`, or from the centre along −Y when either is
missing (`server.dll` `0x6df1300`).

**`shield_link` names a `[Shield]`, the hardpoint its model mates to, and then generator
hardpoints** (`0x62f192f`). A bubble is made only when a shield generator is mounted on one of those
(`0x62abf30`), and it is mated by the shield model's `SpConnect`.

### `[accessory]`

106 sections.

`nickname`, `mesh`, `hardpoint`, `body_hardpoint`, **`material_library`⁺**

`hardpoint` is the prop's own hardpoint and `body_hardpoint` the character's (`common.dll`
`get_accessory_hardpoint` `0x62b6cf0`, `get_character_hardpoint` `0x62b6d00`).
`material_library` may repeat, each line appended in order and loaded with the prop
(`load_accessory` `0x62ffef0`). Accessories ignore the `[Skeleton]`, `[DetailSwitchTable]` and
`[PetalAnimations]` grouping the other parts take; see [COSTUME.md](COSTUME.md#accessories).

### `[Commodity]`

105 sections.

Archetype chain: `Commodity`.

`nickname`, `ids_name`, `ids_info`, `units_per_container`, `loot_appearance`,
`decay_per_second`, `volume`, `hit_pts`, `pod_appearance`, **`attachment_archetype`⁺**,
**`DA_archetype`⁺**, **`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`inherit`⁺**,
**`lootable`⁺**, **`mass`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**,
**`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**, **`use_count`⁺**

### `[head]` ‡

104 sections.

`nickname`, `mesh`, **`multilevel`⁺**

### `[AsteroidBillboards]`

99 sections.

`count`, `start_dist`, `fade_dist_percent`, `shape`, `size`, `color_shift`, `ambient_intensity`

Matched at `Freelancer.exe` `0x521014` and read by `0x54dbe0`. `fade_dist_percent` is clamped to
[0, 1], and the two `size` values are sorted. A `count` that comes to 0 after the detail scale
fails the load (`0x54de10`, `Billboard rock count is not > 0`). One of the 99 sits, with a `[Field]`, in the system
file `li02.ini`, where nothing reads either.

### `[GunBlock]` ‡

99 sections.

`nickname`, `gun_fire_interval_time`*, `gun_fire_interval_variance_percent`*,
`gun_fire_burst_interval_time`*, `gun_fire_burst_interval_variance_percent`*,
`gun_fire_no_burst_interval_time`*, `gun_fire_accuracy_cone_angle`*,
`gun_fire_accuracy_power`*, `auto_turret_interval_time`*, `auto_turret_burst_interval_time`*,
`auto_turret_no_burst_interval_time`*, `auto_turret_burst_interval_variance_percent`*,
`gun_range_threshold`*, `gun_target_point_switch_time`*, `fire_style`*,
`gun_fire_accuracy_power_npc`*, `gun_range_threshold_variance_percent`*

### `[formation]`

93 sections.

`pos`, `nickname`, `pl_pos`*

### `[mVoiceProp]`

93 sections.

`permutation_count`*, `voice`, `gender`, `supports_roles`

Read by `content.dll` (header `0x7096351`), keys through a register: `voice`, `gender` (`0x7096476`,
compared with `male`) and `supports_roles` (`0x70964c4`). A spawned pilot is male with the share of
its faction's voices that are male (`0x703f650`). `permutation_count`, written only in
`MISSIONS/voice_properties.ini`, is matched at no call site found.

### `[key]`

92 sections.

`id`, **`name`⁺**

### `[body]` ‡

88 sections.

`nickname`, `mesh`, **`multilevel`⁺**

### `[asteroid]`

86 sections.

Archetype chain: `Asteroid`.

`nickname`, `DA_archetype`, `material_library`, `explosion_arch`, `recharge_time`,
**`attachment_archetype`⁺**, **`detect_radius`⁺**, **`explosion_offset`⁺**,
**`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**, **`ids_name`⁺**, **`mass`⁺**,
**`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`type`⁺**

### `[ForSaleShipPlacement]`

86 sections.

`name`

### `[Char]`

84 sections.

`actor`, `NPC`, `fidget`, `spot`

Read by `content.dll` `CharacterEncounter::load` (`0x6fc4c30`), keys through a register: `actor`
`0x6fc5230`, `npc` `0x6fc530d`, `fidget` `0x6fc5379`.

### `[shape]`

82 sections.

`name`, `x`, `y`, `w`, `h`, **`shape_name`⁺**

In a shape file (`Freelancer.exe` `0x425b30`): `name`, or `shape_name`, the same key, and `x`, `y`,
`w`, `h`, on the texture last selected by `name` or `texture_name` — whatever header came between.
After a bare `tex_shape` it logs `bad texture id`.

### `[LootableZone]`

80 sections.

`asteroid_loot_container`, `asteroid_loot_commodity`, `dynamic_loot_container`,
`dynamic_loot_commodity`, `asteroid_loot_count`, `dynamic_loot_count`,
`asteroid_loot_difficulty`, `dynamic_loot_difficulty`, `zone`

Read by `common.dll` `0x62a531d`–`0x62a5598`. The four `asteroid_loot_*` keys are matched and
discarded (`0x62a54bb`–`0x62a54f0`); only the `dynamic_loot_*` keys and `zone` build anything, and a
section with neither `dynamic_loot_container` nor `dynamic_loot_commodity` is dropped (`0x62a5504`).
`dynamic_loot_count` takes two values, each truncated and raised to at least 1, the first lowered
to the second where larger (`0x62a5443`–`0x62a547c`). `dynamic_loot_difficulty` is clamped to
[1, 100] (`0x62a5491`–`0x62a54b6`): one destroyed rock in that many drops. A `zone` that is not
found logs a `get_non_const_zone` warning (`0x633c387`) and the record goes to the field's own zone.

### `[DecisionNode]`

79 sections.

`child_node`, `node_id`, `nickname`

### `[ShipClass]`

78 sections.

`member`*, `nickname`

### `[Motor]`

76 sections.

Archetype chain: `Projectile`.

`nickname`, `lifetime`, `accel`, `Delay`, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`force_gun_ori`⁺**, **`hit_pts`⁺**,
**`ids_info`⁺**, **`ids_name`⁺**, **`inherit`⁺**, **`loot_appearance`⁺**, **`lootable`⁺**,
**`mass`⁺**, **`mission_property`⁺**, **`owner_safe_time`⁺**, **`phantom_physics`⁺**,
**`requires_ammo`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`units_per_container`⁺**, **`use_count`⁺**, **`volume`⁺**

### `[Band]`

74 sections.

`render_parts`, `shape`, `height`, `offset_dist`, `fade`, `texture_aspect`, `color_shift`,
`vert_increase`, `ambient_intensity`, **`offset_percent`⁺**

Matched by the asteroid field loader at `Freelancer.exe` `0x520e43` — `is_header` called through a
register, which the resolver did not follow — and read by `0x54c630`. `offset_percent` is the
alternative to `offset_dist`: the same field, flagged as a fraction rather than a distance
(`0x54c748`). `texture_aspect` is stored × 1.15.

### `[ignite_fuse]`

74 sections.

`at_t`, `fuse`, `fuse_t`

Read by `server.dll` `0x6deea30`, and by `Freelancer.exe` `0x52c340`, which reads `fuse` and not
`fuse_t`. `fuse_t` defaults to 0 (`server.dll` `0x6dec26c`): the server lights the named fuse there
with the same burn and attacker, and unlights it when this burn is undone; the client only preloads
the fuse.

### `[Light]`

74 sections.

Archetype chain: `Light`.

`nickname`, `inherit`, `flare_cone`, `bulb_size`, `glow_size`, `avg_delay`, `blink_duration`,
`color`, `min_color`, `intensity`, `glow_color`, `lightsource_cone`, `always_on`,
`docking_light`, **`attachment_archetype`⁺**, **`DA_archetype`⁺**, **`explosion_arch`⁺**,
**`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**, **`ids_name`⁺**, **`lootable`⁺**,
**`mass`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**,
**`volume`⁺**

The running-light keys are read by `Freelancer.exe` `0x40ab30` (`FlashLight.cpp`). `glow_color`
defaults to `color` (`0x40abc6`), and `flare_cone` is two angles.

### `[Exterior]`

70 sections.

`shape`, `color`, `shape_weights`, `fill_shape`, `plane_slices`, `bit_radius`,
`bit_radius_random_variation`, `min_bits`, `max_bits`, `move_bit_percent`, `equator_bias`,
`opacity`, `thickness_edge`, `outer_edge`, `inner_edge`, `num_segments`, ~~`fade_range`~~,
`detail_shape`, `detail_tile`, `transition_dist`, ~~`ball_scale`~~, ~~`flash`~~,
`flash_radius`, `flash_size`*, `spin`

**Two sections under one name.** In a nebula INI (`Freelancer.exe` `0x504fb0`–`0x5053ea`) it reads
`shape` (at most 8), `shape_weights`, `fill_shape`, `plane_slices`, `bit_radius`, then
the variation key `bit_radius_random_variation`, and also `min_bits`, `max_bits`, `move_bit_percent`,
`equator_bias`, `opacity` and `color`. In a planet-ring INI (`PlanetRing.cpp`, `0x50a3a6`–`0x50a6eb`)
it reads `shape`, `color`, `opacity`, `thickness_edge`, `inner_edge`, `outer_edge`, `num_segments`,
then `detail_shape`, `detail_tile` and `transition_dist`. **`flash_radius`, `flash_size` and `spin` are not `[Exterior]`
keys**: their strings belong to the gun, munition and `[Cursor]` readers (`0x40a4e5`, `0x42e73d`,
`0x41e31b`), and the `SOLAR/BLACKHOLE` INIs that set them here are referenced by no system.

### `[CharacterEncounter]`

68 sections.

`Location`, `autoplay`, `relocate_player`, `action`, `mission_text_id`, `offer`, `accept`,
`decision`, `decline`, `start_room`, `nooffer_text_id`, `reject`, **`greet`⁺**, **`walkup`⁺**

`decline` and `reject` are the same script type (`0x6fc50d3`). `greet` and `walkup` are read and
never used; no reader of `nooffer_text_id`'s stored value was found.

### `[Clouds]`

66 sections.

`puff_shape`, `max_distance`, `puff_colora`, `puff_weights`, `puff_drift`, `puff_count`,
`puff_radius`, `puff_colorb`, `near_fade_distance`, `puff_max_alpha`, `lightning_intensity`,
`lightning_color`, `lightning_gap`, `lightning_duration`, ~~`puff_density`~~,
~~`puff_cloud_size`~~, ~~`puff_particles`~~, ~~`puff_size`~~, `puff_opacity`,
**`disable_batcher`⁺**, **`disable_clouds`⁺**, **`disable_lightning_bolts`⁺**,
**`disable_lightning_flash`⁺**, **`disable_wisps`⁺**, **`lightning_shape`⁺**,
**`lightning_size`⁺**, **`llight_color`⁺**, **`llight_range`⁺**, **`no_cloud_blend`⁺**,
**`zwrite_clouds`⁺**

Read by `Freelancer.exe` `0x550240`, for a nebula and for a planet ring alike. `puff_opacity` is
matched and discarded (`0x5504ee`). **`puff_colora` and `puff_colorb` are taken by order, not by
name**: the first colour line is A and the second B, and a lone line sets both (`0x550973`). Of the
engine-only keys, `lightning_shape`, `lightning_size`, `llight_range` and `llight_color` are stored
and never drawn, and only `disable_lightning_flash` is read back by the draw.

### `[critical_loot]`

62 sections.

`faction`, `archetype`, `name`, `type`, **`why_desired`⁺**

Read by `content.dll` `0x7085460` (`why_desired` at `0x7085681`). `name` is an index into the loot-name
table at string 330680, not a string id.

### `[Engine]`

62 sections.

Archetype chain: `Engine`.

`nickname`, `ids_name`, `ids_info`, `volume`, `mass`, `max_force`, `linear_drag`,
`reverse_fraction`, `cruise_charge_time`, `cruise_power_usage`, `rumble_sound`,
`indestructible`, `outside_cone_attenuation`, `inside_sound_cone`, `outside_sound_cone`,
`flame_effect`, `cruise_start_sound`, `cruise_loop_sound`, `cruise_stop_sound`,
`rumble_atten_range`, `rumble_pitch_range`, `cruise_disrupt_sound`,
`cruise_backfire_sound`, `trail_effect`, `power_usage`, `character_loop_sound`,
`character_pitch_range`, `trail_effect_player`, `character_start_sound`,
`engine_kill_sound`, `cruise_disrupt_effect`, `animation`, `hardpoint`, `RenderManager`*,
`Deformable`*, `FLAppearance`*, `VMeshWire`*, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**, **`inherit`⁺**,
**`lootable`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**

The effect and sound keys are read by `Freelancer.exe` `0x408ff0`, through the archetype's vtable;
each `*_range` pair must ascend, or the reader logs `out of order!`.

**Throttle feeds the flames** (`Freelancer.exe` `0x528020`). A smoothed value moves toward a target
— 0 with the engine off, 1 in cruise, the throttle otherwise — at `MAX_DELTA_FX_THROTTLE` per second,
snapping once within it. Every nozzle's `flame_effect` and trail are sent 0.9 times it, plus a tenth
of the cruise charge over `cruise_charge_time` while cruise charges, clamped to 0…1; 0.9 is the
default of `max_engine_fx_throttle`. The player's ship takes `trail_effect_player` and every other
ship `trail_effect`. A disruption spawns `cruise_disrupt_effect` once at each nozzle and sets the
charge to −`CRUISE_DISRUPT_TIME`. Every retail engine row is internal: the effects go on the hull's
nozzles (see `num_exhaust_nozzles` under `[ship]`), each with its hardpoint's whole transform.

### `[Fog]`

61 sections.

`color`, ~~`fog_enabled`~~, `near`, `distance`, `opacity`*

In a nebula INI the reader (`Freelancer.exe` `0x5054d0`) takes only `near` (default 0), `distance`
(default 10 000) and `color`. **`opacity` is not read here** — it is the nebula `[Exterior]`'s key
(`0x5053c4`) — and `fog_enabled` is read by nothing. The `[Fog] is obsolete` warning belongs to the
base-room reader (`common.dll` `0x6277559`), not to nebulae.

### `[Nebula]`

60 sections.

`file`, `zone`

Matched by the system loader (`Freelancer.exe` `0x553fd5`).

### `[NebulaLight]`

60 sections.

`ambient`, `sun_burnthrough_intensity`, `sun_burnthrough_scaler`

Read by the nebula INI's header loop (`Freelancer.exe` `0x504f90`–`0x506014`), as are
`[BackgroundLightning]` and `[DynamicLightning]`. The loop also recognises two headers no retail
file contains, [`[ObjectFog]`](#objectfog) and [`[Lightning]`](#lightning).

`ambient` is three bytes, truncated and not divided by 255; without it an object takes the system
ambient. `sun_burnthrough_intensity` defaults to 0.5 (`0x504ab7`) and `sun_burnthrough_scaler` to
1.75 (`0x504ac1`). A repeated header overwrites only the keys it sets.

### `[JobBlock]` ‡

59 sections.

`attack_preference`, `nickname`, `wait_for_leader_target`, `flee_when_leader_flees_style`,
`scene_toughness_threshold`, `flee_scene_threat_style`, `flee_when_hull_damaged_percent`,
`flee_no_weapons_style`, `loot_flee_threshold`, `attack_subtarget_order`, `field_targeting`,
`loot_preference`, `combat_drift_distance`, `maximum_leader_target_distance`,
`force_attack_formation`, `allow_player_targeting`

### `[Group]`

58 sections.

`rep`, `nickname`, `ids_name`, `ids_info`, `ids_short_name`, `group_num`*, `name`

### `[EncounterFormation]` ‡

57 sections.

`ship_by_class`*, `pilot_job`*, `behavior`, `arrival`*, `allow_simultaneous_creation`*,
`zone_creation_distance`*, `times_to_create`*, `formation_by_class`*, `make_class`*,
`ship_by_npc_arch`*, `formation`, `longevity`*, `explicit_group`*, `feeling_to_formation`*

### `[FactionProps]`

55 sections.

`npc_ship`, `space_costume`, `scan_for_cargo`, `formation`, `voice`, `affiliation`,
`legality`, `nickname_plurality`, `msg_id_prefix`, `jump_preference`, `mc_costume`,
`lastname`, `rank_desig`*, `formation_desig`, `firstname_male`, `large_ship_desig`,
`large_ship_names`, `scan_announce`, `scan_chance`, `firstname_female`,
**`assassinate_target`⁺**

Read by `content.dll` `0x703f700` from `faction_prop.ini`, every key through a register, the name
lists through `0x70420a0`; `rank_desig` is matched at no call site found. `assassinate_target` is
read and stored, and no reader of the stored value was found. A pilot is named from `firstname_male`
when male and `firstname_female` otherwise, with a `lastname`; an empty list there, in
`formation_desig` or in `large_ship_names` is read through a null range (`0x704166e`). A random
mission's assassination target is always male, so an enemy faction without `firstname_male` is never
one (`0x708b12e`–`0x708b19c`). `legality` decides which job-board zones a faction's offers use, and
`jump_preference` (`jumpgate` or `jumphole`, compared case-sensitively) which jumps they may cross.

### `[RepChangeEffects]`

55 sections.

`empathy_rate`, `event`, `Group`

Read by `content.dll` from `empathy.ini` (header `0x7040776`), keys through a register. The
`random_mission_success`, `_failure` and `_abortion` events are what a job-board mission's outcome
changes the offering faction's standing by, spread through its `empathy_rate` lines (`0x7040e00`);
a bribe spreads through the same rates (`0x7040ac0`).

### `[system]`

55 sections.

`nickname`, `file`, `pos`, `visit`, `strid_name`, `ids_info`, `msg_id_prefix`, `NavMapScale`,
`DirectX8`*, `TextureLibrary`*, `VMeshLibrary`*, `SoundManager`*, `SoundStreamer`*,
`MaterialAnimation`*, `MaterialBatcher`*, `alchemy`*, `FxRuntime`*, `MaterialLibrary`*,
**`links`⁺**, **`real_pos`⁺**

This is `universe.ini`'s system list. Inside a system file the header `[System]` is another name for
[`[SystemInfo]`](#systeminfo).

Read by `common.dll` `0x63372dd`–`0x63383c7` in one pass. `file` is relative to `DATA\UNIVERSE` and
is parsed the moment it is read (`0x6337452`), so `nickname` must come first and a `[Base]` must
come before the `[system]` whose objects name it. A repeated key overwrites, and any other key is
ignored without a message. `pos` is three floats with no default, and nothing resets it between
sections (`0x63372f6`–`0x63373ab`), so a section without it keeps the previous system's; only the
universe map reads it. A system's `visit` is a byte of which only `0x01` and `0x80` are tested
([ENGINE.md](ENGINE.md#visit-flags)), and `NavMapScale` defaults to 1; the system map multiplies
world X and Z by it (`Freelancer.exe` `0x4918a5`, `0x491a74`). `links` is matched and
dropped (`0x63382e5`), and `real_pos` is a second spelling of `pos` (`0x633836d`). Without
`msg_id_prefix` the loader logs an error unless the nickname is on a hard-coded list
(`0x633848b`–`0x633859d`). A second section with a nickname already taken is refused after its file
has been read, so that file's zones and objects stay (`0x633844d`).

### `[ambient]`

54 sections.

`color`

Matched by the system loader (`Freelancer.exe` `0x553b5e`); `color` is three bytes, truncated and
not clamped (`0x553b95`), so 300 wraps to 44.

### `[BackgroundLightning]`

54 sections.

`duration`, `gap`, `color`, **`intensity`⁺**

Read by the nebula INI's header loop (`Freelancer.exe` `0x504f90`–`0x506014`). Its defaults are
`gap` 10, `duration` 0.5, `color` a 0.25 grey and `intensity` 1 (constructor `0x504a50`–`0x504b90`);
`duration = 0` switches it off.

### `[Dust]`

54 sections.

`spacedust`

Read by the system loader (`Freelancer.exe` `0x553cf5`), which takes **only `spacedust`**
(`0x553d30`); the particle budgets are hard-coded, 80 and 30 (`0x54bdf1`, `0x54bdfb`).

### `[Music]`

54 sections.

`space`, `danger`, `battle`, **`explore`⁺**

Read by the system loader (`Freelancer.exe` `0x5537f6`): `space`, `danger` and `battle` are the
three music ids (`0x553830`, `0x553858`, `0x553879`), and `explore` is matched only to log `explore
music is obsolete` (`0x55389a`). `common.dll` reads `space` as well, at boot (`0x6337e0e`).

### `[Spiels]` ‡

54 sections.

`ShipDealer`*, ~~`CommodityDealer`~~, ~~`EquipmentDealer`~~

**Read by nothing.** The room reader (`common.dll` `0x6277400`) skips it without a message, and no
binary contains `Spiels`. The `ShipDealer` literal is a room nickname the executable compares.

### `[SystemInfo]`

54 sections.

`space_color`, `local_faction`, `name`, `rpop_solar_detection`, **`space_farclip`⁺**

Read by the system loader (`Freelancer.exe` `0x554183`), which also accepts the header `[System]`
(`0x5537ca`). `space_color` is red, green and blue as three bytes (`0x6140b4`) and is never
reset, so a file without it keeps the previous system's; before any system sets it, it is 0, 0, 64. `space_farclip` is the far plane: clamped to at least 1000, with the cull
distance 1000 less, and **reset to 21 000 on every load** (`0x553768` → `0x410130`).

**`name` is not read in this section.** The executable's handler takes `space_color` and
`space_farclip`, `content.dll` takes `rpop_solar_detection` (`0x7064930`) and `local_faction`
(`0x7065180`), and `common.dll` matches no `[SystemInfo]`.

### `[AttachedFX]`

52 sections.

Archetype chain: `Root`.

`nickname`, `particles`, `use_throttle`, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**,
**`ids_name`⁺**, **`mass`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**,
**`rotation_inertia`⁺**, **`type`⁺**

**`use_throttle` sends the effect the raw throttle** every frame, clamped to 0…1 (`Freelancer.exe`
`0x532490`). Without it nothing sets the effect's `sparam`, and it stays at 0.

### `[BeamSpear]`

51 sections.

`nickname`, `tip_length`, `tail_length`, `head_width`, `core_width`, `tip_color`, `core_color`,
`outter_color`, `tail_color`, `head_brightness`, `trail_brightness`, `head_texture`, `trail_texture`,
`flash_size`, **`core_length`⁺**, **`sec_core_color`⁺**, **`sec_core_width`⁺**,
**`sec_outter_color`⁺**

Read by `Freelancer.exe` `0x42e850` (keys `0x42e4a0`), from the `[Data] effects` loader at
`0x40ece6`, so any effects file may hold one. `[BeamSpear]` and `[BeamBolt]` fill **one record** and
differ only in its kind, so every key of either is read under both. `head_texture` (`star`, `ball`)
and `trail_texture` (`wide`, `thin`) are compared **case-sensitively**, anything else reading as the
first. A key before `nickname` is dropped, and a repeated nickname merges into the first record. At
the section's end `tip_length`, `tail_length` and `head_width` are raised to `core_width` (a bolt's
`tail_length` to `sec_core_width` instead) and both brightnesses clamped to 0.01–1 (`0x42e920`).
`[Effect] vis_beam` must come after the beam it names. Every float defaults to 1, every colour to
white and both textures to their first keyword (`0x42e430`); colours are 0–255, stored × 1/255. An
unknown key is ignored without a word. The beam's first frame is `core_width` wide, except the
player's own shots seen from outside the cockpit, where `flash_size` replaces it
(`0x4fa29a`–`0x4fa2af`). The beam is drawn by the executable, not Alchemy.

### `[Texture]`

51 sections.

`tex_shape`, `file`, `shape_name`, `dim`, `name`, `texture_name`

In a shape file — anything a `[TexturePanels] file` names, and `stararch.ini` — the reader is the
ShapeDB (`Freelancer.exe` `0x425b30`). `file` loads a `.txm` into the object's pool; `texture_name`,
or `name`, the same key, selects a texture by `GetCRC32` of its name across every library the pool
has loaded so far; `shape_name` declares a shape on it and a following `dim = x, y, w, h` gives its
rectangle; `tex_shape` declares a shape that is the whole texture of that name. Each pair of `dim`
values is a fraction when both are at most 1 and texels otherwise, and every shape's rectangle is
inset by 0.01 texel. Shape names compare on their first 23 characters, case folded, and the first
definition wins.

### `[FactionGood]`

48 sections.

`MarketGood`, `faction`

### `[Background]`

46 sections.

`nebulae`, `basic_stars`, `complex_stars`, **`file`⁺**

Read by `Freelancer.exe` `0x553c04`, which resets all three paths when it reaches the header — so a
system file without `[Background]` keeps the previous system's sky. **`file` is an alias of
`complex_stars`** (`0x553cba`). Which models load follows [`[PerfOptions]`](#perfoptions)
`star_sphere`: above 0.75 `nebulae` and `complex_stars`, above 0.5 `nebulae` and `basic_stars`,
above 0.001 `nebulae` alone, and otherwise none (`0x552cd0`, `0x552ea0`). **`basic_stars` and
`complex_stars` are alternatives, never drawn together**, and with no options file the full level
applies (`0x552c14`).

### `[star_glow]`

46 sections.

`nickname`, `shape`, `scale`, `inner_color`, `outer_color`, **`alpha`⁺**

Read by `Freelancer.exe` `0x50c950`. `alpha` is read and never used by the draw.

### `[EffectType]`

45 sections.

`nickname`, `Priority`, `generic_priority`, `lod_type`, `radius`, `visibility`, `update`,
`run_time`, `pbubble`, **`fps`⁺**

Read by `Freelancer.exe` `0x4fd5a0`, from the `[Data] effects` dispatcher at `0x40ecc4`, into a
table of 48 records compiled into the executable (`0x612a68`), the last `EFT_NUMTYPES`, which an
unknown `effect_type` maps to — see [ENGINE.md](ENGINE.md#effect-types). `nickname` picks the record by exact,
case-sensitive match on its `EFT_*` name, so a mod cannot add a type. `lod_type` is matched only
against the bands `EFT_LOD_TRAIL` to `EFT_LOD_SMALL_DISTANT`. `EFT_LOD_NONE`, and retail's one
`EFT_LOD_MED`, leave the compiled band in place. `visibility` and `update` test only for
`EXIST_OFFSCREEN` and `UPDATE_OFFSCREEN`; any other value is the other setting. **`fps` is read
(default 5) and never used.** An unknown nickname is a warning that skips the section (`0x4fd635`),
an unknown key an error, a negative `radius` an error replaced by 1, and a `pbubble` whose second
value is smaller a warning (`0x4fd84a`), kept as written. `lod_type`, `visibility` and `update` fold
case. With G = 1 − effect detail (`0x6129c8`), an effect is hidden while its priority is below G
(`0x4f88ab`) and beyond view depth `pb0 + (pb1 − pb0)·(1 − G)`, measured to the near edge of a
sphere of `radius` (`0x4f8924`–`0x4f895a`). A type without `EXIST_OFFSCREEN` is destroyed the first
frame it is hidden (`0x4f78a2`); one without `UPDATE_OFFSCREEN` stops its clock while hidden. A
positive `run_time` kills the effect that many seconds after it starts (`0x4f8a67`). The record's
index is the draw order: types draw in index order, newest first, with no depth sort (`0x4f7480`).

### `[Creation]` ‡

42 sections.

`permutation`

### `[Debris]` ‡

41 sections.

`nickname`, `death_method`*, `lifetime`, `linear_drag`, `angular_drag`, `explosion`, `trail`*,
`rotation_inertia`

### `[star]`

38 sections.

`nickname`, `star_glow`, `radius`, `star_center`, `intensity_fade_in`, `intensity_fade_out`,
`zone_occlusion_fade_in`, `zone_occlusion_fade_out`, `lens_glow`, `lens_flare`, `spines`

Read by `Freelancer.exe` `0x511020`. **`zone_occlusion_fade_in` and `zone_occlusion_fade_out` are
stored over `intensity_fade_in` and `intensity_fade_out`** (`0x511381`, `0x5113b7`). Every retail
`[star]` writes them after the intensity keys, so every star's intensity fades over 1 s, and the
zone-occlusion fades keep their 2 s defaults, which no file can change.

Each part is found by reopening `stararch.ini` and taking the first section of its kind whose
`nickname` matches, case folded. A repeated nickname therefore keeps its first definition, and a
missing one leaves the part at its defaults. An intensity fade of 0 is stored as 1e-7 (`0x511328`).

### `[destroy_root]`

37 sections.

`at_t`

Read by `server.dll` `0x6dedaa0`. It destroys the object at once, with its archetype's explosion
and loot (`0x6dedad0`).

### `[InternalFX]`

37 sections.

Archetype chain: `InternalFXEquip`.

`nickname`, `use_sound`, `use_animation`, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**,
**`ids_name`⁺**, **`inherit`⁺**, **`inside_sound_cone`⁺**, **`lootable`⁺**, **`mass`⁺**,
**`mission_property`⁺**, **`outside_cone_attenuation`⁺**, **`outside_sound_cone`⁺**,
**`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`units_per_container`⁺**, **`use_count`⁺**, **`volume`⁺**

**`use_animation` plays from creation and loops** (`CEInternalFX` `0x629ffd0`, loop flag 2) until
the equipment is gone; activation does not touch it. `use_sound` is a 3D sound at the object, started
at creation (`Freelancer.exe` `0x532530`). The three sound-cone keys are read by
`Archetype::CliEQInternalFX` (`Freelancer.exe` `0x40b9f0`).

### `[Shield]`

36 sections.

Archetype chain: `AttachedEquipment`.

`nickname`, `DA_archetype`, `HP_child`, **`attachment_archetype`⁺**, **`child_impulse`⁺**,
**`debris_type`⁺**, **`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**,
**`ids_info`⁺**, **`ids_name`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mass`⁺**,
**`mission_property`⁺**, **`parent_impulse`⁺**, **`phantom_physics`⁺**,
**`rotation_inertia`⁺**, **`separation_explosion`⁺**, **`toughness`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**,
**`volume`⁺**

**The bubble is never drawn.** Every retail `[Shield]` model holds nothing but an `SpConnect`
hardpoint, and the `.sur` beside it is the surface hits land on.

### `[CockpitCamera]`

34 sections.

`znear`, `fovx`, **`fovy`⁺**, **`zfar`⁺**

`DATA/cameras.ini` is read by `Freelancer.exe` `0x549830`, which accepts `[WinCamera]`,
`[CockpitCamera]`, `[ThirdPersonCamera]`, `[TurretCamera]`, `[RearViewCamera]` and `[DeathCamera]`
and logs `Unknown camera type?` for anything else — retail's `[ChaseCamera]` among them. Each takes
`fovx`, `fovy`, `znear` and `zfar` (`0x40f5f0`); both angles are full angles in degrees, halved on
read, and setting one derives the other through the aspect ratio. The base camera's constructor
sets a 35° half-angle, near 3 and far 250 000 (`0x40f150`), so a camera without `fovx` is 70°.

### `[cockpit]`

33 sections.

`mesh`, ~~`int_brightness`~~, `head_turn`*

### `[TurretCamera]`

33 sections.

`tether`, `yaw_rotate_speed`, `pitch_rotate_speed`, `accel_speed`, **`fovx`⁺**,
**`fovy`⁺**, **`zfar`⁺**, **`znear`⁺**

The four engine-only keys are `cameras.ini`'s — see [`[CockpitCamera]`](#cockpitcamera).
In a cockpit file the section is read by `Freelancer.exe` `0x51a2b0`: `tether` is three floats, and
`yaw_rotate_speed`, `pitch_rotate_speed` and `accel_speed` one each, each matched by `is_value`
through a register (`0x51a3a5`–`0x51a451`).

### `[EvadeDodgeBlock]` ‡

30 sections.

`evade_dodge_direction_weight`*, `nickname`, `evade_dodge_style_weight`*,
`evade_dodge_cone_angle`*, `evade_dodge_interval_time`*, `evade_dodge_time`*,
`evade_dodge_distance`*, `evade_dodge_interval_time_variance_percent`*,
`evade_activate_range`*, `evade_dodge_roll_angle`*, `evade_dodge_waggle_axis_cone_angle`*,
`evade_dodge_slide_throttle`*, `evade_dodge_turn_throttle`*,
`evade_dodge_corkscrew_turn_throttle`*, `evade_dodge_corkscrew_roll_throttle`*,
`evade_dodge_corkscrew_roll_flip_direction`*, `evade_dodge_cone_angle_variance_percent`*

### `[LootCrate]`

29 sections.

Archetype chain: `Equipment`.

`nickname`, `DA_archetype`, `hit_pts`, `mass`, `explosion_arch`, `LODranges`,
`material_library`, **`attachment_archetype`⁺**, **`explosion_resistance`⁺**, **`ids_info`⁺**,
**`ids_name`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mission_property`⁺**,
**`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`units_per_container`⁺**, **`use_count`⁺**, **`volume`⁺**

### `[mShipProps]` ‡

28 sections.

~~`archetype_id`~~, `prop`*

### `[DynamicAsteroid]`

26 sections.

Archetype chain: `Root`.

`nickname`, `DA_archetype`, `material_library`, `explosion_arch`, `particle_effect`,
**`attachment_archetype`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**,
**`ids_name`⁺**, **`inherit`⁺**, **`mass`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**,
**`rotation_inertia`⁺**, **`type`⁺**

**`particle_effect` is fed the rock's fade.** It is made afresh at the rock's origin with each life
(`Freelancer.exe` `0x5260ee`), and every frame the rock is drawn its `sparam` is set to the rock's
alpha (`0x5265d4`–`0x5265de`), 1 well inside the field's sphere and falling to 0 across the fade.

### `[LightAnim]`

26 sections.

`frame`, `name`

### `[Armor]`

24 sections.

Archetype chain: `Armor`.

`nickname`, `hit_pts_scale`, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**,
**`ids_name`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mass`⁺**, **`mission_property`⁺**,
**`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`units_per_container`⁺**, **`use_count`⁺**, **`volume`⁺**

### `[ConcaveObject]` ‡

23 sections.

`part`*, ~~`filename`~~

### `[Reserve]`

22 sections.

`spot`

### `[TrueType]`

22 sections.

`font`, `nickname`, `fixed_height`*

### `[WeaponType]`

21 sections.

`shield_mod`, `nickname`

### `[DocumentationNode]`

20 sections.

`node_id`, `documentation`, `child_node`

Matched at `content.dll` `0x708e66e`. `documentation` writes the same field as `nickname`, so it is a
builder command, not a comment.

### `[DynamicLightning]`

20 sections.

`gap`, `duration`, `color`, `ambient_intensity`, `intensity_increase`

Read by the nebula INI's header loop (`Freelancer.exe` `0x504f90`–`0x506014`). **It is on by
default.** The constructor (`0x504a50`–`0x504b90`) sets `gap` 3, `duration` 0.5, `color` white,
`ambient_intensity` 0.25 and `intensity_increase` 0.75, and the light is made whenever `duration` is
above 0 (`0x50604f`). A nebula without this section therefore flickers, and the seven retail
sections with `duration = 0` exist to turn it off.

### `[MissileBlock]` ‡

20 sections.

`nickname`, `missile_launch_interval_time`*, `missile_launch_interval_variance_percent`*,
`missile_launch_range`*, `missile_launch_cone_angle`*, `missile_launch_allow_out_of_range`*

### `[Cursor]`

19 sections.

`nickname`, `anim`, `Hotspot`*, `blend`*, `scale`, `spin`, `color`

### `[archetype]`

18 sections.

`ship`, `Simple`, `snd`, `equipment`, `Solar`, `voice`, **`asteroid`⁺**

A system file's preload lists, read by the system loader (`Freelancer.exe` `0x5538e7`).

### `[BuzzHeadTowardBlock]` ‡

17 sections.

`buzz_dodge_direction_weight`*, `buzz_head_toward_style_weight`*, `nickname`,
`buzz_min_distance_to_head_toward`*, `buzz_min_distance_to_head_toward_variance_percent`*,
`buzz_max_time_to_head_away`*, `buzz_head_toward_engine_throttle`*,
`buzz_head_toward_turn_throttle`*, `buzz_head_toward_roll_throttle`*,
`buzz_dodge_turn_throttle`*, `buzz_dodge_cone_angle`*,
`buzz_dodge_cone_angle_variance_percent`*, `buzz_dodge_waggle_axis_cone_angle`*,
`buzz_dodge_roll_angle`*, `buzz_dodge_interval_time`*,
`buzz_dodge_interval_time_variance_percent`*, `buzz_head_toward_roll_flip_direction`*,
`buzz_slide_throttle`*, `buzz_slide_interval_time`*,
`buzz_slide_interval_time_variance_percent`*

### `[impulse]`

16 sections.

`at_t`, `hardpoint`, `radius`, `force`, `pos_offset`, `damage`

Read by `server.dll` `0x6deebd0`, and by `Freelancer.exe` `0x52bf90`, which does not read `damage`.
On the server it sets off an explosion named `FuseImpulse` (`0x6deedd8`) with `radius`, impulse
`force` and hull damage `damage`, so it pushes and damages everything in range; the client only
pushes nearby objects with a linear impulse.

### `[spines]`

16 sections.

`spine`, `nickname`, `radius_scale`, `shape`, `min_radius`, `max_radius`

Read by `Freelancer.exe` `0x50fba0`.

### `[CargoPod]`

15 sections.

Archetype chain: `AttachedEquipment`.

`nickname`, `DA_archetype`, `hit_pts`, `mass`, `HP_child`, `LODranges`, `material_library`,
`debris_type`, `explosion_arch`, `parent_impulse`, `child_impulse`,
**`attachment_archetype`⁺**, **`explosion_resistance`⁺**, **`ids_info`⁺**, **`ids_name`⁺**,
**`inherit`⁺**, **`lootable`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**,
**`rotation_inertia`⁺**, **`separation_explosion`⁺**, **`toughness`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**,
**`volume`⁺**

### `[Style]` ‡

15 sections.

`name`, `font`, `bold`, `italic`, `underline`, `color`, `justify`

### `[Mission]`

14 sections.

`npc_ship_file`, `mission_title`, `mission_offer`, `reward`

### `[start_cam_particles]`

13 sections.

`effect`, `at_t`, `pos_offset`, `ori_offset`

Read by `Freelancer.exe` `0x52b2e0`, from the client fuse loader at `0x529ed1`. **`pos_offset` and
`ori_offset` are not read in this section.** **The effect's Alchemy is never drawn.** The action
builds a camera fade (`0x4f8e10`) that whitens the whole screen: fully within 2,000 of the camera and
not at all beyond 3,000. `effect` must still name an `[Effect]` with a `vis_effect`, or nothing
happens (`0x503f40`).

### `[IGraph]`

11 sections.

`point`, `nickname`, `type`

`type` is `FLOAT`, `COLOR` or `INTEGER`, and `point = x, y`; a `COLOR` point's `y` is a signed
32-bit ARGB. Loaded by `Freelancer.exe` `0x4197e0` (`GraphLibrary.cpp`) and evaluated piecewise
linearly between points.

### `[SolarFormation]`

11 sections.

`pos`, `nickname`, `type`

### `[FormationBlock]` ‡

10 sections.

`nickname`, `force_attack_formation_active_time`*, `force_attack_formation_unactive_time`*,
`break_formation_damage_trigger_percent`*, `break_formation_damage_trigger_time`*,
`break_formation_missile_reaction_time`*, `break_apart_formation_missile_reaction_time`*,
`break_apart_formation_on_evade_break`*, `break_formation_on_evade_break_time`*,
`formation_exit_top_turn_break_away_throttle`*, `formation_exit_roll_outrun_throttle`*,
`formation_exit_max_time`*

### `[Mine]`

10 sections.

Archetype chain: `Mine`.

`nickname`, `explosion_arch`, `loot_appearance`, `units_per_container`, `requires_ammo`,
`hit_pts`, `one_shot_sound`, `detonation_dist`, `lifetime`, `force_gun_ori`, `DA_archetype`,
`material_library`, `ids_name`, `ids_info`, `mass`, `volume`, `owner_safe_time`, `linear_drag`,
`seek_dist`, `top_speed`, `acceleration`, `const_effect`, **`attachment_archetype`⁺**,
**`const_effect_delay`⁺**, **`explosion_resistance`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mission_property`⁺**,
**`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`use_count`⁺**

### `[MineDropper]`

10 sections.

Archetype chain: `Launcher`.

`nickname`, `ids_name`, `ids_info`, `DA_archetype`, `material_library`, `HP_child`, `hit_pts`,
`explosion_resistance`, `debris_type`, `parent_impulse`, `child_impulse`, `volume`, `mass`,
`damage_per_fire`, `power_usage`, `refire_delay`, `muzzle_velocity`, `toughness`,
`projectile_archetype`, `dry_fire_sound`, `separation_explosion`, `lootable`, `LODranges`,
**`attachment_archetype`⁺**, **`explosion_arch`⁺**, **`inherit`⁺**, **`mission_property`⁺**,
**`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`units_per_container`⁺**, **`use_animation`⁺**, **`use_count`⁺**

### `[AsteroidMine]`

9 sections.

Archetype chain: `Asteroid`.

`nickname`, `DA_archetype`, `material_library`, `explosion_arch`, `detect_radius`,
`explosion_offset`, `recharge_time`, ~~`explosion_impulse`~~, `phantom_physics`,
**`attachment_archetype`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**,
**`ids_name`⁺**, **`mass`⁺**, **`mission_property`⁺**, **`rotation_inertia`⁺**, **`type`⁺**

### `[CloakingDevice]`

9 sections.

Archetype chain: `CloakingDevice`.

`nickname`, `ids_name`, `ids_info`, `hit_pts`, `DA_archetype`, `material_library`, `HP_child`,
`mass`, `volume`, `power_usage`, `cloakin_time`, `cloakout_time`, `cloakin_fx`, `cloakout_fx`,
**`attachment_archetype`⁺**, **`child_impulse`⁺**, **`debris_type`⁺**, **`explosion_arch`⁺**,
**`explosion_resistance`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mission_property`⁺**,
**`parent_impulse`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`separation_explosion`⁺**, **`toughness`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`units_per_container`⁺**, **`use_count`⁺**

**Out means out of sight.** Cloaking ramps linearly over `cloakout_time` and decloaking over
`cloakin_time` (`CECloakingDevice::Update` `0x6294910`). The hull's alpha is multiplied by one minus
the ramp through the cloak material (`flmaterials.dll` `0x66f4010`), or by one minus its smoothstep on
a `nomad` hull's own material (`0x66f8c50`). At the end of the ramp nothing of the ship draws,
attached particle effects included; until then they draw at full strength (`Freelancer.exe`
`0x533710`, `0x4f86c0`). Cloaking spawns `cloakout_fx` on the device's root part; decloaking spawns
`cloakin_fx` detached at the ship's origin, with its velocity (`0x532010`). Reversing mid-ramp snaps
the device back and freezes the fade where it was (`0x6294a20`), and a new device starts cloaked
(`0x6294710`).

### `[MissionCreatedSolar]`

9 sections.

`base`, `pos`, `ids_info`

### `[EvadeBreakBlock]` ‡

8 sections.

`evade_break_direction_weight`*, `evade_break_style_weight`*, `nickname`,
`evade_break_roll_throttle`*, `evade_break_time`*, `evade_break_interval_time`*,
`evade_break_afterburner_delay`*, `evade_break_turn_throttle`*,
`evade_break_afterburner_delay_variance_percent`*, `evade_break_attempt_reverse_time`*,
`evade_break_reverse_distance`*

### `[layer]`

8 sections.

`Texture`, `color`, ~~`near_alpha_factor`~~, ~~`far_alpha_factor`~~, `radius_factor`,
`u_offset`, `v_offset`, `du`, `dv`, `v_scale`, **`far_alpha`⁺**, **`near_alpha`⁺**

A sub-section of the [`[gate_tunnel]`](#gate_tunnel) above it, read in the same loop
(`Freelancer.exe` `0x4fe6e9`). A third layer logs `more than two layers specified in gate tunnel`
and is skipped. **The alpha keys are `near_alpha` and `far_alpha`** (`0x4fe80b`, `0x4fe82e`), which
default to 1 and 0. Every retail layer spells them `near_alpha_factor` and `far_alpha_factor`, which
nothing matches, so every layer draws at alpha 1 near and 0 far. `texture` names a shape in the
effect shape file.

### `[damage_root]`

7 sections.

`at_t`, `damage_type`, `hitpoints`

Read by `server.dll` `0x6dedb50`. `hitpoints` is an integer. `damage_type` folds case, and only
`absolute` is tested (`0x6dedb98`): absolute damage is applied only if the root stays above 0, and
any other value, or none, is relative damage that can kill.

### `[DetailSwitchTable]`

7 sections.

`switch`, **`fovx`⁺**, **`sizex`⁺**

`DetailSwitchTable::read_from_ini` (`common.dll` `0x62feec0`). `switch` rows are appended in file order
and looked up assuming the percentage descends. `fovx` is stored halved, defaulting to 40; `sizex`
defaults to 1280 and is read but never used. Every part listed after a table takes it until the next;
how a level's fraction becomes a distance is in [DEFORMABLE.md](../modules/DEFORMABLE.md#level-fractions).

### `[lens_flare]`

7 sections.

`bead`, `nickname`, `shape`, `min_radius`, `max_radius`

Read by `Freelancer.exe` `0x50f3a0`.

### `[MsnRandEnc]`

7 sections.

`label`, `nickname`, `encounter_type`, `attacker_rep_name`, `activation_type`, `formation`,
`num_forms`, `target_ship_name`

### `[PetalAnimations]`

7 sections.

`anim`

Each header starts a fresh list that every part after it takes (`load_bodyparts` `0x6300500`), and
**nothing reads the lists back**: `bodypart::get_petal_anims` has no caller in any retail binary. The
scripts a character plays are found by name across the `.anm` files the global `[Animations]` lists.

### `[Skeleton]`

7 sections.

`sex`, **`nomotion`⁺**

`sex` is `none`, `male` or `female` (0, 1, 2; anything else is 0), and every part listed after it takes
it until the next `[Skeleton]`. Retail's hands are all in `none` groups. `nomotion` is read only to
log that it is obsolete.

### `[BuzzPassByBlock]` ‡

6 sections.

`buzz_break_direction_weight`*, `buzz_pass_by_style_weight`*, `nickname`,
`buzz_distance_to_pass_by`*, `buzz_pass_by_time`*, `buzz_break_turn_throttle`*,
`buzz_break_direction_cone_angle`*, `buzz_pass_by_roll_throttle`*,
`buzz_drop_bomb_on_pass_by`*

### `[CountermeasureBlock]` ‡

6 sections.

`nickname`, `countermeasure_active_time`*, `countermeasure_unactive_time`*

### `[EffectLOD]`

6 sections.

`type`, `max_lod_screen_size`, `min_lod_screen_size`, `min_screen_size`

Read by `Freelancer.exe` `0x42dae0`, from the `[Data] effects` dispatcher at `0x40eca9`. **`type` must
be the first key**, or the section is skipped without an error. Its value is matched, folding case,
against `lod_type_trail` to `lod_type_small_distant`; an unknown value is an error, and that section
is dropped. Each band is three screen sizes against `s`, the type's `radius` projected to pixels at
the effect's depth (`0x42da00`). At `s ≤ min_screen_size` the effect is hidden; otherwise its LOD is
`(s − min_lod_screen_size) / (max_lod_screen_size − min_lod_screen_size)` clamped to 0–1
(`0x42da52`), and a type in no band keeps 1 (`0x42dcd0`). The value is the input of every Alchemy
node's `Emitter_LODCurve` and `Appearance_LODCurve`.

### `[lefthand]` ‡

6 sections.

`nickname`, `mesh`, **`multilevel`⁺**

### `[MetaBehavior]`

6 sections.

`nickname`, `MB_GotoGuide`*

### `[RepairBlock]` ‡

6 sections.

`nickname`, `use_shield_repair_pre_delay`*, `use_shield_repair_post_delay`*,
`use_shield_repair_at_damage_percent`*, `use_hull_repair_pre_delay`*,
`use_hull_repair_post_delay`*, `use_hull_repair_at_damage_percent`*

### `[righthand]` ‡

6 sections.

`nickname`, `mesh`, **`multilevel`⁺**

### `[Thruster]`

6 sections.

Archetype chain: `Thruster`.

`nickname`, `ids_name`, `ids_info`, `DA_archetype`, `HP_child`, `hit_pts`,
`explosion_resistance`, `debris_type`, `parent_impulse`, `child_impulse`, `volume`, `mass`,
`max_force`, `particles`, `hp_particles`, `power_usage`, `lootable`, `separation_explosion`,
`LODranges`, `material_library`, **`attachment_archetype`⁺**, **`explosion_arch`⁺**,
**`inherit`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`toughness`⁺**, **`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**,
**`use_count`⁺**

**`particles` is spawned once, at `hp_particles` on the thruster's own model**, and runs as long as
the thruster exists. Activation sends it `sparam` 1 and deactivation 0 (`Freelancer.exe` `0x52eeef`,
`0x52ef12`), so the particles alive when it stops finish their lives.

### `[DamageReactionBlock]` ‡

5 sections.

`nickname`, `evade_break_damage_trigger_percent`*, `evade_dodge_more_damage_trigger_percent`*,
`engine_kill_face_damage_trigger_percent`*, `engine_kill_face_damage_trigger_time`*,
`roll_damage_trigger_percent`*, `roll_damage_trigger_time`*,
`afterburner_damage_trigger_percent`*, `afterburner_damage_trigger_time`*,
`brake_reverse_damage_trigger_percent`*, `drop_mines_damage_trigger_percent`*,
`drop_mines_damage_trigger_time`*, `fire_guns_damage_trigger_percent`*,
`fire_guns_damage_trigger_time`*, `fire_missiles_damage_trigger_percent`*,
`fire_missiles_damage_trigger_time`*

### `[FlashlightLine]`

5 sections.

`hardpoint`, `icolor`, `scale`, `gap`, `blink`, `numlights`, `endpause`, **`color`⁺**,
**`setpoint`⁺**

### `[JumpGateEffect]`

5 sections.

`nickname`, `glow_ring_effect`, `glow_ring_hp`, `glow_create_time`, `jump_out_time`,
`jump_out_tunnel_time`, `jump_in_tunnel_time`, `jump_in_time`, `kill_time_before_done`,
`jump_tunnel_effect`, `jump_tunnel`, `jump_ambient`, `jump_background_color`

Read by `Freelancer.exe` `0x5020c0` from `[Data] jump_effect`; an unknown key logs `UNKNOWN
jumpeffect parameter`. **Only the ids are reset between sections** (`0x50217a`–`0x5021b2`): the five
timings, both colours and the glow-ring counts carry over, so a record that omits a key keeps the
previous record's value. Retail sets every key in every record. The three glow-ring keys repeat up
to five times, and the ring count is the smallest of their three counts. `jump_tunnel` names the
[`[gate_tunnel]`](#gate_tunnel) drawn for the player's jump (`0x5023f4`, looked up at `0x503777`).
A gate with no record jumps with timings 0, 5, 5 and 0 and a `kill_time_before_done` of 0.5
(`0x503518`).

### `[KeyMap]` ‡

5 sections.

`key`, `nickname`

### `[lens_glow]`

5 sections.

`nickname`, `shape`, `radius_scale`, `inner_color`, `outer_color`, `glow_fade_in_seconds`,
`glow_fade_out_seconds`, **`interior_ray_tween`⁺**, **`interior_tween`⁺**, **`max_LOD`⁺**

Read by `Freelancer.exe` `0x50d420`. `interior_tween` defaults to 0.5, `interior_ray_tween` to 1.0
and `max_LOD` to 5.

### `[StrafeBlock]` ‡

5 sections.

`nickname`, `strafe_run_away_distance`*, `strafe_attack_throttle`*, `strafe_turn_throttle`*

### `[BeamBolt]`

4 sections.

`nickname`, `tip_length`, `tail_length`, `core_length`, `head_width`, `core_width`,
`sec_core_width`, `tip_color`, `core_color`, `outter_color`, `sec_core_color`, `sec_outter_color`,
`tail_color`, `head_brightness`, `trail_brightness`, `head_texture`, `trail_texture`, `flash_size`

Read by the same code as `[BeamSpear]`; see its note. `sec_core_width` is read, and used only by the
end-of-section clamp.

### `[gate_tunnel]`

4 sections.

`nickname`, `write_depth_buffer`, `num_spline_control_points`, `x_range`, `y_range`,
`z_range`, `min_radius`, `max_radius`, `far_radius_factor`, `min_speed`, `max_speed`,
`time_to_max_speed`, ~~`fade_distance`~~, `near_alpha`*, `far_alpha`*, `num_t_steps`,
`num_s_steps`, `min_rotation`, `max_rotation`, `min_rgb`, `max_rgb`

Read by `Freelancer.exe` `0x4fe1c0`, the `[Data] gate_tunnels` loader (called from `0x54ac92`).
**`near_alpha` and `far_alpha` are not read in this section**; only its [`[layer]`](#layer)s match
them. Two keys are read and have no effect: the rotation spline `min_rotation` and `max_rotation`
fill is never sampled by the draw (`0x4ffe50`), and neither is the blue channel of `min_rgb` and
`max_rgb`, the draw taking blue from the red spline. `write_depth_buffer` and
`num_spline_control_points` are read as floats. Every retail `[JumpGateEffect]` names
`gate_tunnel_bretonia`, so the other three tunnels are never drawn.

### `[Montage]`

4 sections.

`size`, `num_pages`*, `Texture`*, `interface\HUD\HUD_contactall.3db`*,
`interface\HUD\HUD_contactfrieghter.3db`*, `interface\HUD\HUD_contactgroup.3db`*,
`interface\HUD\HUD_contactimportant.3db`*, `interface\HUD\HUD_contactjumpgate.3db`*,
`interface\HUD\HUD_contactlootabledepot.3db`*, `interface\HUD\HUD_contactnomad.3db`*,
`interface\HUD\HUD_contactplanet.3db`*, `interface\HUD\HUD_contactship.3db`*,
`interface\HUD\HUD_contactstation.3db`*, `interface\HUD\HUD_contacttradelane.3db`*,
`interface\HUD\HUD_contacttransport.3db`*, `interface\HUD\HUD_contactwaypoint.3db`*,
`interface\HUD\HUD_contactweaponplat.3db`*, `interface\HUD\HUD_formation.3db`*,
`interface\HUD\HUD_nextenemy.3db`*, ~~`interface\HUD\HUD_playershipinfo.3db`~~,
`interface\HUD\HUD_targetedobject.3db`*, ~~`interface\HUD\HUD_weaponlist.3db`~~,
`interface\NeuroNet\Inventory\x.3db`*, `interface\NeuroNet\icons\NN_Chat.3db`*,
`interface\NeuroNet\icons\NN_Inventory.3db`*, `interface\NeuroNet\icons\NN_PlayerStatus.3db`*,
`interface\NeuroNet\icons\NN_info.3db`*, `interface\NeuroNet\icons\NN_request.3db`*,
`interface\NeuroNet\icons\NN_storystar.3db`*, `interface\hud\HUD_communication.3db`*,
`interface\hud\HUD_contactlist.3db`*, ~~`interface\hud\HUD_infocard.3db`~~,
`interface\hud\HUD_nextsub.3db`*, `interface\hud\HUD_previoussub.3db`*,
`interface\hud\HUD_repairactivate.3db`*, `interface\hud\HUD_scanshipinactive.3db`*,
`interface\hud\HUD_shieldgaugeicon.3db`*, `interface\hud\HUD_tractorbeam2.3db`*,
`interface\hud\HUD_trade.3db`*, `interface\hud\hud_ShipInfo_button.3db`*,
`interface\hud\hud_ShipTarget.3db`*, `interface\HUD\HUD_chat.3db`*,
`interface\HUD\HUD_contactbattleship.3db`*, `interface\HUD\HUD_contactloot.3db`*,
`interface\HUD\HUD_contactotherplayers.3db`*, ~~`interface\HUD\MNVR_dock.3db`~~,
~~`interface\HUD\MNVR_dock_gray.3db`~~, ~~`interface\HUD\MNVR_formation.3db`~~,
~~`interface\HUD\MNVR_formation_gray.3db`~~, ~~`interface\HUD\MNVR_freeflight.3db`~~,
~~`interface\HUD\MNVR_freeflight_gray.3db`~~, ~~`interface\HUD\MNVR_goto.3db`~~,
~~`interface\HUD\MNVR_goto_gray.3db`~~, `interface\HUD\hud_mnvrwarp.3db`*,
`interface\NeuroNet\icons\NN_Map.3db`*, `CurrentTargetCorner`*, `NSArrowBackground`*,
`CurrentTargetArrow`*, `CurrentTargetArrowHat`*, ~~`CurrentTargetArrowQuotes`~~,
`CurrentTargetArrowOutline`*, `CurrentTargetHat`*, `NSTargetHat`*, `NSTargetArrow`*,
`WaypointTarget`*, `LootArrow`*, `WaypointArrow`*, `PlayerArrow`*, `LootArrowBackground`*,
`PlayerArrowBackground`*, `WaypointArrowBackground`*, ~~`Dummy1`~~, ~~`CurrentTargetTalking`~~,
~~`NSTargetTalking`~~, ~~`PlayerTalking`~~

### `[MsnLoot]`

4 sections.

`nickname`, `archetype`, `string_id`, `velocity`, `equip_amount`, `health`, `Can_Jettison`,
`rel_pos_obj`, `rel_pos_offset`, `position`, **`angular_velocity`⁺**, **`label`⁺**,
**`orientation`⁺**

### `[TrailBlock]` ‡

4 sections.

`nickname`, `trail_lock_cone_angle`*, `trail_break_time`*, `trail_max_turn_throttle`*,
`trail_distance`*, `trail_min_no_lock_time`*, `trail_break_roll_throttle`*,
`trail_break_afterburner`*

### `[CounterMeasure]`

3 sections.

Archetype chain: `CounterMeasure`.

`force_gun_ori`, `nickname`, `hit_pts`, `loot_appearance`, `units_per_container`,
`one_shot_sound`, `const_effect`, `lifetime`, `DA_archetype`, `material_library`, `ids_name`,
`ids_info`, `mass`, `volume`, `owner_safe_time`, `requires_ammo`, `linear_drag`, `range`,
`diversion_pctg`, **`attachment_archetype`⁺**, **`const_effect_delay`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mission_property`⁺**,
**`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`use_count`⁺**

### `[CounterMeasureDropper]`

3 sections.

Archetype chain: `CounterMeasureDropper`.

`nickname`, `ids_name`, `ids_info`, `DA_archetype`, `material_library`, `HP_child`, `hit_pts`,
`explosion_resistance`, `debris_type`, `parent_impulse`, `child_impulse`, `volume`, `mass`,
`power_usage`, `refire_delay`, `muzzle_velocity`, `flash_particle_name`, `flash_radius`,
`light_anim`, `projectile_archetype`, `separation_explosion`, `AI_range`, `lootable`,
**`attachment_archetype`⁺**, **`damage_per_fire`⁺**, **`explosion_arch`⁺**, **`inherit`⁺**,
**`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`toughness`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_animation`⁺**,
**`use_count`⁺**

### `[damage_group]`

3 sections.

`group_name`, `at_t`, `damage_type`, `hitpoints`

Read by `server.dll` `0x6dee120`. `hitpoints` is an integer. `damage_type` is compared exactly
(`0x6dee1ed`); `absolute` sets the group to `hitpoints`.

### `[EngineKillBlock]` ‡

3 sections.

`nickname`, `engine_kill_use_afterburner`*, `engine_kill_search_time`*,
`engine_kill_face_time`*, `engine_kill_afterburner_time`*, `engine_kill_max_target_distance`*

### `[ExclusionBand]`

3 sections.

`zone`, `render_parts`, `shape`, `height`, `offset_dist`, `fade`, `texture_aspect`,
`color_shift`, `ambient_intensity`, `cull_mode`, `vert_increase`, **`offset_percent`⁺**

Matched at `Freelancer.exe` `0x520ee6` and read by the `[Band]` reader, `0x54c630`; `zone` is read
by the field loader itself (`0x520fa4`), and one that cannot be found logs
`Exband (exclusion zone band) linked to missing Zone`. The band keeps a null zone, which its build
dereferences without a test (`Freelancer.exe` `0x54c8e0`).

### `[MineBlock]` ‡

3 sections.

`nickname`, `mine_launch_interval`*, `mine_launch_cone_angle`*, `mine_launch_range`*

### `[MissileReactionBlock]` ‡

3 sections.

`nickname`, `evade_missile_distance`*, `evade_break_missile_reaction_time`*,
`evade_slide_missile_reaction_time`*, `evade_afterburn_missile_reaction_time`*

### `[reverb]` ‡

3 sections.

`nickname`, ~~`settings`~~

### `[CloseChunks]` ‡

2 sections.

`num`*, ~~`fade_range`~~, `shape`, `size`, `color`, ~~`thickness`~~

### `[Constants]`

2 sections.

`COLLISION_DAMAGE_FACTOR`, `MUSIC_CROSS_FADE_DELAY`, `MUZZLE_CONE_ANGLE`,
`PLAYER_COLLISION_GROUP_HIT_PTS_SCALE`, `PLAYER_ATTACHED_EQUIP_HIT_PTS_SCALE`,
**`fire_failed_delay`⁺**, **`fire_failed_sound`⁺**, **`jettisoned_cargo_velocity`⁺**,
**`loot_owner_safe_time`⁺**, **`loot_unseen_life_time`⁺**, **`loot_unseen_radius`⁺**,
**`max_player_ammo`⁺**, **`snd_cargo_jettisoned`⁺**, **`teststring`⁺**, **`testvalue`⁺**

### `[DACOM]` ‡

2 sections.

`IgnoreDACOMEnv`*, `DllPath`*

### `[FadeChunks]` ‡

2 sections.

`num`*, ~~`fade_range`~~, `shape`, `size`, `color`, ~~`thickness`~~

### `[KnowledgeMapTable]`

2 sections.

`Map`

### `[Libraries]` ‡

2 sections.

~~`ReadFile.dll`~~, ~~`x86math.dll`~~, ~~`EngBase.dll`~~, ~~`system.dll`~~, ~~`RP8.dll`~~,
~~`Thorn.dll`~~, ~~`Shading.dll`~~, ~~`RendComp.dll`~~, ~~`SoundStreamer.dll`~~,
~~`SoundManager.dll`~~, ~~`Deformable2.dll`~~, ~~`alchemy.dll`~~, ~~`ximage.dll`~~,
~~`.\flmaterials.dll`~~, ~~`@include FL_DevOnlyLibs.ini`~~, ~~`DebugLib.dll`~~

### `[Player]`

2 sections.

`house`, `visit`, `equip`, `cargo`, `name`, `rank`, `money`, `voice`, `Costume`,
~~`com_costume`~~, `system`, `base`, `%%PACKAGE%%`*, `Description`, `pos`, `rotate`, `log`,
`ship_archetype`, **`base_cargo`⁺**, **`base_collision_group`⁺**, **`base_equip`⁺**,
**`base_hull_status`⁺**, **`collision_group`⁺**, **`descrip_strid`⁺**, **`group`⁺**,
**`hull_status`⁺**, **`initial_rep`⁺**, **`interface`⁺**, **`last_base`⁺**, **`location`⁺**,
**`logid`⁺**, **`num_kills`⁺**, **`num_misn_failures`⁺**, **`num_misn_successes`⁺**,
**`rep_group`⁺**, **`starting_ring`⁺**, **`tstamp`⁺**, **`wg`⁺**

A save's player, read by `server.dll` from `0x6e36e6a`, partly through a register
(`0x6e37166`–`0x6e38198`). `base` is the base the player is in, or else the last one, and
`last_base` the last; `location` is a room id, written only when not 0 (`0x6e3d160`). An unknown
base is an error. `rotate` is written from the ship's orientation by `server.dll` `0x6e3d065`, in
degrees with `%g`, so to six significant digits; when `√(R00² + R10²)` is at most 2⁻¹⁹
(`0x6e59604`) it writes z = 0 and puts the whole twist in x.

### `[RenderManager]` ‡

2 sections.

`TriMesh`*, `SphereMesh`*, `VMesh`*

### `[Scanner]`

2 sections.

Archetype chain: `Scanner`.

`nickname`, `ids_name`, `ids_info`, `volume`, `mass`, `range`, `cargo_scan_range`, `lootable`,
**`attachment_archetype`⁺**, **`DA_archetype`⁺**, **`explosion_arch`⁺**,
**`explosion_resistance`⁺**, **`hit_pts`⁺**, **`inherit`⁺**, **`mission_property`⁺**,
**`phantom_physics`⁺**, **`power_usage`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**

### `[;Display]` ‡

1 section.

~~`fullscreen`~~, `size`, `color_bpp`, `depth_bpp`

### `[;TextureLibrary]` ‡

1 section. No properties.

### `[alchemy]` ‡

1 section.

`Alchemy.useMaterialBatcher`*, `FxBasicAppearance.poolSize`*, `FxRectAppearance.poolSize`*,
`FxPerpAppearance.poolSize`*, `FxOrientedAppearance.poolSize`*, `FLBeamAppearance.poolSize`*,
`FLDustAppearance.poolSize`*, `FxMeshAppearance.poolSize`*, `FxParticleAppearance.poolSize`*

### `[Animations]`

1 section.

`anim`, **`preload`⁺**

### `[AsteroidConsts]` ‡

1 section.

~~`MAX_ASTEROID_LOOT_DAMAGE`~~, ~~`MAX_LOOT_PER_ASTEROID`~~

### `[audio]`

1 section.

`option`

### `[BaseFrame]`

1 section.

`subcontrol`*, `behavior`, `mesh`, `offset`, `mouse_size`*, ~~`mouse_offset`~~, `no_z_enable`,
`z_order`*, `tooltip`*

### `[BatchedMaterials]` ‡

1 section.

`type`

### `[ButtonControl1]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[ButtonControl2]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[ButtonControl3]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[ButtonControl4]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[ButtonControl5]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[CFG]`

1 section.

`ear_doppler_factor`*, `ducking_rtc_down_by`*, `ducking_rtc_down_time`*,
~~`default_loop_style`~~, ~~`default_crv_pitch`~~, ~~`default_crv_attenuation`~~,
~~`default_reverb`~~, `music_fade_time`*, `cross_fade_silence`*, `cockpit_attenuation`*,
`ducking_spaceflight_down_by`*, `ducking_spaceflight_down_time`*,
`ducking_spaceflight_up_time`*, `spaceflight_dialogue_pan_range`*, `ducking_comm_down_by`*,
`ducking_comm_down_time`*, `ducking_comm_up_time`*, ~~`master_music`~~, ~~`master_ambient`~~,
~~`master_interface`~~, ~~`master_sfx`~~, ~~`master_voice`~~

### `[ChaseCamera]` ‡

1 section.

`fovx`

Not a camera `cameras.ini`'s loader accepts: it logs `Unknown camera type? (%s)` (`Freelancer.exe`
`0x5499b8`) and skips the section.

### `[CommConsts]`

1 section.

`COMM_PLAYER_FAR_DIST`, `COMM_PLAYER_FAR_DIST_ATTEN`, `CHATTER_MAX_DIST`,
`CHATTER_MAX_DIST_ATTEN`, `CHATTER_START_ATTEN`, `COMM_CONFLICT_PRIORITY_CUTOFF`,
`WALLA_MAX_DIST`, `WALLA_MAX_DIST_ATTEN`, `WALLA_START_ATTEN`, `WALLA_PRIORITY_CUTOFF`

### `[ContactList]` ‡

1 section. No properties.

### `[Core]` ‡

1 section. No properties.

### `[CruiseProgress]` ‡

1 section. No properties.

### `[DamageIndicator]` ‡

1 section. No properties.

### `[Data]`

1 section.

`voices`, `fuses`, `effects`, `sounds`, `equipment`, `goods`, `loadouts`, `markets`,
`ships`, `Solar`, `universe`, `Constants`, `fonts`, ~~`fonts_dir`~~, `rich_fonts`,
`explosions`, `Debris`, `Asteroids`, `bodyparts`, `costumes`, `PetalDB`, `effect_shapes`,
~~`concave`~~, `intro`, `gate_tunnels`, `groups`, `HUD`, `jump_effect`, `stars`*, `IGraph`,
`bases`, `NewCharDB`, `WeaponModDB`, `RtcSlider`

`Freelancer.exe` reads its own keys at `0x5b0cb6`, calling `is_header` and `is_value` through a
register, which the sweep did not follow: `fonts`, `rich_fonts`, `sounds`, `voices`, `effects` (each
file to the effects loader at `0x40eac0`), `effect_shapes`, `debris`, `intro`, `HUD` and `igraph`
(`0x5b0ce9`–`0x5b0eba`). `fuses` is read by `common.dll` `0x62be620`.

### `[DeathCamera]`

1 section.

`fovx`, **`fovy`⁺**, **`zfar`⁺**, **`znear`⁺**

A `cameras.ini` camera — see [`[CockpitCamera]`](#cockpitcamera).

### `[Diff2Money]`

1 section.

`Diff2Money`

### `[dump_cargo]`

1 section.

`at_t`, `origin_hardpoint`

Read by `server.dll` `0x6def500`.

### `[EngineEquipConsts]`

1 section.

`CRUISE_DISRUPT_TIME`, `MAX_DELTA_FX_THROTTLE`, `THROTTLE_STEADY_TIME`,
`THROTTLE_ATTEN_MOD_RANGE`, `DELTA_THROTTLE_ATTEN_MOD_CHANGING`,
`DELTA_THROTTLE_ATTEN_MOD_STEADY`, `CRUISE_STEADY_TIME`, `DELTA_CRUISE_ATTEN_MOD_STEADY`,
`CRUISE_ATTEN_MOD_RANGE`, **`cruise_accel_time`⁺**, **`cruise_drag`⁺**, **`cruising_speed`⁺**,
**`max_engine_fx_throttle`⁺**

**`MAX_DELTA_FX_THROTTLE` is a rate limit, in units per second**, on the value the flames are fed.
The steady times and the attenuation keys shape the engine sounds (`Freelancer.exe` `0x528240`) and
no effect. Unset, the lower-case keys default to a cruising speed of 300, an acceleration time of 5,
a drag of 3 and a flame throttle of 0.9 (`common.dll` `0x63ea5cc`–`0x63ea5dc`).

### `[Error]`

1 section.

`log`

### `[faction]`

1 section.

`nickname`, `rep_group`, `base`, `Package`, `pilot`

### `[Freelancer]`

1 section.

`data path`, `local_server`*, `initial_world`, `AppGUID`*

### `[GCS_Exclusions]`

1 section.

`script`, `voice`

### `[GenericScripts]`

1 section.

`script`, `set_posture`, `set_gender`, `set_segment`

### `[Global]` ‡

1 section.

`BonusLootDropChance`

### `[HUD]`

1 section.

`shapes`*

### `[Images]`

1 section.

`TgaPath`*, `ScreenType`*, `ScreenExit`*, `ScreenReset`*, `bDrawScripts`*

### `[InfocardMapTable]`

1 section.

`Map`

### `[Initial MP DLLs]` ‡

1 section.

`DLL`, `Path`

### `[Initial SP DLLs]` ‡

1 section.

`DLL`, `Path`

### `[interface]`

1 section.

`option`

### `[JumpShipEffect]`

1 section.

`jump_out_effect`, `jump_in_effect`, **`jump_done_effect_nonplayer`⁺**,
**`jump_done_effect_player`⁺**

Read by the `[JumpGateEffect]` loader (`Freelancer.exe` `0x50254b`–`0x502696`); an unknown key logs
`UNKNOWN jump ship effect parameter`. The two `jump_done_effect_*` keys are played when a jump ends
(`0x504640`), one for the player's ship and one for every other ship. Both effects are built as jump
particles (`0x503efa`, `0x504375`, `0x50452e`), which force `EFT_JUMP_EFFECTS` over the `[Effect]`'s
own type and skip every visibility test (`0x5033e0`).

### `[keymap=1.1]`

1 section. No properties.

### `[ListServer]` ‡

1 section.

`hostname`*, `port`*

### `[locked_gates]`

1 section.

`npc_locked_gate`, `locked_gate`

`initialworld.ini`, read by `content.dll` `0x7057da0`. A lock is a refused dock, keyed by the hash of
the object docked with (`0x705cba0`, `0x705d1a0`), so it belongs to one jump end and never to the
pair. `locked_gate` stops every player, single-player and multiplayer; `npc_locked_gate` stops
ambient traffic only (`0x705d440`), and ambient traffic never picks a locked object as a destination.
Retail locks 27 ids for players and 36 for traffic, six of which name no object.

### `[make_invincible]`

1 section.

`turn_on`, **`at_t`⁺**

Read by `server.dll` `0x6def3d0`. `turn_on` defaults to true (`0x6dec5ae`); retail's one block has
no `at_t`, so it never fires.

### `[Maneuvers]` ‡

1 section.

`maneuver`

### `[MaterialMap]` ‡

1 section.

`name`, ~~`EcEtOcOt`~~, ~~`DcDtEcEt`~~

### `[mPlayer]`

1 section.

`vnpc`, `locked_gate`, **`base_visited`⁺**, **`can_dock`⁺**, **`can_tl`⁺**,
**`dock_exception`⁺**, **`holes_visited`⁺**, **`rm_aborted`⁺**, **`rm_completed`⁺**,
**`rm_failed`⁺**, **`rumor`⁺**, **`ship_type_killed`⁺**, **`sys_visited`⁺**,
**`tlr_exception`⁺**, **`total_cash_earned`⁺**, **`total_time_played`⁺**

The save game's per-player record, read by `content.dll` `0x7038370`. `locked_gate` adds a lock for
this player alone (`0x7038431`), and a save writes back every lock the player holds, those of
`initialworld.ini` included. The statistics go through `0x7039740`: `rm_completed`, `rm_failed` and
`rm_aborted` each hold a random-mission kind and a count. The save's
[`[RandomMission]`](#randommission) is read in the same pass (`0x70385df`).

### `[NavBar]`

1 section.

`equipment`, `Bar`*, `Cityscape`*, `Deck`*, `IDS_DEALER_FRONT_DESK`*,
`IDS_HOTSPOT_COMMODITYTRADER`*, `IDS_HOTSPOT_DECK`*, `IDS_HOTSPOT_EXIT`*,
`IDS_HOTSPOT_LAUNCH`*, `IDS_HOTSPOT_MISSIONVENDOR`*, `IDS_HOTSPOT_NEWSVENDOR`*,
`IDS_HOTSPOT_PLANETSCAPE`*, ~~`IDS_NN_SHIP_VIEW`~~, ~~`IDS_PACKAGE_ONE`~~,
~~`IDS_PACKAGE_THREE`~~, ~~`IDS_PACKAGE_TWO`~~, `IDS_HOTSPOT_EQUIPMENTDEALER`*,
`IDS_HOTSPOT_SHIPDEALER`*, ~~`IDS_EQUIPMENT_ROOM_LEFT`~~, `IDS_EQUIPMENT_ROOM_RIGHT`*,
`IDS_NN_REPAIR_YOUR_SHIP`*, `Launch`*, ~~`Palace`~~, `Planetscape`*, `ShipDealer`*, `Trader`*

### `[ObjectTable]`

1 section.

`prop`*, `room`*, `cart`*

### `[Package]`

1 section.

`nickname`, `strid_name`, `strid_desc`, `ship`, `loadout`, `money`

### `[PhySysConsts]`

1 section.

`MATERIAL_FRICTION`, `MATERIAL_ELASTICITY`, `DEFAULT_LINEAR_DAMPING`,
`DEFAULT_ANGULAR_DAMPING`, **`anom_limits_max_angular_velocity_per_psi`⁺**,
**`anom_limits_max_velocity`⁺**, **`golem_angular_damp_factor`⁺**,
**`golem_child_angular_damp`⁺**, **`golem_child_linear_damp`⁺**, **`golem_child_mass`⁺**,
**`golem_damp_factor`⁺**, **`golem_delta_orientation`⁺**, **`golem_force_factor`⁺**,
**`golem_max_delta_position`⁺**, **`golem_max_torque`⁺**, **`golem_max_translation_force`⁺**,
**`golem_torque_factor`⁺**, **`max_spawned_mindist_count`⁺**,
**`min_time_between_collisions`⁺**, **`physical_sim_rate`⁺**, **`rc_max_delta_orientation`⁺**,
**`rc_max_delta_position`⁺**, **`rmgr_look_ahead_max_distance_intra`⁺**,
**`rmgr_look_ahead_max_distance_world`⁺**, **`rmgr_look_ahead_max_radius_intra`⁺**,
**`rmgr_look_ahead_max_radius_world`⁺**, **`rmgr_look_ahead_min_distance_intra`⁺**,
**`rmgr_look_ahead_min_distance_world`⁺**, **`rmgr_look_ahead_min_seconds_intra`⁺**,
**`rmgr_look_ahead_min_seconds_world`⁺**, **`rmgr_look_ahead_time_intra`⁺**,
**`rmgr_look_ahead_time_world`⁺**

### `[PlayerToughnessScale]` ‡

1 section.

`ptough_graph_pt`

### `[RankAndFormationSizeToDifficulty]`

1 section.

`NpcRank`

### `[RankDiffDB]`

1 section.

`rank_diff`

### `[RearViewCamera]`

1 section.

`view_position`, **`fovx`⁺**, **`fovy`⁺**, **`zfar`⁺**, **`znear`⁺**

The four engine-only keys are `cameras.ini`'s — see [`[CockpitCamera]`](#cockpitcamera).
In a cockpit file `view_position` is three floats (`Freelancer.exe` `0x51ad80`,
`0x51ae64`–`0x51aeb6`).

### `[Receiver]` ‡

1 section.

`Object`, `action`, ~~`shut`~~, `open`*, `Delay`, `video_fovx`, `speaker_rotate`,
`male_speaker_offset`, `female_speaker_offset`, `backdrop`, `static`*, `win_pos`*, `win_size`*,
`btn_pos`*, `fly_time`*, `tool_tip_id`

### `[RenderPipeline]` ‡

1 section.

`MGSDB`*, `ALPHAREF`*, `ALPHATESTENABLE`*, `ALPHAFUNC`*, `LOCALVIEWER`*, `zfunc`*,
`HARDWARE_VERTEXPROCESSING`*, `USE_SYSLOCK`*, `HANDLE_SWAPLOSS`*

### `[RepairKit]`

1 section.

Archetype chain: `RepairKit`.

`nickname`, `ids_name`, `ids_info`, `volume`, `mass`, `hit_pts`, `loot_appearance`,
`units_per_container`, `lootable`, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`inherit`⁺**, **`mission_property`⁺**,
**`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`use_count`⁺**

### `[Resources]` ‡

1 section.

`DLL`

### `[RolloverTable]`

1 section.

`Map`

### `[RoomControl1]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[RoomControl2]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[RoomControl3]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[RoomControl4]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[RoomControl5]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[RoomControl6]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[RoomControl7]` ‡

1 section.

`class_name`*, `mesh`, `offset`, `hardpoint`, `mouse_size`*, `action_button`*,
`no_color_change`*, `no_z_enable`, `tooltip`*, `event`*, `button_sound`*

### `[RtcSlider]`

1 section.

`set`, `set_less`

### `[Server]` ‡

1 section.

`death_penalty`*

### `[ShieldBattery]`

1 section.

Archetype chain: `Equipment`.

`nickname`, `ids_name`, `ids_info`, `volume`, `mass`, `hit_pts`, `loot_appearance`,
`units_per_container`, `lootable`, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`inherit`⁺**, **`mission_property`⁺**,
**`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`use_count`⁺**

### `[ShieldEquipConsts]`

1 section.

`HULL_DAMAGE_FACTOR`

### `[SoundManager]` ‡

1 section.

`createAll2dInSoftware`*, `3D_SW_Algorithm`*, `use2DHW`*, `use3DHW`*, `maxSoundChannels`*,
`FORCE_FREQ_CONTROL_TO_SW`*, `max3DPan`*

### `[Startup]`

1 section.

`movie_file`

### `[Status]` ‡

1 section. No properties.

### `[Steer]` ‡

1 section.

`radius`, `range`, `color`, `size`

### `[StoryInfo]`

1 section.

`Mission`, `MissionNum`, `delta_worth`, **`debug`⁺**, **`ship_bought`⁺**

The save game's story state, read by `content.dll` `0x6f968d0` with names through pointers
(`0x70bd2e0`–`0x70bd2f4`); `MissionNum` is the story stage.

### `[Target]` ‡

1 section. No properties.

### `[Targetable_Objects]` ‡

1 section. No properties.

### `[Time]`

1 section.

`seconds_per_day`

### `[Tractor]`

1 section.

Archetype chain: `Tractor`.

`nickname`, `ids_name`, `ids_info`, `volume`, `mass`, `max_length`, `reach_speed`, `color`,
`operating_effect`, `tractor_complete_snd`, `lootable`, **`attachment_archetype`⁺**,
**`DA_archetype`⁺**, **`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**,
**`inherit`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**

### `[TradeLane]`

1 section.

Archetype chain: `Root`.

`nickname`, `tl_ship_enter`*, `tl_ship_travel`*, `tl_ship_exit`*, `tl_ship_disrupt`*,
`tl_player_travel`*, `tl_player_splash`*, `secs_before_enter`*, `secs_before_splash`*,
`secs_before_exit`*, `tl_ring_active`*, `spin_max`*, `spin_accel`*, `activation_start`*,
`activation_end`*, **`attachment_archetype`⁺**, **`DA_archetype`⁺**, **`explosion_arch`⁺**,
**`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**, **`ids_name`⁺**, **`mass`⁺**,
**`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`type`⁺**

### `[TriMesh]` ‡

1 section.

`tristrips`*

### `[tumble]`

1 section.

`at_t`, `ang_drag_scale`, `turn_throttle_z`, `turn_throttle_x`, `turn_throttle_y`, `throttle`,
**`engine_kill`⁺**

Read by `server.dll` `0x6def000`. `ang_drag_scale` defaults to 1, each `turn_throttle_*` is a min and
max defaulting to 0, 1, and `throttle` to 0, 0. The copy each object takes (`0x6def3a0`) keeps
`ang_drag_scale`, `throttle` and `engine_kill` but not the three turn ranges, so every axis draws
from 0 to 1.

### `[video]`

1 section.

`option`

### `[Waypoint]` ‡

1 section. No properties.

### `[WinCamera]`

1 section.

`fovx`, **`fovy`⁺**, **`zfar`⁺**, **`znear`⁺**

A `cameras.ini` camera — see [`[CockpitCamera]`](#cockpitcamera).

### `[AvailableShip]`

**Not in retail data, obsolete.** `*** WARNING: [AvailableShip] is obsolete`, `RoomData.cpp`.

### `[Billboard]`

**Not in retail data, obsolete.** `*** WARNING: [Billboard] is obsolete`, `RoomData.cpp:2115`.

### `[Cloud]`

**Not in retail data, obsolete.** `*** WARNING: [Cloud] is obsolete`, `RoomData.cpp:2046`.

### `[CollisionConsts]`

**Not in retail data.**

**`damage`⁺**, **`max_impact_speed`⁺**

### `[damage_hp_attachment]`

**Not in retail data.** The [fuse action](#sections-the-engine-matches-that-retail-never-contains)
retail never writes. `server.dll` `0x6dee770` reads it; `damage_type` is compared exactly
(`0x6dee83d`).

**`at_t`⁺**, **`damage_type`⁺**, **`hardpoint`⁺**, **`hitpoints`⁺**

### `[Decloaked]`

**Not in retail data — read positionally.** `content.dll`: 50 indexed `get_value_*` calls, no `is_value`.

### `[Display]`

**Not in retail data.**

**`color_bpp`⁺**, **`depth_bpp`⁺**, **`size`⁺**

### `[DynBaseInfo]`

**Not in retail data — read positionally.** `content.dll`: 1 indexed `get_value_*` call, no `is_value`.

### `[DynSysInfo]`

**Not in retail data — read positionally.** `content.dll`: 1 indexed `get_value_*` call, no `is_value`.

### `[GoodsCartPlacement]`

**Not in retail data, obsolete.** `*** WARNING: [GoodsCartPlacement] is obsolete`, `RoomData.cpp`.

### `[GoodsPilePlacement]`

**Not in retail data, obsolete.** `*** WARNING: [GoodsPilePlacement] is obsolete`, `RoomData.cpp`.

### `[GoodType]`

**Not in retail data, obsolete.** `*** WARNING: [GoodType] is obsolete`, `GoodList.cpp`.

### `[Invulnerables]`

**Not in retail data — read positionally.** `content.dll`: 50 indexed `get_value_*` calls, no `is_value`.

### `[Lighting]`

**Not in retail data, obsolete.** `*** WARNING: [Lighting] is obsolete`, `RoomData.cpp:2123`.

### `[Lightning]`

**Not in retail data.** A nebula INI's bolt object (`Freelancer.exe` `0x552570`).

**`color`⁺**, **`duration`⁺**, **`gap`⁺**, **`size`⁺**

### `[MarkObj]`

**Not in retail data — read positionally.** `content.dll`: 50 indexed `get_value_*` calls, no `is_value`.

### `[Mission01aSave]`

**Not in retail data.**

**`missionstatenum`⁺**

### `[Mission01bSave]`

**Not in retail data.**

**`missionstatenum`⁺**

### `[MObjective]`

**Not in retail data — read positionally.** `content.dll`: 50 indexed `get_value_*` calls, no `is_value`.

### `[MonitorPlacement]`

**Not in retail data, obsolete.** `*** WARNING: [MonitorPlacement] is obsolete`, `RoomData.cpp`.

### `[MsnRandEncSave]`

**Not in retail data — read positionally.** `content.dll`: 50 indexed `get_value_*` calls, no `is_value`.

### `[MsnShipSave]`

**Not in retail data — read positionally.** `content.dll`: 50 indexed `get_value_*` calls, no `is_value`.

### `[MsnSolarSave]`

**Not in retail data — read positionally.** `content.dll`: 50 indexed `get_value_*` calls, no `is_value`.

### `[MsnVibeInfo]`

**Not in retail data — read positionally.** `content.dll`: 50 indexed `get_value_*` calls, no `is_value`.

### `[MsnWingSave]`

**Not in retail data — read positionally.** `content.dll`: 50 indexed `get_value_*` calls, no `is_value`.

### `[ObjectFog]`

**Not in retail data.** The nebula INI's reader accepts the header and skips its body
(`Freelancer.exe` `0x5054b4`).

### `[PerfCount]`

**Not in retail data.**

**`count`⁺**

`count` must equal the number of [`[PerfOptions]`](#perfoptions) lines that named an option
(`Freelancer.exe` `0x5b3c83`).

### `[PerfOptions]`

**Not in retail data.**

**`Asteroids`⁺**, **`DitherControl`⁺**, **`gamma_ramp`⁺**, **`generic_effect_perf`⁺**,
**`MipFilterControlCallback`⁺**, **`mouse_speed`⁺**, **`Nebula`⁺**, **`space_dust_detail`⁺**,
**`star_sphere`⁺**, **`SunEffect`⁺**, **`TurnSensitivity`⁺**

`PerfOptions.ini` sits in the user data folder; the game writes it (`Freelancer.exe` `0x5b3ec0`) and
reads it back (`0x5b38d0`), and retail ships none. Each line's name is taken with `get_name_ptr` and
compared, **case and all**, with the names of the eleven performance options the executable
registers (`0x5b3520`), and its one float is read (`0x5b3abc`–`0x5b3b97`); nothing goes through
`is_value`. A [`[PerfVersion]`](#perfversion) `version` below 5 logs `perfoptions out of date --
reverting to defaults` and stops the read (`0x5b3c5e`); a negative value, or a
[`[PerfCount]`](#perfcount) `count` other than the number of lines that named an option, discards the
file (`0x5b3b9e`, `0x5b3c83`). `star_sphere` sets the starsphere level (`0x552cd0`, see
[`[Background]`](#background)) and `space_dust_detail` the dust detail (`0x54c3e0`).

### `[PerfVersion]`

**Not in retail data.**

**`skipmachinewarnings`⁺**, **`version`⁺**

`version` must be at least 5, which is what the writer puts there (`Freelancer.exe` `0x5b39d4`,
`0x5b3f57`).

### `[RandomEncounter]`

**Not in retail data — read positionally.** `content.dll`: 50 indexed `get_value_*` calls, no `is_value`.

### `[RandomMission]`

**Not in retail data.**

**`difficulty`⁺**, **`dest_sys`⁺**, **`enemy_group`⁺**, **`jump_pref`⁺**, **`objective_pos`⁺**,
**`objective_zone`⁺**, **`offer_base`⁺**, **`offer_group`⁺**, **`offer_ids`⁺**, **`random_seed`⁺**,
**`rep_hit`⁺**, **`rep_reward`⁺**, **`reward`⁺**, **`tree_path`⁺**, **`type`⁺**

A save's job-board mission, read by `content.dll` with every key through a register: `type` by the
player record (`0x7038603`), the offer's keys by `0x703d310`, the mission's by `0x6fe0ab0`, and
`tree_path` by the decision tree (`0x70897d9`). `objective_pos` is read as integers, so it truncates
to whole metres. Loading rebuilds the mission from `random_seed`, and fails if the random-mission
files no longer build it (`0x6fe0dc1`).

### `[RearView]`

**Not in retail data, obsolete.** `*** WARNING: [RearView] is obsolete in file %s`, `Cockpit.cpp:1770` (`Freelancer.exe` `0x51ae1a`).

### `[RepairDroid]`

**Not in retail data.**

Archetype chain: `RepairDroid`.

**`attachment_archetype`⁺**, **`DA_archetype`⁺**, **`explosion_arch`⁺**,
**`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**, **`ids_name`⁺**, **`inherit`⁺**,
**`lootable`⁺**, **`mass`⁺**, **`mission_property`⁺**, **`nickname`⁺**, **`phantom_physics`⁺**,
**`repair_rate`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`units_per_container`⁺**, **`use_count`⁺**, **`volume`⁺**

### `[RepairRobotPlacement]`

**Not in retail data, obsolete.** `*** WARNING: [RepairRobotPlacement] is obsolete`, `RoomData.cpp`.

### `[ShipPlacement]`

**Not in retail data, obsolete.** `*** WARNING: [ShipPlacement] is obsolete`, `RoomData.cpp`.

### `[start_explosion]`

**Not in retail data.** A client fuse action: `Freelancer.exe`'s fuse loader (`0x529e67`) matches the
header through a register, and `0x52b020` reads the block.

**`at_t`⁺**, **`explosion`⁺**, **`hardpoint`⁺**, **`pos_offset`⁺**

### `[ThirdPersonCamera]`

**Not in retail data.** A `cameras.ini` camera — see [`[CockpitCamera]`](#cockpitcamera).

**`fovx`⁺**, **`fovy`⁺**, **`zfar`⁺**, **`znear`⁺**

### `[ThrusterEquipConsts]`

**Not in retail data.**

**`exterior_sound_name`⁺**, **`inside_cone_angle`⁺**, **`interior_sound_name`⁺**,
**`max_volume_force`⁺**, **`min_volume_force`⁺**, **`outside_cone_angle`⁺**,
**`outside_cone_attenuation`⁺**

### `[Turret]`

**Not in retail data, obsolete.** `*** WARNING: [Turret] is obsolete in file %s`, `Cockpit.cpp:1447` (`Freelancer.exe` `0x51a353`).

---

[ENGINE.md](ENGINE.md) · [INI.md](../modules/INI.md) · [RETAIL.md](RETAIL.md) · [THORN.md](THORN.md)
