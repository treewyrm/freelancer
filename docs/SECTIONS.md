# SECTIONS — every section and property the game reads

A reference table: **every section name and every property in it, whether or not retail data uses
it.** [ENGINE.md](ENGINE.md) explains where the vocabulary lives in the binaries and how it was
recovered; this is the enumeration.

Like [ENGINE.md](ENGINE.md) and [RDL.md](RDL.md) it has **no module and will not get one**. To this
library `[Solar]` is a section name and `type` is a property name — see the scope rule in
[CLAUDE.md](../CLAUDE.md). The table exists so a consumer that *does* interpret them can be written
against something measured.

## Where each row comes from

A property reaches this table by one of two routes, and they carry different weight:

- **Observed in retail data** — from reading all 1,257 retail INI files (`DATA/**/*.ini`,
  `EXE/*.ini` and the two `.fl` saves) through this library's own reader and recording which
  properties occur in which section.
- **Recovered from the binaries** — a property the engine reads in that section that **no retail
  file sets there**. `dispersion_angle` on `[Gun]` is the example that motivated this: it works in
  game, and a table built only from the data would not have it.

The read/unread mark comes from the binaries either way, by the two methods in
[ENGINE.md](ENGINE.md#property-names).

### The three placement rules, and what each is worth

| Rule | How a property is placed | Corroboration |
| --- | --- | --- |
| **A** | Address order **inside one function** — an `is_header` match opens a group, following `is_value` matches join it | **93%** (248/268) |
| **B** | The exported symbol names the block — `RoomData::read_Hotspot_block` → `[Hotspot]` | **88%** (52/59) |
| **C** | The section's **archetype class chain**, recovered from the call graph | not measurable — see below |

Corroboration is the share of placements whose property retail *does* set in that section, so it is
only a meaningful test for A and B. **Rule C cannot be scored that way, because its entire purpose is
to add properties retail never sets there.** It rests on something firmer instead.

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

| Section | Class | Chain | Dispatch evidence |
| --- | --- | --- | --- |
| `[Armor]` | `Armor` | `Armor` → `Equipment` → `Root` | `Equipment` constructor, its base |
| `[asteroid]` | `Asteroid` | `Asteroid` → `Root` | `Root` constructor, its base |
| `[AsteroidMine]` | `Asteroid` | `Asteroid` → `Root` | `Root` constructor, its base |
| `[AttachedFX]` | `Root` | `Root` | **direct** — `Load*` calls `Root`'s own constructor |
| `[CargoPod]` | `AttachedEquipment` | `AttachedEquipment` → `Equipment` → `Root` | **direct** — `Load*` calls `AttachedEquipment`'s own constructor |
| `[CloakingDevice]` | `CloakingDevice` | `CloakingDevice` → `AttachedEquipment` → `Equipment` → `Root` | `AttachedEquipment` constructor, its base |
| `[CollisionGroup]` | `AttachedEquipment` | `AttachedEquipment` → `Equipment` → `Root` | — no constructor in the dispatch block |
| `[Commodity]` | `Commodity` | `Commodity` → `Equipment` → `Root` | `Equipment` constructor, its base |
| `[CounterMeasure]` | `CounterMeasure` | `CounterMeasure` → `Projectile` → `Equipment` → `Root` | `Projectile` constructor, its base |
| `[CounterMeasureDropper]` | `CounterMeasureDropper` | `CounterMeasureDropper` → `Launcher` → `AttachedEquipment` → `Equipment` → `Root` | `Launcher` constructor, its base |
| `[DynamicAsteroid]` | `Root` | `Root` | **direct** — `Load*` calls `Root`'s own constructor |
| `[Engine]` | `Engine` | `Engine` → `Equipment` → `Root` | `Equipment` constructor, its base |
| `[explosion]` | `Explosion` | `Explosion` | **direct** — `Load*` calls `Explosion`'s own constructor |
| `[Gun]` | `Gun` | `Gun` → `Launcher` → `AttachedEquipment` → `Equipment` → `Root` | `Launcher` constructor, its base |
| `[InternalFX]` | `InternalFXEquip` | `InternalFXEquip` → `Equipment` → `Root` | `Root` constructor, its base |
| `[Light]` | `Light` | `Light` → `Equipment` → `Root` | `Root` constructor, its base |
| `[LootCrate]` | `Equipment` | `Equipment` → `Root` | **direct** — `Load*` calls `Equipment`'s own constructor |
| `[Mine]` | `Mine` | `Mine` → `Projectile` → `Equipment` → `Root` | `Equipment` constructor, its base |
| `[MineDropper]` | `Launcher` | `Launcher` → `AttachedEquipment` → `Equipment` → `Root` | **direct** — `Load*` calls `Launcher`'s own constructor |
| `[Motor]` | `Projectile` | `Projectile` → `Equipment` → `Root` | — no constructor in the dispatch block |
| `[Munition]` | `Munition` | `Munition` → `Projectile` → `Equipment` → `Root` | `Equipment` constructor, its base |
| `[Power]` | `Power` | `Power` → `Equipment` → `Root` | `Equipment` constructor, its base |
| `[repairdroid]` | `RepairDroid` | `RepairDroid` → `Equipment` → `Root` | `Root` constructor, its base |
| `[RepairKit]` | `RepairKit` | `RepairKit` → `Equipment` → `Root` | `Root` constructor, its base |
| `[Scanner]` | `Scanner` | `Scanner` → `Equipment` → `Root` | `Root` constructor, its base |
| `[Shield]` | `AttachedEquipment` | `AttachedEquipment` → `Equipment` → `Root` | **direct** — `Load*` calls `AttachedEquipment`'s own constructor |
| `[ShieldBattery]` | `Equipment` | `Equipment` → `Root` | **direct** — `Load*` calls `Equipment`'s own constructor |
| `[ShieldGenerator]` | `ShieldGenerator` | `ShieldGenerator` → `AttachedEquipment` → `Equipment` → `Root` | `AttachedEquipment` constructor, its base |
| `[ship]` | `Ship` | `Ship` → `EqObj` → `Root` | **direct** — `Load*` calls `Ship`'s own constructor |
| `[Simple]` | `Root` | `Root` | **direct** — `Load*` calls `Root`'s own constructor |
| `[Solar]` | `Solar` | `Solar` → `EqObj` → `Root` | `EqObj` constructor, its base |
| `[Thruster]` | `Thruster` | `Thruster` → `AttachedEquipment` → `Equipment` → `Root` | `AttachedEquipment` constructor, its base |
| `[Tractor]` | `Tractor` | `Tractor` → `Equipment` → `Root` | `Equipment` constructor, its base |
| `[TradeLane]` | `Root` | `Root` | **direct** — `Load*` calls `Root`'s own constructor |

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

| Binary | Call targets | Groups | Corroboration |
| --- | --- | --- | --- |
| `common.dll` | 3,307 | 78 | 94% |
| `content.dll` | 2,561 | 63 | **94%** |
| `Freelancer.exe` | 4,003 | 60 | 88% |
| `server.dll` | 1,132 | 12 | 100% (n=1) |

**One thing was tried, rejected, and then replaced.** Following the call that a header match
dispatches to, so a helper's `is_value` calls attach to the section that selected it, corroborates at
only 74% and fails systematically — an unbounded forward scan crosses into the next `if`, handing
`[AvailableShip]` the whole of `[Hotspot]`. Bounding the scan properly — take the `test al,al` and
its `jz` that follow the header call, and stop at the jump target or at any unconditional `jmp` —
fixes it, and is what established that ten of those sections are obsolete rather than unread. Without
the `jmp` terminator `[Lighting]` still picked up eighteen properties belonging to the block after
it.

### One consequence worth being clear about

**An unmarked property's read status is a fact about the name, not the name in that section.** `type`
is read somewhere, so it is unmarked wherever it appears — that does not prove the engine reads
`type` in each of the 17 sections that set it. ~~Struck~~ is the strong claim (nothing anywhere
matches this name); plain is the weak one.

## Legend

| Mark | Meaning |
| --- | --- |
| `name` | In retail data here; passed to `INI_Reader::is_value` — **proven read** |
| `name`* | In retail data here; a literal exists but at no resolved call site |
| ~~`name`~~ | In retail data here; **no literal in any binary** — nothing matches this name |
| **`name`⁺** | **Not in retail data here** — the engine reads it in this section anyway |
| `[Section]` ‡ | The section header itself is never matched by `is_header`/`find_header` |

Retail-observed properties come first, most-frequent first; engine-only ones follow, alphabetically.
Spelling is retail's **most common** for that name — **76 names are written more than one way**
(`shape` ×6,270 against `Shape` ×82, `ship` ×874 against `Ship` ×115) and every comparison the game
makes folds case, so the variants are one key and the choice here is cosmetic.

## Totals

| | |
| --- | --- |
| Sections | 289 |
| — in retail data | 280 |
| — engine-only, with properties recovered | 9 |
| — engine-only, obsolete (no property read, by design) | 10 |
| — engine-only, read positionally (no property names exist) | 15 |
| — engine-only, fuse action | 1 |
| Section/property pairs from the data | 2,222 |
| Section/property pairs added from the binaries | **543** |
| Distinct property names in the data | 1,375 |
| — proven read | 619 |
| — literal only | 651 |
| — **no literal anywhere** | **105** |
| Property names read but never set anywhere in retail | 180 |
| — placed into a section | 101 |
| — section undetermined | 79 |

**280 against [RETAIL.md](RETAIL.md#what-is-in-it)'s 256 is a sweep difference, not drift.** That
figure counts the 1,251 BINI files alone; this one adds `initialworld.ini`, the three plain-text INIs
under `EXE` and the two `.fl` saves, which contribute the save-game and configuration sections.

## Sections the engine matches that retail never contains

35 of them, recovered from `is_header`/`find_header` call sites — a string handed to a header matcher
is a section name whatever function it sits in. **For 26 of the 35, "what are its properties?" has no
answer, and in two different ways that are both findings rather than gaps.**

**Ten are obsolete.** The header is matched only to emit a diagnostic — `*** WARNING: [Cloud] is
obsolete in %s` at `RoomData.cpp:2046`, and the same shape for the rest — and then the section is
skipped. **No property is read, by design.** Nine come from `RoomData.cpp` and one from
`GoodList.cpp`:

`[AvailableShip]`, `[Billboard]`, `[Cloud]`, `[GoodsCartPlacement]`, `[GoodsPilePlacement]`,
`[GoodType]`, `[Lighting]`, `[MonitorPlacement]`, `[RepairRobotPlacement]`, `[ShipPlacement]`

**Fifteen are read positionally, so they have no property names at all.** Their handler calls the
indexed `INI_Reader::get_value_int(i)` / `get_value_string(i)` accessors and never `is_value` — the
engine walks the values by position and never compares a key. Eleven of the fifteen share **one
function** in `content.dll` at `0x070b60`, which makes **50 indexed calls and zero name comparisons**;
these are the mission and save-game blocks the game writes and reads back, where the format is fixed
by order rather than by name:

`[Decloaked]`, `[DynBaseInfo]`, `[DynSysInfo]`, `[Invulnerables]`, `[MarkObj]`, `[MObjective]`,
`[MsnRandEncSave]`, `[MsnShipSave]`, `[MsnSolarSave]`, `[MsnVibeInfo]`, `[MsnWingSave]`,
`[PerfOptions]`, `[RandomEncounter]`, `[RearView]`, `[Turret]`

**Asking which properties `[MsnShipSave]` accepts is the wrong question** — it accepts a sequence, and
a name would not be matched if one were written.

**Nine have recoverable property names** and appear in the table with every property marked ⁺:

`[CollisionConsts]`, `[Display]`, `[Mission01aSave]`, `[Mission01bSave]`, `[PerfCount]`,
`[PerfVersion]`, `[RandomMission]`, `[RepairDroid]`, `[ThrusterEquipConsts]`

**One is a fuse action.** `[damage_hp_attachment]` is dispatched in `server.dll` alongside eleven
other action blocks — `ignite_fuse`, `destroy_root`, `damage_root`, `destroy_group`, `damage_group`,
`destroy_hp_attachment`, `impulse`, `tumble`, `make_invincible`, `dump_cargo`, `fuse` — and is the
only one of the twelve retail never writes. Its properties are not recoverable, and neither are its
siblings': **`at_t` is the only fuse-action property any binary matches by name**, read for every
action by `FuseAction::ReadFuseActionValue`. `fate`, `hardpoint`, `group_name`, `hitpoints`,
`damage_type` and `fuse_t` occur in retail and are matched by nothing.

## Read, section undetermined

79 property names the engine matches that retail never sets and that no rule could place — almost all
from `content.dll`'s mission scripting and the executable's interface widgets, where function
boundaries are not recoverable. They are read; which section they belong to is open.

`act_pilotparams`, `act_playerform`, `act_playnn`, `act_relocateform`, `act_repchangerequest`,
`act_setflee`, `act_spawnshiprel`, `active_effect`, `attack_order`, `attacker_rep`, `back_hp`,
`back_mesh`, `back_mouse`, `back_no_mesh_render`, `back_offset`, `cnd_cmptoplane`,
`cnd_jumpgateact`, `cnd_npcsystemexit`, `cnd_rumorheard`, `comm_appr`, `const_effect_delay`,
`descrip_strid`, `destroy_parent`, `formation_position`, `fps`, `hidden`, `ids_info_card`,
`infocard_ids`, `initial_rep`, `jump_done_effect_nonplayer`, `jump_done_effect_player`,
`last_base`, `linked_equip`, `max_range`, `min_range`, `multilevel`, `nextb_hp`, `nextb_mesh`,
`nextb_mouse`, `nextb_no_mesh_render`, `nextb_offset`, `object_pos`, `object_ypr`, `page_size`,
`pilot_id`, `prevb_hp`, `prevb_mesh`, `prevb_mouse`, `prevb_no_mesh_render`, `prevb_offset`,
`rect_color`, `rot_speed`, `saved_formation`, `show_rect`, `show_wireframe`, `sizex`,
`slider_behavior`, `speaker_offset`, `target_toughness_preference`, `target_tradelane`,
`target_tradelane_name`, `thumb_hp0`, `thumb_hp1`, `thumb_mesh`, `thumb_mouse`,
`thumb_no_mesh_render`, `thumb_offset0`, `thumb_offset1`, `tl_attack_chance`,
`tl_attack_chance_read_in`, `trigger`, `tstamp`, `turret_sound`, `vibe`, `viewsize`,
`wire_color`

(Five further entries — `*/`, `/*`, `content.dll`, `skipmachinewarnings`, `version` — are
artefacts of the widened argument search described in
[ENGINE.md](ENGINE.md#the-180-keys-retail-never-sets), not keys.)

## Declared value shapes

What the engine asks each property to be, from the accessor it calls after matching the key —
`push 2; call get_value_float` is "index 2 as a float". 542 of the 799 names, recovered as
[ENGINE.md](ENGINE.md#value-shapes) sets out.

**Declared is what the engine coerces to; recorded is what the file holds**, and they differ freely
because [INI.md](INI.md#how-the-game-reads-a-value)'s reader converts — a `color` of `255, 255, 255`
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

| Property | Declared | Retail arity | Recorded |
| --- | --- | --- | --- |
| `accel` | `f` | 1×76 | `f` |
| `acceleration` | `f` | 1×10 | `i` |
| `accessory` | `s` | 1×232 | `s` |
| `action` | `s` | 1×43 | `s` |
| `activation_type` | `f f f f +s` | 3×6, 5×1 | `siiii` |
| `active_effect` | `s` | — | `—` |
| `addon` | `s s i s?` | 3×507 | `ssi` |
| `ai_range` | `f` | 1×3 | `i` |
| `always_on` | `b` | 1×2 | `s` |
| `ambient` | `s s?` | 1×436, 3×64, 2×2 | `sii` |
| `angular_drag` | `f f f` | 3×110 | `fff` |
| `angular_velocity` | `f f f` | — | `—` |
| `anim` | `s` | 1×28, 3×19 | `sii` |
| `animated_textures` | `b` | 1×1 | `s` |
| `animation` | `s` | 1×162, 0×2 | `s` |
| `animation_oneshot` | `s` | — | `—` |
| `anom_limits_max_angular_velocity_per_psi` | `f` | — | `—` |
| `anom_limits_max_velocity` | `f` | — | `—` |
| `archetype` | `s` | 1×4563 | `s` |
| `asteroid` | `f f f +s` | 7×740, 1×145, 8×70 | `sfffii` |
| `asteroids` | `s` | 1×1 | `s` |
| `at_t` | `f f?` | 1×1907, 2×17 | `ff` |
| `atmosphere_range` | `f` | 1×127 | `i` |
| `attached` | `b` | 1×938 | `s` |
| `attachment_archetype` | `s` | — | `—` |
| `attacker_rep` | `i` | — | `—` |
| `attacker_rep_name` | `s` | 1×7 | `s` |
| `auto_turret` | `b` | 1×513 | `s` |
| `autosave_forbidden` | `b` | 1×4 | `s` |
| `back_hp` | `s` | — | `—` |
| `back_mesh` | `s` | — | `—` |
| `back_mouse` | `f f` | — | `—` |
| `back_no_mesh_render` | `f` | — | `—` |
| `back_offset` | `f f` | — | `—` |
| `backdrop` | `s` | 1×1 | `s` |
| `bad_buy_price` | `f` | 1×40 | `f` |
| `bad_sell_price` | `f` | 1×40 | `f` |
| `base` | `s` | 1×5741 | `s` |
| `bay_door_anim` | `s` | 1×44 | `s` |
| `behavior` | `s` | 1×5346, 0×1 | `s` |
| `bgcs_base_run_by` | `s` | 1×169 | `s` |
| `billboard_count` | `f` | 1×2 | `i` |
| `blink` | `f` | 1×857 | `f` |
| `body` | `s` | 1×1728 | `s` |
| `body.anim` | `s` | 1×1 | `s` |
| `body_hardpoint` | `s` | 1×106 | `s` |
| `bodyparts` | `s` | 1×1 | `s` |
| `bold` | `b` | 1×15 | `s` |
| `bonuslootdropchance` | `f` | 1×1 | `f` |
| `can_dock` | `b` | — | `—` |
| `can_jettison` | `b` | 1×4 | `s` |
| `can_tl` | `b` | — | `—` |
| `capacity` | `f` | 1×164 | `i` |
| `cargo_scan_range` | `f` | 1×2 | `i` |
| `category` | `s` | 1×1258 | `s` |
| `charge_rate` | `f` | 1×164 | `i` |
| `chatter_max_dist` | `f` | 1×1 | `f` |
| `chatter_max_dist_atten` | `f` | 1×1 | `f` |
| `chatter_start_atten` | `f` | 1×1 | `f` |
| `child_impulse` | `f` | 1×1146 | `i` |
| `child_node` | `i` | 1×309 | `i` |
| `cloakin_fx` | `s` | 1×9 | `s` |
| `cloakin_time` | `f` | 1×9 | `i` |
| `cloakout_fx` | `s` | 1×9 | `s` |
| `cloakout_time` | `f` | 1×9 | `i` |
| `close_sound` | `s` | 1×36 | `s` |
| `cnd_npcsystementer` | `—` | 2×7, 3×5, 6×5 | `ssssss` |
| `cnd_npcsystemexit` | `s` | — | `—` |
| `collision_damage_factor` | `f` | 1×1 | `f` |
| `color` | `f f f` | 3×443, 4×6 | `iiii` |
| `combinable` | `b` | 1×792 | `s` |
| `comm` | `s` | 1×1 | `s` |
| `comm.anim` | `s` | 2×1 | `ss` |
| `comm_appr` | `s` | — | `—` |
| `comm_conflict_priority_cutoff` | `f` | 1×1 | `i` |
| `comm_player_far_dist` | `f` | 1×1 | `f` |
| `comm_player_far_dist_atten` | `f` | 1×1 | `f` |
| `const_effect` | `s` | 1×526 | `s` |
| `const_effect_delay` | `f` | — | `—` |
| `constant_power_draw` | `f` | 1×126 | `i` |
| `constants` | `s` | 1×1 | `s` |
| `content.dll` | `i` | — | `—` |
| `costumes` | `s` | 1×1 | `s` |
| `count` | `f` | 1×244 | `i` |
| `cruise_accel_time` | `f` | — | `—` |
| `cruise_atten_mod_range` | `f` | 1×1 | `f` |
| `cruise_charge_time` | `f` | 1×60 | `i` |
| `cruise_disrupt_time` | `f` | 1×1 | `i` |
| `cruise_disruptor` | `b` | 1×3 | `s` |
| `cruise_drag` | `f` | — | `—` |
| `cruise_power_usage` | `f` | 1×60 | `i` |
| `cruise_steady_time` | `f` | 1×1 | `f` |
| `cruising_speed` | `f` | — | `—` |
| `cutoff_shadow_z` | `f` | — | `—` |
| `damage` | `s f` | 1×185 | `i` |
| `damage_per_fire` | `f` | 1×523 | `i` |
| `death_fuse` | `b` | 1×105 | `s` |
| `debris_impulse` | `f` | 1×49 | `i` |
| `debris_type` | `s i?` | 1×1156, 2×133 | `sf` |
| `decay_per_second` | `f` | 1×105 | `i` |
| `default_angular_damping` | `f` | 3×1 | `fff` |
| `default_linear_damping` | `f` | 1×1 | `f` |
| `delay` | `f` | 1×165 | `i` |
| `delta_cruise_atten_mod_steady` | `f` | 1×1 | `f` |
| `delta_throttle_atten_mod_changing` | `f` | 1×1 | `f` |
| `delta_throttle_atten_mod_steady` | `f` | 1×1 | `f` |
| `descrip_strid` | `i` | — | `—` |
| `destroy_parent` | `—` | — | `—` |
| `destructible` | `b` | 1×77 | `s` |
| `detect_radius` | `f` | 1×9 | `i` |
| `detonation_dist` | `f` | 1×86 | `i` |
| `diff2money` | `f` | 2×23 | `fi` |
| `difficulty_range` | `f` | 2×143 | `ii` |
| `dispersion_angle` | `f` | — | `—` |
| `distance_render` | `f` | 1×4 | `i` |
| `diversion_pctg` | `f` | 1×3 | `i` |
| `dmg_obj` | `s` | 1×323 | `s` |
| `dock_with` | `s` | 1×260 | `s` |
| `docking_camera` | `b` | 1×44 | `i` |
| `docking_light` | `b` | 1×2 | `s` |
| `docking_sphere` | `s s f s?` | 3×162, 4×102 | `ssfs` |
| `drag_modifier` | `f` | 1×1 | `f` |
| `dry_fire_sound` | `s` | 1×29 | `s` |
| `dynamic_loot_commodity` | `s` | 1×80 | `s` |
| `dynamic_loot_container` | `s` | 1×80 | `s` |
| `dynamic_loot_count` | `f f` | 2×80 | `ii` |
| `dynamic_loot_difficulty` | `f` | 1×80 | `i` |
| `edge_fraction` | `f` | 1×144 | `f` |
| `effect` | `s f?` | 1×1447, 2×31 | `sf` |
| `empty_cube_frequency` | `f` | 1×152 | `f` |
| `encounter_type` | `s` | 1×7 | `s` |
| `endpause` | `f` | 1×786 | `f` |
| `energy_damage` | `f` | 1×523 | `i` |
| `envmap_material` | `s` | 1×178 | `s` |
| `equip_amount` | `i` | 1×4 | `i` |
| `equipment` | `s` | 1×821 | `s` |
| `exclude_billboards` | `f` | 1×165 | `i` |
| `exclude_dynamic_asteroids` | `f` | 1×11 | `i` |
| `exclusion` | `s` | 1×634 | `s` |
| `exclusion_tint` | `f f f` | 3×43 | `iii` |
| `explosion_arch` | `s` | 1×310 | `s` |
| `explosion_offset` | `f` | 1×9 | `i` |
| `explosion_resistance` | `f` | 1×655 | `f` |
| `explosions` | `s` | 1×1 | `s` |
| `exterior_sound_name` | `s` | — | `—` |
| `extra_shadow_height_offset` | `f` | — | `—` |
| `faction` | `s f` | 2×7156, 1×983, 17×43 | `sfssss` |
| `female_speaker_offset` | `f f` | 3×1 | `iff` |
| `file` | `s` | 1×3095 | `s` |
| `fire_failed_delay` | `f` | — | `—` |
| `fire_failed_sound` | `s` | — | `—` |
| `flash_particle_name` | `s` | 1×445 | `s` |
| `flash_radius` | `f` | 1×447 | `i` |
| `flee_when_hull_damaged_percent` | `f` | 1×51 | `f` |
| `fog_far` | `f` | 1×100 | `i` |
| `font` | `s +i` | 1×36, 3×8 | `isi` |
| `force_gun_ori` | `b` | 1×529 | `s` |
| `formation` | `f f/s?` | 1×190, 2×158, 6×7 | `ssiisi` |
| `formation_position` | `f` | — | `—` |
| `fovx` | `f` | 1×4 | `i` |
| `fps` | `f` | — | `—` |
| `frame` | `f f f f f` | 5×72 | `fiiif` |
| `free_ammo` | `s i` | 2×32 | `si` |
| `fuse` | `s f f` | 3×553, 1×74 | `sfi` |
| `fuses` | `s` | 1×16 | `s` |
| `gap` | `f` | 1×226 | `f` |
| `generic_priority` | `f` | 1×45 | `f` |
| `golem_angular_damp_factor` | `f` | — | `—` |
| `golem_child_angular_damp` | `f f` | — | `—` |
| `golem_child_linear_damp` | `f` | — | `—` |
| `golem_child_mass` | `f` | — | `—` |
| `golem_damp_factor` | `f` | — | `—` |
| `golem_delta_orientation` | `f` | — | `—` |
| `golem_force_factor` | `f` | — | `—` |
| `golem_max_delta_position` | `f` | — | `—` |
| `golem_max_torque` | `f` | — | `—` |
| `golem_max_translation_force` | `f f` | — | `—` |
| `golem_torque_factor` | `f` | — | `—` |
| `good_buy_price` | `f` | 1×40 | `f` |
| `good_sell_price` | `f` | 1×40 | `f` |
| `goods` | `s` | 1×5 | `s` |
| `goodscart_script` | `s?` | 1×19 | `s` |
| `goto` | `s s` | 3×239 | `sss` |
| `group` | `s` | 1×55 | `s` |
| `group_dmg_hp` | `s` | 1×46 | `s` |
| `group_dmg_obj` | `s` | 1×46 | `s` |
| `groups` | `s` | 1×1 | `s` |
| `gun_azimuth` | `f f` | — | `—` |
| `gun_elevation` | `f f` | — | `—` |
| `hardpoint` | `s` | 1×7436, 0×14 | `s` |
| `health` | `f` | 1×4 | `f` |
| `hidden` | `b` | — | `—` |
| `hit_pts` | `f/i` | 1×2219 | `i` |
| `hit_pts_scale` | `f` | 1×24 | `f` |
| `hold_size` | `f` | 1×69 | `i` |
| `house` | `s +f` | 2×110 | `fs` |
| `hp_bay_external` | `s` | 1×64 | `s` |
| `hp_bay_surface` | `s` | 1×64 | `s` |
| `hp_child` | `s` | 1×718 | `s` |
| `hp_gun_type` | `s?` | 1×266 | `s` |
| `hp_particles` | `s` | 1×6 | `s` |
| `hp_shield_type` | `s?` | — | `—` |
| `hp_tractor_source` | `s` | 1×68 | `s` |
| `hp_trail_parent` | `s` | 1×76 | `s` |
| `hp_type` | `s` | 1×636, 2×461, 7×101 | `ssssss` |
| `hull` | `s` | 1×31 | `s` |
| `hull_damage` | `f` | 1×530 | `f` |
| `hull_damage_factor` | `f` | 1×1 | `f` |
| `icolor` | `f f f` | 3×857 | `iii` |
| `id` | `s` | 1×92 | `s` |
| `ids_info` | `f/i` | 1×4994 | `i` |
| `ids_info1` | `i` | 1×33 | `i` |
| `ids_info2` | `i` | 1×33 | `i` |
| `ids_info3` | `i` | 1×33 | `i` |
| `ids_name` | `i` | 1×5094 | `i` |
| `ids_short_name` | `f` | 1×55 | `i` |
| `implemented` | `b` | 1×4 | `s` |
| `impulse` | `f` | 1×86 | `i` |
| `indestructible` | `b` | 1×60 | `s` |
| `inherit` | `s` | 1×348 | `s` |
| `initstate` | `s` | 1×16 | `s` |
| `innards_debris_num` | `f` | 1×22 | `i` |
| `innards_debris_object` | `s` | 1×109 | `s` |
| `innards_debris_radius` | `f` | 1×22 | `i` |
| `innards_debris_start_time` | `f` | 1×47 | `f` |
| `inside_cone_angle` | `f` | — | `—` |
| `inside_sound_cone` | `f` | 1×60 | `i` |
| `intensity_fade_in` | `f` | 1×36 | `i` |
| `intensity_fade_out` | `f` | 1×36 | `i` |
| `interference` | `f` | 1×59 | `f` |
| `interior_sound_name` | `s` | — | `—` |
| `italic` | `b` | 1×15 | `s` |
| `item_icon` | `s` | 1×762 | `s` |
| `jettisoned_cargo_velocity` | `f` | — | `—` |
| `jump_dist` | `i` | 1×40 | `i` |
| `jump_out_hp` | `s` | 1×9 | `s` |
| `justify` | `s` | 1×1 | `s` |
| `key` | `s` | 1×225, 2×49 | `ss` |
| `label` | `s` | 1×2165 | `s` |
| `landing_script` | `s` | 1×29 | `s` |
| `launching_script` | `s` | 1×29 | `s` |
| `lens_flare` | `s` | 1×32 | `s` |
| `lens_glow` | `s` | 1×34 | `s` |
| `lifetime` | `f f?` | 1×834, 2×174 | `ff` |
| `light_anim` | `s` | 1×457 | `s` |
| `linear_drag` | `f` | 1×183 | `f` |
| `linked_equip` | `s f` | — | `—` |
| `loadout` | `s` | 1×2617 | `s` |
| `loadouts` | `s` | 1×4 | `s` |
| `local_faction` | `s` | 1×248 | `s` |
| `location` | `i` | 2×68 | `ss` |
| `log` | `s` | 2×7, 3×2 | `ssi` |
| `loot_appearance` | `s` | 1×139 | `s` |
| `loot_owner_safe_time` | `f` | — | `—` |
| `loot_unseen_life_time` | `f` | — | `—` |
| `loot_unseen_radius` | `f` | — | `—` |
| `lootable` | `b` | 1×692 | `s` |
| `male_speaker_offset` | `f f` | 3×1 | `iff` |
| `maneuver` | `s` | 5×4 | `siiss` |
| `map` | `f f f? f? f?` | 3×4752, 2×472 | `isi` |
| `marketgood` | `f? f? i? i? i +s` | 7×12865, 8×1829, 3×626 | `siiiii` |
| `markets` | `s` | 1×3 | `s` |
| `mass` | `f` | 1×2422 | `i` |
| `material_elasticity` | `f` | 1×1 | `f` |
| `material_friction` | `f` | 1×1 | `f` |
| `material_library` | `i/s?` | 1×2660 | `s` |
| `max_alpha` | `f` | 1×94 | `f` |
| `max_angular_velocity` | `f` | 1×216 | `f` |
| `max_bank_angle` | `f` | 1×36 | `i` |
| `max_capacity` | `f` | 1×126 | `i` |
| `max_delta_fx_throttle` | `f` | 1×1 | `f` |
| `max_engine_fx_throttle` | `f` | — | `—` |
| `max_force` | `f` | 1×66 | `i` |
| `max_impact_speed` | `f` | — | `—` |
| `max_length` | `f` | 1×1 | `i` |
| `max_player_ammo` | `f` | — | `—` |
| `max_range` | `f` | — | `—` |
| `max_spawned_mindist_count` | `f` | — | `—` |
| `max_volume_force` | `f` | — | `—` |
| `maximum_leader_target_distance` | `f` | 1×32 | `i` |
| `mesh` | `s` | 1×355, 0×1 | `s` |
| `min_range` | `f` | — | `—` |
| `min_time_between_collisions` | `f` | — | `—` |
| `min_volume_force` | `f` | — | `—` |
| `mission_offer` | `i` | 1×4 | `i` |
| `mission_property` | `s` | 1×65 | `s` |
| `mission_title` | `i` | 1×4 | `i` |
| `money` | `f` | 1×3 | `i` |
| `motor` | `s` | 1×76 | `s` |
| `msg_id_prefix` | `s` | 1×609 | `s` |
| `munition_hit_effect` | `s` | 1×434 | `s` |
| `music` | `s s?` | 1×341, 2×22 | `ss` |
| `music_cross_fade_delay` | `f` | 1×1 | `f` |
| `muzzle_cone_angle` | `f` | 1×1 | `i` |
| `muzzle_velocity` | `f` | 1×526 | `i` |
| `name` | `i +s` | 1×5050 | `s` |
| `nanobot_limit` | `i` | 1×31 | `i` |
| `navmapscale` | `f` | 1×37 | `i` |
| `newchardb` | `s` | 1×1 | `s` |
| `next_ring` | `s` | 1×925 | `s` |
| `nextb_hp` | `s` | — | `—` |
| `nextb_mesh` | `s` | — | `—` |
| `nextb_mouse` | `f f` | — | `—` |
| `nextb_no_mesh_render` | `f` | — | `—` |
| `nextb_offset` | `f f` | — | `—` |
| `nickname` | `f/s f f f f f` | 1×31412 | `s` |
| `no_z_enable` | `f` | 1×13 | `i` |
| `node_id` | `i` | 1×239 | `i` |
| `nomad` | `b` | 1×4 | `s` |
| `nooffer_text_id` | `i` | 1×10 | `i` |
| `npc_class` | `—` | 3×254, 2×229, 1×35 | `ssssss` |
| `npc_ship_file` | `s` | 1×14 | `s` |
| `npcrank` | `f? +i` | 9×17, 2×6, 7×1 | `ifffff` |
| `nudge_force` | `f` | 1×69 | `f` |
| `num_child_pieces` | `f` | 1×24 | `i` |
| `num_exhaust_nozzles` | `i` | 1×69 | `i` |
| `num_to_drop` | `—` | 2×164, 1×103 | `ii` |
| `numlights` | `f` | 1×49 | `i` |
| `obj` | `s` | 1×872 | `s` |
| `object` | `s` | 1×1 | `s` |
| `object_pos` | `f f f` | — | `—` |
| `object_ypr` | `f f f` | — | `—` |
| `offline_rebuild_time` | `f` | 1×126 | `i` |
| `offline_threshold` | `f` | 1×126 | `f` |
| `offset` | `f f f` | 3×13 | `fff` |
| `one_shot_sound` | `s` | 1×526 | `s` |
| `open_anim` | `s` | 1×2 | `s` |
| `open_sound` | `s` | 1×36 | `s` |
| `operating_effect` | `s` | 1×1 | `s` |
| `orientation` | `f f? f f` | 4×332 | `ffff` |
| `outside_cone_angle` | `f` | — | `—` |
| `outside_cone_attenuation` | `f` | 1×60 | `i` |
| `outside_sound_cone` | `f` | 1×60 | `i` |
| `owner_safe_time` | `f` | 1×13 | `i` |
| `package` | `s` | 1×1 | `s` |
| `page_size` | `f` | — | `—` |
| `parent` | `s` | 1×269 | `s` |
| `parent_impulse` | `f` | 1×1118 | `i` |
| `particle_effect` | `s` | 1×3 | `s` |
| `particles` | `s` | 1×61 | `s` |
| `path` | `s?` | 8×924, 7×865, 9×846 | `ssssss` |
| `pbubble` | `f f` | 2×45 | `ii` |
| `permutation` | `s` | 2×54, 3×2 | `iii` |
| `petaldb` | `s` | 1×1 | `s` |
| `phantom_physics` | `b` | 1×10 | `s` |
| `physical_sim_rate` | `f` | — | `—` |
| `pilot` | `s` | 1×2208 | `s` |
| `pilot_id` | `i` | — | `—` |
| `player_attached_equip_hit_pts_scale` | `f` | 1×1 | `i` |
| `player_collision_group_hit_pts_scale` | `f` | 1×1 | `i` |
| `pod_appearance` | `s` | 1×102 | `s` |
| `point` | `f f` | 2×56 | `ii` |
| `pos` | `f f f?` | 3×10087, 9×71, 2×53 | `iiiifi` |
| `pos_offset` | `f f f` | 3×990 | `iii` |
| `position` | `f f f` | 3×520 | `iii` |
| `power_usage` | `f` | 1×575 | `i` |
| `preload` | `s` | — | `—` |
| `prev_ring` | `s` | 1×925 | `s` |
| `prevb_hp` | `s` | — | `—` |
| `prevb_mesh` | `s` | — | `—` |
| `prevb_mouse` | `f f` | — | `—` |
| `prevb_no_mesh_render` | `f` | — | `—` |
| `prevb_offset` | `f f` | — | `—` |
| `price` | `i` | 1×824 | `i` |
| `price_variance` | `f` | — | `—` |
| `priority` | `f` | 1×17021 | `i` |
| `process` | `s` | 1×156 | `s` |
| `projectile_archetype` | `s` | 1×526 | `s` |
| `property_flags` | `i` | 1×835 | `i` |
| `property_fog_color` | `f f` | 3×182 | `fff` |
| `radius` | `f` | 1×649 | `i` |
| `range` | `f` | 2×369, 1×157 | `ii` |
| `rank` | `i` | 2×403, 1×2 | `ss` |
| `rank_diff` | `s` | 2×9 | `sf` |
| `rc_max_delta_orientation` | `f` | — | `—` |
| `rc_max_delta_position` | `f` | — | `—` |
| `reach_speed` | `f` | 1×1 | `i` |
| `real_pos` | `f f` | — | `—` |
| `rebuild_power_draw` | `f` | 1×126 | `i` |
| `recharge_time` | `f` | 1×13 | `f` |
| `rect_color` | `f f f f` | — | `—` |
| `refire_delay` | `f` | 1×526 | `f` |
| `regeneration_rate` | `f` | 1×126 | `f` |
| `rel_pos_obj` | `s` | 1×3 | `s` |
| `rel_pos_offset` | `f f f` | 3×3 | `iii` |
| `rep` | `s` | 2×3025 | `is` |
| `rep_group` | `s` | 1×1 | `s` |
| `repair_rate` | `f` | — | `—` |
| `repeatable` | `b` | 1×35 | `s` |
| `reputation` | `s` | 1×2124 | `s` |
| `requires_ammo` | `b` | 1×526 | `s` |
| `reverse_fraction` | `f` | 1×60 | `f` |
| `reward` | `i` | 1×1 | `i` |
| `rmgr_look_ahead_max_distance_intra` | `f` | — | `—` |
| `rmgr_look_ahead_max_distance_world` | `f` | — | `—` |
| `rmgr_look_ahead_max_radius_intra` | `f` | — | `—` |
| `rmgr_look_ahead_max_radius_world` | `f` | — | `—` |
| `rmgr_look_ahead_min_distance_intra` | `f` | — | `—` |
| `rmgr_look_ahead_min_distance_world` | `f` | — | `—` |
| `rmgr_look_ahead_min_seconds_intra` | `f` | — | `—` |
| `rmgr_look_ahead_min_seconds_world` | `f` | — | `—` |
| `rmgr_look_ahead_time_intra` | `f` | — | `—` |
| `rmgr_look_ahead_time_world` | `f` | — | `—` |
| `room_switch` | `s` | 1×1879 | `s` |
| `root_health_proxy` | `b` | 1×329 | `s` |
| `rot_speed` | `f f f` | — | `—` |
| `rotate` | `f f f` | 3×6229 | `iii` |
| `rotation_inertia` | `f f f` | 3×71 | `fff` |
| `rpop_solar_detection` | `b` | 1×1 | `s` |
| `rtcslider` | `s` | 1×1 | `s` |
| `run_time` | `f` | 1×45 | `i` |
| `scale` | `f` | 1×921 | `f` |
| `seek_dist` | `f` | 1×10 | `i` |
| `seeker` | `s` | 1×76 | `s` |
| `seeker_fov_deg` | `f` | 1×71 | `i` |
| `seeker_range` | `f` | 1×71 | `i` |
| `separation_explosion` | `s` | 1×761 | `s` |
| `set` | `s? f?` | 2×38 | `sf` |
| `set_less` | `s? f?` | 2×4 | `sf` |
| `set_script` | `s` | 1×443 | `s` |
| `set_virtual_room` | `s` | 1×350 | `s` |
| `setpoint` | `s` | — | `—` |
| `sex` | `s` | 1×7 | `s` |
| `shape` | `s` | 1×6270 | `s` |
| `shape_name` | `s` | 1×362 | `s` |
| `shell_scalar` | `f` | 1×25 | `f` |
| `shield_battery_limit` | `i` | 1×31 | `i` |
| `shield_collapse_particle` | `s` | 1×3 | `s` |
| `shield_collapse_sound` | `s` | 1×126 | `s` |
| `shield_hit_effects` | `f/s` | 2×372 | `is` |
| `shield_link` | `s?` | 3×43 | `sss` |
| `shield_mod` | `f +s` | 2×189 | `sf` |
| `shield_rebuilt_sound` | `s` | 1×126 | `s` |
| `shield_type` | `s` | 1×121 | `s` |
| `ship` | `s` | 1×874 | `s` |
| `ship_class` | `i` | 1×33 | `i` |
| `ship_lrg_01` | `s` | — | `—` |
| `ship_lrg_02` | `s` | — | `—` |
| `ship_lrg_03` | `s` | — | `—` |
| `ship_mdm_01` | `s` | — | `—` |
| `ship_mdm_02` | `s` | — | `—` |
| `ship_mdm_03` | `s` | — | `—` |
| `ship_repair_cost` | `f` | — | `—` |
| `ship_sml_01` | `s` | — | `—` |
| `ship_sml_02` | `s` | — | `—` |
| `ship_sml_03` | `s` | — | `—` |
| `ships` | `s` | 1×2 | `s` |
| `shop_archetype` | `s` | 1×727 | `s` |
| `show_rect` | `f` | — | `—` |
| `show_wireframe` | `f` | — | `—` |
| `size` | `f?` | 2×3410, 1×1877, 3×593 | `iii` |
| `sizex` | `f` | — | `—` |
| `skipmachinewarnings` | `b` | — | `—` |
| `slider_behavior` | `f` | — | `—` |
| `snd_cargo_jettisoned` | `s` | — | `—` |
| `solar` | `s` | 1×21 | `s` |
| `solar_radius` | `f` | 1×316 | `i` |
| `space` | `s` | 1×54 | `s` |
| `space_costume` | `s?` | 3×699, 2×195 | `sss` |
| `spacedust` | `s` | 1×324 | `s` |
| `spacedust_maxparticles` | `i` | 1×262 | `i` |
| `speaker_rotate` | `f f` | 3×1 | `iii` |
| `spin` | `f f f` | 3×66, 1×10 | `iii` |
| `spines` | `s` | 1×29 | `s` |
| `star_glow` | `s` | 1×38 | `s` |
| `start_room` | `s` | 1×215 | `s` |
| `start_script` | `s` | 1×208 | `s` |
| `state_read` | `f` | 1×961 | `i` |
| `state_send` | `f` | 1×961 | `i` |
| `steering_torque` | `f f f` | 3×69 | `fff` |
| `strafe_force` | `f` | 1×34 | `i` |
| `strafe_power_usage` | `f` | 1×34 | `i` |
| `strid_desc` | `f` | 1×1 | `i` |
| `strid_name` | `f/i` | 1×251 | `i` |
| `string_id` | `i` | 1×242 | `i` |
| `surface_hit_effects` | `s? +f` | 4×207, 2×53 | `isss` |
| `switch` | `f f` | 2×42 | `if` |
| `system` | `s` | 1×2436, 0×2 | `s` |
| `target_ship_name` | `s` | 1×6 | `s` |
| `target_tradelane` | `i` | — | `—` |
| `target_tradelane_name` | `s` | — | `—` |
| `terrain_dyna_01` | `s` | 1×32 | `s` |
| `terrain_dyna_02` | `s` | 1×32 | `s` |
| `terrain_lrg` | `s` | 1×51 | `s` |
| `terrain_mdm` | `s` | 1×51 | `s` |
| `terrain_sml` | `s` | 1×51 | `s` |
| `terrain_tiny` | `s` | 1×51 | `s` |
| `teststring` | `s` | — | `—` |
| `testvalue` | `f` | — | `—` |
| `throttle_atten_mod_range` | `f` | 1×1 | `f` |
| `throttle_steady_time` | `f` | 1×1 | `f` |
| `thrust_capacity` | `f` | 1×32 | `i` |
| `thrust_charge_rate` | `f` | 1×32 | `i` |
| `thumb` | `s` | 1×1 | `s` |
| `thumb_hp0` | `s` | — | `—` |
| `thumb_hp1` | `s` | — | `—` |
| `thumb_mesh` | `s` | — | `—` |
| `thumb_mouse` | `f f` | — | `—` |
| `thumb_no_mesh_render` | `f` | — | `—` |
| `thumb_offset0` | `f f` | — | `—` |
| `thumb_offset1` | `f f` | — | `—` |
| `time_to_lock` | `f` | 1×71 | `i` |
| `tl_attack_chance_read_in` | `i` | — | `—` |
| `tool_tip_id` | `f` | 1×1 | `i` |
| `top_speed` | `f` | 1×10 | `i` |
| `toughness` | `i` | 1×4452 | `i` |
| `tractor_complete_snd` | `s` | 1×1 | `s` |
| `tractored_explosion` | `s` | — | `—` |
| `tradelane_space_name` | `i` | 1×271 | `i` |
| `turn_rate` | `f` | 1×513 | `i` |
| `turret_sound` | `s` | — | `—` |
| `type` | `s` | 1×2041, 8×179, 2×116 | `ssiiii` |
| `underline` | `b` | 1×15 | `s` |
| `units_per_container` | `i` | 1×139 | `i` |
| `universe` | `s` | 1×1 | `s` |
| `use_animation` | `s` | 1×245 | `s` |
| `use_count` | `b` | — | `—` |
| `use_sound` | `s` | 1×27 | `s` |
| `use_throttle` | `b` | 1×1 | `s` |
| `velocity` | `f f f` | 3×4 | `iii` |
| `version` | `f` | — | `—` |
| `video_fovx` | `f` | 1×1 | `i` |
| `view_position` | `f f` | 3×1 | `fff` |
| `viewsize` | `f f f` | — | `—` |
| `virtual_room` | `s` | 1×1137 | `s` |
| `visit` | `i/s` | 1×1259, 2×25 | `ii` |
| `voice` | `s` | 1×2370, 2×6 | `ss` |
| `volume` | `f` | 1×1527 | `f` |
| `walla_max_dist` | `f` | 1×1 | `f` |
| `walla_max_dist_atten` | `f` | 1×1 | `f` |
| `walla_priority_cutoff` | `f` | 1×1 | `i` |
| `walla_start_atten` | `f` | 1×1 | `f` |
| `weapon_type` | `s` | 1×229 | `s` |
| `weaponmoddb` | `s` | 1×1 | `s` |
| `wire_color` | `f f f f` | — | `—` |
| `xaxis_rotation` | `f` | 4×21 | `iiii` |
| `yaxis_rotation` | `f` | 4×21 | `iiii` |
| `zaxis_rotation` | `f` | 4×21 | `iiii` |
| `zone` | `s` | 1×291 | `s` |
| `zone_occlusion_fade_in` | `f` | 1×36 | `f` |
| `zone_occlusion_fade_out` | `f` | 1×36 | `f` |
| `zone_shell` | `s` | 1×86 | `s` |

### The same name is not always read the same way

**542 names have a shape; 20 of them show more than one across their call sites, and 11 of those are
genuine.** The other nine differ only by being a prefix of the longest variant, which is this scan
truncating rather than the engine disagreeing — `[Zone] pos` reads `f f` only because the block bound
cut before the third accessor, and retail writes three values there.

So the table above is **per name, and a name is occasionally per section**. Where they conflict, this
is the list; rows marked ⚠ are ones where at least one variant still looks like residual overrun
rather than a real reading (a `[lens_flare] nickname` is not six floats).

| Property | Shape | Where |
| --- | --- | --- |
| `damage` | `f` | `[zone]` |
|  | `s f` | `[collisionconsts]` |
| `faction` | `f` | `[zone]` |
|  | `s f` | `DestroyInstance` |
| `font` ⚠ | `i` | `??4MD5Hash@@QAEAAV0@ABV0@@Z` |
|  | `s` | `??4MD5Hash@@QAEAAV0@ABV0@@Z` |
| `formation` ⚠ | `f f/s?` | `??1IDLL@@UAE@XZ` |
|  | `f s?` | `??1IDLL@@UAE@XZ` |
| `hit_pts` | `f` | `Archetype::Equipment::read`, `Archetype::Root::read` |
|  | `i` | `??1CollisionGroup@Archetype@@Q` |
| `ids_info` | `f` | `[group]`, `[missioncreatedsolar]` |
|  | `i` | `Archetype::Root::read`, `[object]`, `[zone]` |
| `material_library` | `i/s?` | `IDPMsgHandler::OnDisconnect` |
|  | `s` | `CostumeDescriptions::load_accessory`, `GoodInfoList::read_Good_block` |
| `name` | `i` | `[key]` |
|  | `s` | `??4MD5Hash@@QAEAAV0@ABV0@@Z`, `Fuse::ReadFuseValues`, `RoomData::read_Camera_block` … |
| `nickname` ⚠ | `f f f f f f` | `[lens_flare]` |
|  | `s` | `??1IDLL@@UAE@XZ`, `??4CDPClient@@QAEAAV0@ABV0@@Z`, `??4MD5Hash@@QAEAAV0@ABV0@@Z` … |
| `strid_name` | `f` | `[package]` |
|  | `i` | `[base]`, `[object]` |
| `visit` | `i` | `CSolar::ReadObj`, `HardpointSummary::expire_instance`, `[object]` … |
|  | `s` | `[msnsolar]` |

The clearest of these are not type slips but different fields wearing the same name: `[CollisionConsts]
damage` takes a name and an amount where `[Zone] damage` takes a number; `[Zone] faction` is a weight
where `content.dll`'s is a name and a weight; `[MsnSolar] visit` is a string where every `common.dll`
reader treats `visit` as an int.

## The table

### `[Sound]`

25,814 sections.

`attenuation`*, `msg`*, `duration`*, `Priority`, `nickname`, `file`, `type`, `is_2d`*, `range`,
`crv_pitch`*, `streamer`*, `pitch_bendable`*, `persistent`*, `ambient`, ~~`flash`~~,
**`Music`⁺**

### `[zone]`

5,769 sections.

`density_restriction`*, `faction`, `nickname`, `pos`, `shape`, `size`, `sort`*,
~~`faction_weight`~~, `encounter`*, `density`*, `relief_time`*, `max_battle_size`*,
`repop_time`*, ~~`pop_type`~~, `toughness`, `rotate`, `path_label`, `usage`*,
`mission_eligible`*, `property_flags`, ~~`attack_ids`~~, `tradelane_attack`*, `vignette_type`*,
`visit`, ~~`comment`~~, `difficulty`*, `mission_type`*, `spacedust`, `spacedust_maxparticles`,
`property_fog_color`, `damage`, `Music`, `ids_info`, `ids_name`, `edge_fraction`,
~~`lane_id`~~, ~~`tradelane_down`~~, `population_additive`*, `interference`,
`zone_creation_distance`*, ~~`spacedust _maxparticles`~~, ~~`spacedust_maxdust`~~,
~~`pacedust`~~, ~~`spacedust_masparticles`~~, `reputation`, `spin`, ~~`power_modifier`~~,
`drag_modifier`, ~~`spacedusr_maxparticles`~~, **`mesh`⁺**, **`name`⁺**

### `[Hotspot]`

3,581 sections.

`name`, `behavior`, `room_switch`, `virtual_room`, `state_read`, `state_send`,
`set_virtual_room`, **`state_transition`⁺**, **`zoom_in`⁺**, **`zoom_out`⁺**

### `[Object]`

3,578 sections.

`nickname`, `pos`, `archetype`, `ids_name`, `ids_info`, `rotate`, `reputation`, `behavior`,
`loadout`, `pilot`, ~~`difficulty_level`~~, `next_ring`, `prev_ring`, `visit`,
`tradelane_space_name`, `parent`, `base`, `dock_with`, `jump_effect`, `goto`, `msg_id_prefix`,
`space_costume`, `voice`, `atmosphere_range`, `burn_color`*, `spin`, `star`, `ambient_color`*,
`ring`*, ~~`260800`~~, ~~`info_ids`~~, `faction`, `ambient`, `size`, ~~`info_card`~~,
~~`info_card_ids`~~, **`links`⁺**, **`local_faction`⁺**, **`NavMapScale`⁺**, **`real_pos`⁺**,
**`strid_name`⁺**

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

`rumor`, `rumor_type2`*, `bribe`*, `nickname`, `individual_name`*, `affiliation`*, `voice`,
`body`, `head`*, `lefthand`*, `righthand`*, `room`*, `misn`*, ~~`rumorknowdb`~~, `know`*,
~~`knowdb`~~, `accessory`, `base_appr`*

### `[start_effect]` ‡

1,353 sections.

`hardpoint`, `effect`, `at_t`, `pos_offset`, `attached`, `ori_offset`, `particles`, ~~`ONLY`~~,
~~`age_fire`~~

### `[VisEffect]` ‡

1,218 sections.

`textures`*, `nickname`, `alchemy`*, `effect_crc`*

### `[EncounterParameters]`

1,163 sections.

`nickname`, ~~`filename`~~, `faction`

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

### `[loadout]`

803 sections.

`equip`, `cargo`, `nickname`, `archetype`

### `[effect]`

705 sections.

`nickname`, `effect_type`*, `vis_effect`*, `vis_generic`*, `snd_effect`*, `vis_beam`*,
`lgt_effect`*, `lgt_range_scale`*, `lgt_radius`*, `:`*

### `[ObjList]`

672 sections.

`nickname`, `GotoVec`*, `system`, `GotoShip`*, `BreakFormation`*, `StayInRange`*,
`SetPriority`*, `Follow`*, `Delay`, `MakeNewFormation`*, `Avoidance`*, `Dock`*, `SetLifetime`*,
`GotoSpline`*, `FollowPlayer`*, `StayOutOfRange`*, `Idle`*

### `[NPCShipArch]`

660 sections.

`nickname`, `loadout`, `ship_archetype`, `state_graph`, `pilot`, `npc_class`, `level`

### `[BaseFaction]` ‡

609 sections.

`NPC`*, `faction`, `weight`, ~~`offers_missions`~~, `mission_type`*

### `[Gun]`

513 sections.

Archetype chain: `Gun`.

`nickname`, `ids_name`, `ids_info`, `DA_archetype`, `HP_child`, `hit_pts`,
`explosion_resistance`, `debris_type`, `parent_impulse`, `child_impulse`, `volume`, `mass`,
`damage_per_fire`, `power_usage`, `refire_delay`, `muzzle_velocity`, `toughness`,
`projectile_archetype`, `separation_explosion`, `auto_turret`, `turn_rate`, `lootable`,
`material_library`, `light_anim`, `flash_particle_name`, `flash_radius`, `LODranges`*,
`hp_gun_type`, `use_animation`, `dry_fire_sound`, **`attachment_archetype`⁺**,
**`dispersion_angle`⁺**, **`explosion_arch`⁺**, **`gun_azimuth`⁺**, **`gun_elevation`⁺**,
**`inherit`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**

### `[Munition]`

513 sections.

Archetype chain: `Munition`.

`nickname`, `hp_type`, `requires_ammo`, `hit_pts`, `one_shot_sound`, `lifetime`,
`force_gun_ori`, `const_effect`, `mass`, `volume`, `hull_damage`, `energy_damage`,
`munition_hit_effect`, `weapon_type`, `DA_archetype`, `material_library`, `explosion_arch`,
`detonation_dist`, `Motor`, `HP_trail_parent`, `seeker`, `time_to_lock`, `seeker_range`,
`seeker_fov_deg`, `max_angular_velocity`, `loot_appearance`, `units_per_container`, `ids_name`,
`ids_info`, `cruise_disruptor`, **`attachment_archetype`⁺**, **`damage`⁺**,
**`explosion_resistance`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mission_property`⁺**,
**`owner_safe_time`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`use_count`⁺**

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

### `[room]`

464 sections.

`nickname`, `file`

### `[Room_Info]`

446 sections.

`scene`, `set_script`, `animation`, `goodscart_script`, **`animation_oneshot`⁺**,
**`background_script`⁺**, **`background_script_oneshot`⁺**, **`cutoff_shadow_z`⁺**,
**`extra_shadow_height_offset`⁺**, **`goodscart_script_elite`⁺**,
**`goodscart_script_fighter`⁺**, **`goodscart_script_freighter`⁺**, **`is_outside`⁺**,
**`mesh`⁺**, **`mission_vendor_type`⁺**, **`news_material`⁺**

### `[Camera]`

443 sections.

`name`, **`far_plane`⁺**, **`index`⁺**, **`near_plane`⁺**

### `[NPC]`

443 sections.

`nickname`, `individual_name`*, `affiliation`*, `npc_ship_arch`*, `voice`, `space_costume`,
`base_appr`*

### `[Room_Sound]`

439 sections.

`ambient`, `Music`

### `[mLootProps]`

434 sections.

`nickname`, `drop_properties`*

### `[BaseGood]`

413 sections.

`MarketGood`, `base`

### `[MRoom]`

412 sections.

`fixture`*, `nickname`, `character_density`*

### `[NewsItem]`

403 sections.

`base`, `rank`, `icon`*, `logo`*, `category`, `headline`*, `text`*, `audio`*, `autoselect`*

### `[NNObjective]`

395 sections.

`nickname`, `state`, `type`

### `[LOD]`

388 sections.

`obj`, `LODranges`*

### `[Solar]`

321 sections.

Archetype chain: `Solar`.

`material_library`, `nickname`, `type`, `DA_archetype`, `solar_radius`, `shape_name`, `mass`,
`docking_sphere`, `LODranges`*, `hit_pts`, `ids_info`, `ids_name`, `envmap_material`, `fuse`,
`loadout`, `destructible`, `explosion_arch`, `surface_hit_effects`, `docking_camera`,
`open_sound`, `close_sound`, `jump_out_hp`, `phantom_physics`, `shield_link`, `open_anim`,
`distance_render`, `animated_textures`, `nomad`, **`attachment_archetype`⁺**,
**`explosion_resistance`⁺**, **`inherit`⁺**, **`mission_property`⁺**, **`rotation_inertia`⁺**,
**`toughness`⁺**

### `[pilot]`

320 sections.

`nickname`, `inherit`, `gun_id`, `evade_dodge_id`, `job_id`, `missile_id`,
`buzz_head_toward_id`, `buzz_pass_by_id`, `evade_break_id`, `damage_reaction_id`, `trail_id`,
`strafe_id`, `mine_id`, `countermeasure_id`, `formation_id`, `engine_kill_id`,
`missile_reaction_id`, `repair_id`, `body`, `comm`, `voice`, `body.anim`, `thumb`, `comm.anim`

### `[destroy_group]`

291 sections.

`at_t`, `group_name`*, `fate`*, `separable`, `dmg_hp`, `dmg_obj`

### `[CharacterPlacement]`

265 sections.

`name`, `start_script`, **`zoom_in`⁺**, **`zoom_out`⁺**

### `[TexturePanels]`

241 sections.

`file`

### `[Simple]`

235 sections.

Archetype chain: `Root`.

`nickname`, `DA_archetype`, `material_library`, `mass`, `LODranges`*, `hit_pts`, `MinSpecLOD`*,
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

### `[PlayerShipPlacement]`

208 sections.

`name`, `landing_script`, `launching_script`

### `[properties]` ‡

202 sections.

~~`flag`~~

### `[BaseInfo]`

200 sections.

`nickname`, `start_room`

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

### `[MBase]`

194 sections.

`nickname`, `local_faction`, `diff`, `msg_id_prefix`

### `[MVendor]`

194 sections.

`num_offers`*

### `[MsnFormation]`

188 sections.

`ship`, `nickname`, `formation`, `position`, `orientation`, `rel_pos`*, `label`

### `[Exclusion Zones]`

169 sections.

`exclusion`, `exclude_billboards`, `fog_far`, `zone_shell`, `max_alpha`, `exclusion_tint`,
`shell_scalar`, `exclude_dynamic_asteroids`, `empty_cube_frequency`, `billboard_count`,
`color`, ~~`exclude`~~

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

`at_t`, `hardpoint`, `fate`*

### `[explosion]`

156 sections.

Archetype chain: `Explosion`.

`nickname`, `lifetime`, `process`, `effect`, `debris_type`, `innards_debris_object`, `radius`,
`hull_damage`, ~~`strength`~~, `energy_damage`, `impulse`, `debris_impulse`,
`innards_debris_start_time`, `num_child_pieces`, `innards_debris_num`, `innards_debris_radius`

### `[Costume]`

154 sections.

`nickname`, `body`, `righthand`*, `lefthand`*, `head`*, **`accessory`⁺**

### `[Field]`

154 sections.

`cube_size`*, `fill_dist`*, `empty_cube_frequency`, `diffuse_color`*, `ambient_color`*,
`ambient_increase`*, `tint_field`*, `max_alpha`, `contains_fog_zone`*

### `[Cube]`

153 sections.

`asteroid`, `xaxis_rotation`, `yaxis_rotation`, `zaxis_rotation`

### `[KeyCmd]`

146 sections.

`nickname`, `state`, `ids_name`, `ids_info`, `key`

### `[DynamicAsteroids]` ‡

145 sections.

`asteroid`, `count`, `placement_radius`*, ~~`placement_offset`~~, `max_velocity`*,
`max_angular_velocity`, `color_shift`*

### `[RMBonusLoot]` ‡

143 sections.

`archetype`, `num_to_drop`, `faction`, `difficulty_range`, `weight`

### `[DataNode]` ‡

140 sections.

`offer_text`*, `node_id`, `child_node`, `Offer_group`*, `comm_sequence`*, `objective_text`*,
`weight`, `Hostile_group`*, `difficulty`*, `Implemented`, `Allowable_zone_types`*,
`Failure_text`*, `Reward_text`*

### `[LightSource]` ‡

140 sections.

`nickname`, `pos`, `color`, `range`, `type`, `atten_curve`*, `attenuation`*, `direction`*,
`color_curve`*, `rotate`, `ids_name`, `behavior`

### `[SystemConnections]`

131 sections.

`Path`

### `[KillableSolar]`

126 sections.

`nickname`, `solar_type`*, `string_id`, `faction`, `archetype`, `loadout`, `hitpoints`*,
`difficulty`*, `pilot_choices`*, `only_allowed_in_zone_type`*

### `[ShieldGenerator]`

126 sections.

Archetype chain: `ShieldGenerator`.

`shield_hit_effects`, `nickname`, `DA_archetype`, `material_library`, `ids_name`, `ids_info`,
`mass`, `volume`, `hit_pts`, `HP_child`, `debris_type`, `regeneration_rate`,
`constant_power_draw`, `rebuild_power_draw`, `max_capacity`, `offline_rebuild_time`,
`offline_threshold`, `shield_collapse_sound`, `shield_rebuilt_sound`, `LODranges`*,
`explosion_resistance`, `parent_impulse`, `child_impulse`, `toughness`, `hp_type`,
`separation_explosion`, `lootable`, `shield_type`, `shield_collapse_particle`,
**`attachment_archetype`⁺**, **`explosion_arch`⁺**, **`hp_shield_type`⁺**, **`inherit`⁺**,
**`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**

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

`hp_type`, `surface_hit_effects`, `material_library`, `fuse`, `nickname`, `LODranges`*,
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

### `[accessory]`

106 sections.

`nickname`, `mesh`, `hardpoint`, `body_hardpoint`

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

`nickname`, `mesh`

### `[AsteroidBillboards]` ‡

99 sections.

`count`, `start_dist`*, `fade_dist_percent`*, `shape`, `size`, `color_shift`*,
`ambient_intensity`*

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

`permutation_count`*, `voice`, `gender`*, `supports_roles`*

### `[key]`

92 sections.

`id`, **`name`⁺**

### `[body]` ‡

88 sections.

`nickname`, `mesh`

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

`actor`*, `NPC`*, `fidget`*, `spot`

### `[shape]`

82 sections.

`name`, `x`*, `y`*, `w`*, `h`*

### `[LootableZone]`

80 sections.

`asteroid_loot_container`, `asteroid_loot_commodity`, `dynamic_loot_container`,
`dynamic_loot_commodity`, `asteroid_loot_count`, `dynamic_loot_count`,
`asteroid_loot_difficulty`, `dynamic_loot_difficulty`, `zone`

### `[DecisionNode]` ‡

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

### `[Band]` ‡

74 sections.

`render_parts`*, `shape`, `height`*, `offset_dist`*, `fade`*, `texture_aspect`*,
`color_shift`*, `vert_increase`*, `ambient_intensity`*

### `[ignite_fuse]`

74 sections.

`at_t`, `fuse`, `fuse_t`*

### `[Light]`

74 sections.

Archetype chain: `Light`.

`nickname`, `inherit`, `flare_cone`*, `bulb_size`*, `glow_size`*, `avg_delay`*,
`blink_duration`*, `color`, `min_color`*, `intensity`*, `glow_color`*, `lightsource_cone`*,
`always_on`, `docking_light`, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**,
**`ids_name`⁺**, **`lootable`⁺**, **`mass`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**,
**`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**,
**`use_count`⁺**, **`volume`⁺**

### `[Exterior]`

70 sections.

`shape`, `color`, `shape_weights`*, `fill_shape`*, `plane_slices`*, `bit_radius`*,
`bit_radius_random_variation`*, `min_bits`*, `max_bits`*, `move_bit_percent`*, `equator_bias`*,
`opacity`*, `thickness_edge`*, `outer_edge`*, `inner_edge`*, `num_segments`*, ~~`fade_range`~~,
`detail_shape`*, `detail_tile`*, `transition_dist`*, ~~`ball_scale`~~, ~~`flash`~~,
`flash_radius`, `flash_size`*, `spin`

### `[CharacterEncounter]`

68 sections.

`Location`, `autoplay`, `relocate_player`, `action`, `mission_text_id`, `offer`, `accept`,
`decision`, `decline`, `start_room`, `nooffer_text_id`, `reject`, **`greet`⁺**, **`walkup`⁺**

### `[Clouds]`

66 sections.

`puff_shape`*, `max_distance`*, `puff_colora`*, `puff_weights`*, `puff_drift`*, `puff_count`*,
`puff_radius`*, `puff_colorb`*, `near_fade_distance`*, `puff_max_alpha`*,
`lightning_intensity`*, `lightning_color`*, `lightning_gap`*, `lightning_duration`*,
~~`puff_density`~~, ~~`puff_cloud_size`~~, ~~`puff_particles`~~, ~~`puff_size`~~,
`puff_opacity`*

### `[critical_loot]`

62 sections.

`faction`, `archetype`, `name`, `type`

### `[Engine]`

62 sections.

Archetype chain: `Engine`.

`nickname`, `ids_name`, `ids_info`, `volume`, `mass`, `max_force`, `linear_drag`,
`reverse_fraction`, `cruise_charge_time`, `cruise_power_usage`, `rumble_sound`*,
`indestructible`, `outside_cone_attenuation`, `inside_sound_cone`, `outside_sound_cone`,
`flame_effect`*, `cruise_start_sound`*, `cruise_loop_sound`*, `cruise_stop_sound`*,
`rumble_atten_range`*, `rumble_pitch_range`*, `cruise_disrupt_sound`*,
`cruise_backfire_sound`*, `trail_effect`*, `power_usage`, `character_loop_sound`*,
`character_pitch_range`*, `trail_effect_player`*, `character_start_sound`*,
`engine_kill_sound`*, `cruise_disrupt_effect`*, `animation`, `hardpoint`, `RenderManager`*,
`Deformable`*, `FLAppearance`*, `VMeshWire`*, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**, **`inherit`⁺**,
**`lootable`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**, **`use_count`⁺**

### `[Fog]`

61 sections.

`color`, ~~`fog_enabled`~~, `near`*, `distance`*, `opacity`*

### `[Nebula]` ‡

60 sections.

`file`, `zone`

### `[NebulaLight]` ‡

60 sections.

`ambient`, `sun_burnthrough_intensity`*, `sun_burnthrough_scaler`*

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

`npc_ship`*, `space_costume`, `scan_for_cargo`*, `formation`, `voice`, `affiliation`*,
`legality`*, `nickname_plurality`*, `msg_id_prefix`, `jump_preference`*, `mc_costume`*,
`lastname`*, `rank_desig`*, `formation_desig`*, `firstname_male`*, `large_ship_desig`*,
`large_ship_names`*, `scan_announce`*, `scan_chance`*, `firstname_female`*

### `[RepChangeEffects]`

55 sections.

`empathy_rate`*, `event`*, `Group`

### `[system]`

55 sections.

`nickname`, `file`, `pos`, `visit`, `strid_name`, `ids_info`, `msg_id_prefix`, `NavMapScale`,
`DirectX8`*, `TextureLibrary`*, `VMeshLibrary`*, `SoundManager`*, `SoundStreamer`*,
`MaterialAnimation`*, `MaterialBatcher`*, `alchemy`*, `FxRuntime`*, `MaterialLibrary`*

### `[ambient]` ‡

54 sections.

`color`

### `[BackgroundLightning]` ‡

54 sections.

`duration`*, `gap`, `color`

### `[Dust]` ‡

54 sections.

`spacedust`

### `[Music]`

54 sections.

`space`, `danger`*, `battle`*

### `[Spiels]` ‡

54 sections.

`ShipDealer`*, ~~`CommodityDealer`~~, ~~`EquipmentDealer`~~

### `[SystemInfo]`

54 sections.

`space_color`*, `local_faction`, `name`, `rpop_solar_detection`

### `[AttachedFX]`

52 sections.

Archetype chain: `Root`.

`nickname`, `particles`, `use_throttle`, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**,
**`ids_name`⁺**, **`mass`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**,
**`rotation_inertia`⁺**, **`type`⁺**

### `[BeamSpear]` ‡

51 sections.

`nickname`, `tip_length`*, `tail_length`*, `head_width`*, `core_width`*, `tip_color`*,
`core_color`*, `outter_color`*, `tail_color`*, `head_brightness`*, `trail_brightness`*,
`head_texture`*, `trail_texture`*, `flash_size`*

### `[Texture]`

51 sections.

`tex_shape`*, `file`, `shape_name`, `dim`*, `name`, `texture_name`*

### `[FactionGood]`

48 sections.

`MarketGood`, `faction`

### `[Background]` ‡

46 sections.

`nebulae`*, `basic_stars`*, `complex_stars`*

### `[star_glow]`

46 sections.

`nickname`, `shape`, `scale`, `inner_color`*, `outer_color`*

### `[EffectType]` ‡

45 sections.

`nickname`, `Priority`, `generic_priority`, `lod_type`, `radius`, `visibility`, `update`,
`run_time`, `pbubble`

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

### `[destroy_root]`

37 sections.

`at_t`

### `[InternalFX]`

37 sections.

Archetype chain: `InternalFXEquip`.

`nickname`, `use_sound`, `use_animation`, **`attachment_archetype`⁺**, **`DA_archetype`⁺**,
**`explosion_arch`⁺**, **`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**,
**`ids_name`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mass`⁺**, **`mission_property`⁺**,
**`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`units_per_container`⁺**, **`use_count`⁺**, **`volume`⁺**

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

### `[CockpitCamera]` ‡

34 sections.

`znear`*, `fovx`

### `[cockpit]`

33 sections.

`mesh`, ~~`int_brightness`~~, `head_turn`*

### `[TurretCamera]`

33 sections.

`tether`*, `yaw_rotate_speed`*, `pitch_rotate_speed`*, `accel_speed`*

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

`nickname`, `DA_archetype`, `hit_pts`, `mass`, `explosion_arch`, `LODranges`*,
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

### `[DocumentationNode]` ‡

20 sections.

`node_id`, `documentation`, `child_node`

### `[DynamicLightning]` ‡

20 sections.

`gap`, `duration`*, `color`, `ambient_intensity`*, `intensity_increase`*

### `[MissileBlock]` ‡

20 sections.

`nickname`, `missile_launch_interval_time`*, `missile_launch_interval_variance_percent`*,
`missile_launch_range`*, `missile_launch_cone_angle`*, `missile_launch_allow_out_of_range`*

### `[Cursor]`

19 sections.

`nickname`, `anim`, `Hotspot`*, `blend`*, `scale`, `spin`, `color`

### `[archetype]` ‡

18 sections.

`ship`, `Simple`*, `snd`*, `equipment`, `Solar`, `voice`

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

`at_t`, `hardpoint`, `radius`, `force`*, `pos_offset`, `damage`

### `[spines]`

16 sections.

`spine`*, `nickname`, `radius_scale`*, `shape`, `min_radius`*, `max_radius`*

### `[CargoPod]`

15 sections.

Archetype chain: `AttachedEquipment`.

`nickname`, `DA_archetype`, `hit_pts`, `mass`, `HP_child`, `LODranges`*, `material_library`,
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

### `[start_cam_particles]` ‡

13 sections.

`effect`, `at_t`, `pos_offset`, `ori_offset`

### `[IGraph]`

11 sections.

`point`, `nickname`, `type`

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
**`explosion_resistance`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mission_property`⁺**,
**`phantom_physics`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`use_count`⁺**

### `[MineDropper]`

10 sections.

Archetype chain: `Launcher`.

`nickname`, `ids_name`, `ids_info`, `DA_archetype`, `material_library`, `HP_child`, `hit_pts`,
`explosion_resistance`, `debris_type`, `parent_impulse`, `child_impulse`, `volume`, `mass`,
`damage_per_fire`, `power_usage`, `refire_delay`, `muzzle_velocity`, `toughness`,
`projectile_archetype`, `dry_fire_sound`, `separation_explosion`, `lootable`, `LODranges`*,
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

### `[layer]` ‡

8 sections.

`Texture`*, `color`, ~~`near_alpha_factor`~~, ~~`far_alpha_factor`~~, `radius_factor`*,
`u_offset`*, `v_offset`*, `du`*, `dv`*, `v_scale`*

### `[damage_root]`

7 sections.

`at_t`, `damage_type`*, `hitpoints`*

### `[DetailSwitchTable]`

7 sections.

`switch`

### `[lens_flare]`

7 sections.

`bead`*, `nickname`, `shape`, `min_radius`*, `max_radius`*

### `[MsnRandEnc]`

7 sections.

`label`, `nickname`, `encounter_type`, `attacker_rep_name`, `activation_type`, `formation`,
`num_forms`, `target_ship_name`

### `[PetalAnimations]`

7 sections.

`anim`

### `[Skeleton]`

7 sections.

`sex`, **`nomotion`⁺**

### `[BuzzPassByBlock]` ‡

6 sections.

`buzz_break_direction_weight`*, `buzz_pass_by_style_weight`*, `nickname`,
`buzz_distance_to_pass_by`*, `buzz_pass_by_time`*, `buzz_break_turn_throttle`*,
`buzz_break_direction_cone_angle`*, `buzz_pass_by_roll_throttle`*,
`buzz_drop_bomb_on_pass_by`*

### `[CountermeasureBlock]` ‡

6 sections.

`nickname`, `countermeasure_active_time`*, `countermeasure_unactive_time`*

### `[EffectLOD]` ‡

6 sections.

`type`, `max_lod_screen_size`*, `min_lod_screen_size`*, `min_screen_size`*

### `[lefthand]` ‡

6 sections.

`nickname`, `mesh`

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

`nickname`, `mesh`

### `[Thruster]`

6 sections.

Archetype chain: `Thruster`.

`nickname`, `ids_name`, `ids_info`, `DA_archetype`, `HP_child`, `hit_pts`,
`explosion_resistance`, `debris_type`, `parent_impulse`, `child_impulse`, `volume`, `mass`,
`max_force`, `particles`, `hp_particles`, `power_usage`, `lootable`, `separation_explosion`,
`LODranges`*, `material_library`, **`attachment_archetype`⁺**, **`explosion_arch`⁺**,
**`inherit`⁺**, **`mission_property`⁺**, **`phantom_physics`⁺**, **`rotation_inertia`⁺**,
**`toughness`⁺**, **`tractored_explosion`⁺**, **`type`⁺**, **`units_per_container`⁺**,
**`use_count`⁺**

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

`nickname`, `glow_ring_effect`*, `glow_ring_hp`*, `glow_create_time`*, `jump_out_time`*,
`jump_out_tunnel_time`*, `jump_in_tunnel_time`*, `jump_in_time`*, `kill_time_before_done`*,
`jump_tunnel_effect`*, `jump_tunnel`*, `jump_ambient`*, `jump_background_color`*

### `[KeyMap]` ‡

5 sections.

`key`, `nickname`

### `[lens_glow]`

5 sections.

`nickname`, `shape`, `radius_scale`*, `inner_color`*, `outer_color`*, `glow_fade_in_seconds`*,
`glow_fade_out_seconds`*

### `[StrafeBlock]` ‡

5 sections.

`nickname`, `strafe_run_away_distance`*, `strafe_attack_throttle`*, `strafe_turn_throttle`*

### `[BeamBolt]` ‡

4 sections.

`nickname`, `tip_length`*, `tail_length`*, `core_length`*, `head_width`*, `core_width`*,
`sec_core_width`*, `tip_color`*, `core_color`*, `outter_color`*, `sec_core_color`*,
`sec_outter_color`*, `tail_color`*, `head_brightness`*, `trail_brightness`*, `head_texture`*,
`trail_texture`*, `flash_size`*

### `[gate_tunnel]` ‡

4 sections.

`nickname`, `write_depth_buffer`*, `num_spline_control_points`*, `x_range`*, `y_range`*,
`z_range`*, `min_radius`*, `max_radius`*, `far_radius_factor`*, `min_speed`*, `max_speed`*,
`time_to_max_speed`*, ~~`fade_distance`~~, `near_alpha`*, `far_alpha`*, `num_t_steps`*,
`num_s_steps`*, `min_rotation`*, `max_rotation`*, `min_rgb`*, `max_rgb`*

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
`diversion_pctg`, **`attachment_archetype`⁺**, **`explosion_arch`⁺**,
**`explosion_resistance`⁺**, **`inherit`⁺**, **`lootable`⁺**, **`mission_property`⁺**,
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

`group_name`*, `at_t`, `damage_type`*, `hitpoints`*

### `[EngineKillBlock]` ‡

3 sections.

`nickname`, `engine_kill_use_afterburner`*, `engine_kill_search_time`*,
`engine_kill_face_time`*, `engine_kill_afterburner_time`*, `engine_kill_max_target_distance`*

### `[ExclusionBand]` ‡

3 sections.

`zone`, `render_parts`*, `shape`, `height`*, `offset_dist`*, `fade`*, `texture_aspect`*,
`color_shift`*, `ambient_intensity`*, `cull_mode`*, `vert_increase`*

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
`ship_archetype`

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

`voices`*, `fuses`, `effects`*, `sounds`*, `equipment`, `goods`, `loadouts`, `markets`,
`ships`, `Solar`, `universe`, `Constants`, `fonts`*, ~~`fonts_dir`~~, `rich_fonts`*,
`explosions`, `Debris`*, `Asteroids`, `bodyparts`, `costumes`, `PetalDB`, `effect_shapes`*,
~~`concave`~~, `intro`*, `gate_tunnels`, `groups`, `HUD`*, `jump_effect`, `stars`*, `IGraph`*,
`bases`, `NewCharDB`, `WeaponModDB`, `RtcSlider`

### `[DeathCamera]` ‡

1 section.

`fovx`

### `[Diff2Money]`

1 section.

`Diff2Money`

### `[dump_cargo]`

1 section.

`at_t`, `origin_hardpoint`

### `[EngineEquipConsts]`

1 section.

`CRUISE_DISRUPT_TIME`, `MAX_DELTA_FX_THROTTLE`, `THROTTLE_STEADY_TIME`,
`THROTTLE_ATTEN_MOD_RANGE`, `DELTA_THROTTLE_ATTEN_MOD_CHANGING`,
`DELTA_THROTTLE_ATTEN_MOD_STEADY`, `CRUISE_STEADY_TIME`, `DELTA_CRUISE_ATTEN_MOD_STEADY`,
`CRUISE_ATTEN_MOD_RANGE`, **`cruise_accel_time`⁺**, **`cruise_drag`⁺**, **`cruising_speed`⁺**,
**`max_engine_fx_throttle`⁺**

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

`jump_out_effect`, `jump_in_effect`

### `[keymap=1.1]`

1 section. No properties.

### `[ListServer]` ‡

1 section.

`hostname`*, `port`*

### `[locked_gates]`

1 section.

`npc_locked_gate`*, `locked_gate`

### `[make_invincible]`

1 section.

`turn_on`

### `[Maneuvers]` ‡

1 section.

`maneuver`

### `[MaterialMap]` ‡

1 section.

`name`, ~~`EcEtOcOt`~~, ~~`DcDtEcEt`~~

### `[mPlayer]`

1 section.

`vnpc`, `locked_gate`, **`can_dock`⁺**, **`can_tl`⁺**, **`dock_exception`⁺**, **`rumor`⁺**,
**`tlr_exception`⁺**

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

`view_position`

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

### `[StoryInfo]` ‡

1 section.

`Mission`*, `MissionNum`*, `delta_worth`*

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

`at_t`, `ang_drag_scale`*, `turn_throttle_z`*, `turn_throttle_x`*, `turn_throttle_y`*,
`throttle`*

### `[video]`

1 section.

`option`

### `[Waypoint]` ‡

1 section. No properties.

### `[WinCamera]` ‡

1 section.

`fovx`

### `[AvailableShip]`

**Not in retail data, and obsolete.** The header is matched only to emit
`*** WARNING: [AvailableShip] is obsolete`, `RoomData.cpp` — no property is read.

### `[Billboard]`

**Not in retail data, and obsolete.** The header is matched only to emit
`*** WARNING: [Billboard] is obsolete`, `RoomData.cpp:2115` — no property is read.

### `[Cloud]`

**Not in retail data, and obsolete.** The header is matched only to emit
`*** WARNING: [Cloud] is obsolete`, `RoomData.cpp:2046` — no property is read.

### `[CollisionConsts]`

**Not in retail data.**

**`damage`⁺**, **`max_impact_speed`⁺**

### `[damage_hp_attachment]`

**Not in retail data.** A fuse action: `server.dll` dispatches it alongside the eleven
other action blocks and constructs a 52-byte `FuseAction`. `at_t` applies, being read for
every action by `FuseAction::ReadFuseActionValue`; its remaining properties are matched by
nothing — as are its siblings' `fate`, `hardpoint`, `group_name`, `hitpoints`.

### `[Decloaked]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 50 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[Display]`

**Not in retail data.**

**`color_bpp`⁺**, **`depth_bpp`⁺**, **`size`⁺**

### `[DynBaseInfo]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 1 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[DynSysInfo]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 1 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[GoodsCartPlacement]`

**Not in retail data, and obsolete.** The header is matched only to emit
`*** WARNING: [GoodsCartPlacement] is obsolete`, `RoomData.cpp` — no property is read.

### `[GoodsPilePlacement]`

**Not in retail data, and obsolete.** The header is matched only to emit
`*** WARNING: [GoodsPilePlacement] is obsolete`, `RoomData.cpp` — no property is read.

### `[GoodType]`

**Not in retail data, and obsolete.** The header is matched only to emit
`*** WARNING: [GoodType] is obsolete`, `GoodList.cpp` — no property is read.

### `[Invulnerables]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 50 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[Lighting]`

**Not in retail data, and obsolete.** The header is matched only to emit
`*** WARNING: [Lighting] is obsolete`, `RoomData.cpp:2123` — no property is read.

### `[MarkObj]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 50 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[Mission01aSave]`

**Not in retail data.**

**`missionstatenum`⁺**

### `[Mission01bSave]`

**Not in retail data.**

**`missionstatenum`⁺**

### `[MObjective]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 50 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[MonitorPlacement]`

**Not in retail data, and obsolete.** The header is matched only to emit
`*** WARNING: [MonitorPlacement] is obsolete`, `RoomData.cpp` — no property is read.

### `[MsnRandEncSave]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 50 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[MsnShipSave]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 50 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[MsnSolarSave]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 50 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[MsnVibeInfo]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 50 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[MsnWingSave]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 50 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[PerfCount]`

**Not in retail data.**

**`count`⁺**

### `[PerfOptions]`

**Not in retail data.** Read **positionally** — its handler in `Freelancer.exe` makes 4 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[PerfVersion]`

**Not in retail data.**

**`skipmachinewarnings`⁺**, **`version`⁺**

### `[RandomEncounter]`

**Not in retail data.** Read **positionally** — its handler in `content.dll` makes 50 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[RandomMission]`

**Not in retail data.**

**`type`⁺**

### `[RearView]`

**Not in retail data.** Read **positionally** — its handler in `Freelancer.exe` makes 3 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

### `[RepairDroid]`

**Not in retail data.**

Archetype chain: `RepairDroid`.

**`attachment_archetype`⁺**, **`DA_archetype`⁺**, **`explosion_arch`⁺**,
**`explosion_resistance`⁺**, **`hit_pts`⁺**, **`ids_info`⁺**, **`ids_name`⁺**, **`inherit`⁺**,
**`lootable`⁺**, **`mass`⁺**, **`mission_property`⁺**, **`nickname`⁺**, **`phantom_physics`⁺**,
**`repair_rate`⁺**, **`rotation_inertia`⁺**, **`tractored_explosion`⁺**, **`type`⁺**,
**`units_per_container`⁺**, **`use_count`⁺**, **`volume`⁺**

### `[RepairRobotPlacement]`

**Not in retail data, and obsolete.** The header is matched only to emit
`*** WARNING: [RepairRobotPlacement] is obsolete`, `RoomData.cpp` — no property is read.

### `[ShipPlacement]`

**Not in retail data, and obsolete.** The header is matched only to emit
`*** WARNING: [ShipPlacement] is obsolete`, `RoomData.cpp` — no property is read.

### `[ThrusterEquipConsts]`

**Not in retail data.**

**`exterior_sound_name`⁺**, **`inside_cone_angle`⁺**, **`interior_sound_name`⁺**,
**`max_volume_force`⁺**, **`min_volume_force`⁺**, **`outside_cone_angle`⁺**,
**`outside_cone_attenuation`⁺**

### `[Turret]`

**Not in retail data.** Read **positionally** — its handler in `Freelancer.exe` makes 6 indexed
`get_value_*` calls and no `is_value` call, so its properties have no names to recover.

---

[ENGINE.md](ENGINE.md) · [INI.md](INI.md) · [RETAIL.md](RETAIL.md) · [THORN.md](THORN.md)
