# Production readiness audit — current tree

**Reviewed:** working tree after the second remediation pass on top of `c552ae3`
**Method:** read every file, re-ran every gate, recomputed the geometry numerically,
solved the stackup by hand against the actual part dimensions, checked the firmware
against ZMK's devicetree conventions, and **sampled the exported meshes** for every
claim that is about a hole or a pocket rather than a dimension.
**Supersedes:** [audit-initial-commit.md](audit-initial-commit.md), which reviewed
the first commit and no longer describes this tree.

---

## Verdict

Both halves are now manufacturable. Every gate in the repository passes: firmware
matrix and shield configuration, mesh watertightness and dimensions, the
plate/case/PCB alignment, the PCB DRC gate **at every severity**, and the
fabrication-rule gate. All four boards route clean (0 violations, 0 unconnected
pads) and their JLCPCB gerber/BOM/CPL packages are in `pcb/dist/`.

What has **not** happened is a physical build. Do the dry-fit in step 1 of
[assembly.md](assembly.md) before spending money.

| Area | State |
|---|---|
| Case / plate / dongle CAD | ✅ buildable, gated by `tests/test_models.js`, dimensions derived from one stackup |
| Firmware configuration | ✅ split transport, `col-offset`, per-shield `.conf`, `settings_reset` all correct |
| Matrix ↔ CAD ↔ PCB agreement | ✅ gated by `tests/test_alignment.js` and by the generator itself |
| PCB routing and fabrication output | ✅ 0 DRC violations **at every severity**, 0 unconnected, inside the fab's process limits, gerbers + BOM + CPL emitted |
| Schematic | ✅ `pcb/dist/sch/`, generated from the DRC-clean board, ERC-clean, netlist-diffed back against it |
| Documentation | ✅ assembly guide, generated layout diagram, BOM with real part numbers |

Every P0 and every defect that could have produced an unbuildable board is closed.
What remains open is either a deliberate product decision (the 69 mm docked gap, the
200 mAh cell ceiling) or something only a physical build can settle (the slide
switch body, the switch-body plate gap). Each is stated below with the exact change
that would close it.

### Defects this pass found

Four defects were live in the previous tree. None was visible to an existing gate, and
three of them would have been discovered only by a buyer:

1. **The USB-C window did not reach the outer wall face.** The through-cut started
   1.3 mm inside the wall and left a membrane over the port, so **no cable could
   ever have been plugged in** - the board could not be flashed or charged in its
   case. The previous audit described this window as a 4 mm through-opening and
   deduced a subtler overmold problem from it; both were wrong in the same direction.
2. **The dongle's USB-C window cut empty space outside its own case.**
   `rotate([90,0,0])` sends +Z to -Y, so the extrusion that was meant to cross the
   -Y wall ran away from it, and the XIAO's port sat behind a solid 1.4 mm wall.
   The lid's copy of the same cut never reached the lip that stands in front of the
   connector either.
3. **A via was drilled into a through-hole pad's drill.** On the left MX board a GND
   via overlapped U1's pin-4 hole (0.0 mm between hole edges, 0.25 required). The
   router allowed it because a net may reuse its own cells, and the DRC gate hid it
   because the check is a *warning* and the gate only asked for errors.
4. **Every published docked dimension was 36 mm too small.** `docs/generate_layout.js`
   - the file whose whole job is to stop the docs drifting from the hardware -
   drew the right half at the left half's width and offset its key field as if it
   had the left half's outer wall. So the diagram, the KLE file, the README table
   and the "67 mm centre gap" all inherited a two-column error: the real figures
   are **386.2 mm docked** and a **69.1 mm** 5-to-6 centre gap (405.6 / 71.5 mm for
   MX). Both halves' real widths and both cavity offsets are now computed
   separately, and the seam gap is taken from the drawn key positions rather than
   from a formula.

All four are fixed and each now has a gate: the case and dongle meshes are sampled
at the port by `tests/test_alignment.js` (mutation-tested by restoring the old case),
the DRC gate fails on warnings as well as errors, and the layout diagram prints its
own docked width and seam gap so the next reader can check them against the CAD.

---

## P0 — closed

### P0-1. ~~The PCBs are not routed, so no fabrication package exists~~ — FIXED

The generator now contains a real two-layer grid router (0.4 mm grid, 0.25 mm
tracks, 0.6/0.3 mm vias) instead of hand-drawn bus diagonals. Nets are grown
nearest-terminal-first from the already-routed tree in a fixed order: the 34/42
local switch-to-diode links, then ROW0–4, then the column busses, then the encoder,
then the power tree. Occupancy is per-layer with a net owner and a guard on the four
orthogonal neighbours, which turns the 0.2 mm clearance rule into a construction
property rather than a post-hoc check.

Result, from a clean `pcb/dist`:

| Board | DRC | Unconnected | Segments | Vias |
|---|---|---|---|---|
| left choc | 0 | 0 | 5600 | 81 |
| right choc | 0 | 0 | 6086 | 83 |
| left mx | 0 | 0 | 6147 | 77 |
| right mx | 0 | 0 | 6758 | 93 |

**A defect the router work exposed:** the original footprint put the hotswap
solder pads *on the switch pin positions*. That is electrically perfect - the
netlist check passes, DRC passes, the matrix works in simulation - and mechanically
impossible: a Kailh socket does not solder to the pin, its two tabs land about
3.3 mm outboard of it, and the pin needs a 3.0 mm clearance hole for the socket body
to sit in. Found by checking against marbastlib’s `SW_choc_v1_HS_CPG135001S30_1u`
and `SW_MX_HS_CPG151101S11` and ergogen’s `choc.js` / `mx.js`, which all agree.
The footprints are now taken from those sources, and `tests/test_alignment.js`
asserts the outboard offset and the pin clearance holes on all four boards -
mutation-tested by moving a pad back onto its pin.

DRC-clean is a *consequence* of the router, not a suppressed check: the gate still
fails on violations or unconnected pads, and it now withdraws the previous fab
artifacts **before** verifying, so a crash or a thrown assertion can never leave
orderable files behind. KiCad's creation timestamps are pinned on the way out, so
the gerber set is reproducible and a diff in `pcb/dist/` always means a real
change.

Two mechanisms were added, both of which the first audit asked for:
- **`verifyNetlist`** reads each generated board back and diffs every pad's net
  against truth derived from the ZMK overlays (`&pro_micro N` → D-number →
  `PROMICRO_PAD_SIGNALS`), the `RC()` set in `interlock_ergo.dtsi`, and the key
  matrix. It throws on any mismatch, and is negative-tested by swapping `D4/D5`.
- **`tests/test_alignment.js`** independently recomputes the key grid from
  `cad/interlock_params.scad` and asserts that every switch footprint on all four
  boards sits on the plate's aperture grid, that the encoder is on `RC(0,0)` of the
  left half and absent from the right, and that every key owns a distinct
  `SW_D_*` diode net.

**Residual risk:** the router is sequential-greedy. A future footprint or pitch
change could leave a net unroutable — but that fails safe: the gate withholds the
gerbers and exits non-zero, so it can never emit an unconnected board.

### P0-2. ~~There is no schematic~~ — FIXED

`pcb/generate_schematic.js` emits `pcb/dist/sch/interlock_ergo_{left,right}.kicad_sch`
by **reading the already-verified board file** - every reference, footprint, pad
number and pad net comes out of the `.kicad_pcb`, so the schematic cannot disagree
with the copper and no electrical knowledge is duplicated. Each key is a cell of
socket -> diode with its column and row on global labels and the per-key net on a
local label; the controller's 24 pads, the power tree and the encoder are drawn in
the power section, with `no_connect` markers where the board has no net.

What it verifies on every run, per half:

| Claim | left | right |
|---|---|---|
| pads diffed pin-by-pin against the board | 168 | 197 |
| ERC errors | 0 | 0 |
| ERC warnings | 142 | 174 |
| choc board vs mx board, all pad nets | identical | identical |
| `kicad-cli sch export netlist` vs the board | exact match | exact match |

The 142/174 warnings are two classes and they are asserted to be *only* those:
`lib_symbol_issues` and `footprint_link_issues`, i.e. "this library nickname is not
in the project's symbol/footprint table" - true by construction, because the symbols
are embedded in `lib_symbols` and the footprints are inline in the board. Any other
warning class, and any ERC error, fails the run. Output is deterministic (two runs
are byte-identical; UUIDs are hashed from stable identity strings).

That closes all four concerns the first audit raised: there is a human-reviewable
electrical document (A3 for the left half, A2 for the right), ERC exists, a
repairer can trace a fault, and editing the generator cannot silently change the
electrics - the drawing is regenerated from the same board the DRC gate approved.
The choc/mx twin check exists because the schematic is drawn from the choc board
alone: if the two variants ever diverge, the run fails instead of describing one
with the other's drawing.

## P1 — will cost money or goodwill if shipped as-is

### P1-1. The docked centre gap is 69 mm — ACCEPTED (documented, not redesigned)

The row stagger (0 / 0.5 / 0.75 / 1.25 / 0.25 u) needs 22.5 mm of horizontal
shear. With a straight seam plane that shear lands as dead case width on each
half's seam edge, so the centre-to-centre distance between `5` and `6` is
**69.1 mm on every row** (3.8 u), not the "~46 mm" claimed in the first README
and not the ~1.5 u of a normal staggered board. Docked width is 386.2 mm, because
the right half has nine columns to the left half's seven.

**Decision:** ship as-is and state it plainly (README, generated layout diagram,
docs/architecture.md). This is a split keyboard, not a 65 %; the halves are used
apart most of the time, and the width is the honest price of a straight seam plus
ANSI column positions. A staircase seam that follows the row edges would drop the
gap to about 24 mm, but it rewrites the case outline, the dovetail joint and the
plate outline, and it cannot be validated here without printing it. It stays on
the roadmap rather than in this tree.

### P1-2. Cell capacity is 200 mAh, not 500–800 mAh — ACCEPTED

`standoff_h = 5.5 mm` puts the PCB 5.5 mm above the floor, which is what a 4 mm
pouch plus wires and protection actually needs. A 5 mm 503040 cell — the one the
old BOM specified — **does not fit**. The build specifies a protected 402030
(the PCM board makes the pack ~34 mm long, and it is rated **200 mAh**), which is
honestly **1–2 weeks** between charges at ZMK's idle settings.

**Decision:** ship the 200 mAh cell and say so. The upgrade path is one constant:
raise `standoff_h` to ~7 mm in `cad/interlock_params.scad`, re-print both halves and
re-run `node tests/test_models.js` - every vertical dimension in the case is derived
from that number, and the assert there stops the change from silently breaking the
stackup. It is not done here because it is a 500 mAh cell that has not been bought
and measured, and because both halves would have to be reprinted.

### P1-3. The slide switch fit is assumed, not verified — DOCUMENTED

The case has **no cutout for the slide switch at all**: an MSK-12D19's actuator is
on the *top* face, travelling along its 9 mm axis, so the switch is operated from
above through the open controller bay and its actuator ends up about 0.8 mm proud
of the 14.2 mm case rim. An earlier revision cut a slot in the outer side wall, at
the wrong height and the wrong axis; it is gone. The PCB places `SW_PWR` 2.05 mm
from the outer board edge so the body clears the 4 mm wall.

That assumes a MSK-12D19-class body of about 3.5 mm × 9.0 mm × 5.5 mm overall.
**Clones differ**, and the pin pitch is unverified — measure the part you buy
against the PCB before soldering. `docs/assembly.md` and `docs/part-dimensions.md`
say exactly that, and the dimensions table marks the unverified ones `UNVERIFIED`.
No test can close this one; a caliper can.

### P1-4. No antenna keep-out is modelled — DOCUMENTED

The nice!nano's 2.4 GHz antenna end sits under the open controller bay, which is
good — there is no lid and no copper above it. `docs/architecture.md` now states the
rule (nothing metal within ~5 mm: no metal plate, no foil liner, no copper pour, no
metal-filled filament) and `docs/assembly.md` repeats it where someone will read it
before printing. Nothing in the model can enforce a keep-out around a part that is
socketed after printing, so this is a documentation item by nature.

### P1-5. No ESD, no TVS, no test points, no fiducials — FIDUCIALS ADDED

Three 1 mm fiducials with a 2 mm mask opening are now on the bottom (assembly)
side at asymmetric positions, excluded from the position files and registered with
the router as dead copper so no track can cross them. They are in
the `B.Cu`/`B.Mask` gerbers.

ESD/TVS protection and test points remain deliberately absent: this is a 76-key
matrix with no active silicon on the board, the controller is a socketed module
that can be replaced for $20, and adding TVS arrays to 15 column lines would double
the part count for a failure mode a hobby keyboard does not have. If this ever
becomes a batch product, that is the place to revisit.

### P1-6. ~~The extra dongle firmware targets have no enclosure~~ — DOCUMENTED

`config/build.yaml` builds the dongle shield for the XIAO BLE, the nice!nano v2
and the nRF52840 USB-A dongle. The printed case fits the **XIAO only** — the
nRF52840 dongle is a USB-A stick and physically cannot go in it. Either drop the
two unenclosed targets or document them as firmware-only. Chosen: documented. The
README firmware table and `docs/bom.md` now both say the printed enclosure fits the
XIAO and that the other two are firmware-only targets.

### P1-7. ~~USB-C window blocks standard cables~~ — FIXED (was worse than reported)

The detail above was wrong in the reviewer's favour: the cut did not even reach the
outer face, so the port was sealed by a 1.3 mm membrane and **no cable could be
plugged in at all** (see *Defects this pass found*). The window is now a true
through-cut with a **13.0 × 7.2 mm exterior relief pocket 2.4 mm deep**, chamfered
at its mouth, in `cad/interlock_case.scad`; the pocket is what lets an 11-12.5 mm
overmold reach the receptacle. Dimensions and the constraint (`usb_relief_d` must
leave a 1 mm flange) live in `cad/interlock_params.scad`, with an `assert()`.

The relief breaks the rim above the controller bay, which is open there anyway; it
is visible in the README renders as a notch, not as a print defect.

The dongle had the same class of bug and is fixed too: its window now cuts through
the 1.4 mm wall **and** through the lid's lip, which sits directly in front of the
XIAO's connector. `tests/test_alignment.js` samples all three meshes at the port and
fails if the window is blocked - mutation-tested by restoring the old case.

### P1-8. ~~Battery only charges when powered ON; J_BAT lacks polarity silk~~ — FIXED / DOCUMENTED

Silk: `+` and `-` are now printed on the front next to `J_BAT`'s two pins, and
`docs/assembly.md` still tells the builder to check the harness with a multimeter,
because packs are sold with both wire orders.

Behaviour: unchanged, because it is a property of the controller. `SW_PWR` sits
between the cell and the nice!nano's battery/charger node, so the cell is
**disconnected from its charger when the switch is off**. The alternative (switch
the regulator instead) is not available on a nice!nano, whose only battery entry
point is that node. Documented in `docs/architecture.md` and `docs/assembly.md`:
the keyboard charges with the switch ON.

### P1-9. ~~JLCPCB SMT packages omit all 76 hotswap sockets~~ — FIXED

`cpl_*.csv` and `bom_*.csv` now carry one row per placed part: the 76 diodes and
every socket, with its LCSC number (`C5333465` Choc / `C2800547` MX) and footprint.
The encoder cell on the left half correctly has a diode but no socket. The
through-hole parts (controller, slide switch, encoder, battery jack) stay out of
the SMT package on purpose - JLCPCB's economic service does not place them - and
`docs/bom.md` says so.

### P1-10. ~~173 DRC warnings suppressed by `--severity-error`~~ — FIXED

All of them, and the gate is now stricter than the audit asked for: the generator
runs DRC at the default severity set (errors **and** warnings) and refuses to emit
fab files unless the board is a literal zero. What the 173 were, and what fixed
them:

- 67 `nonmirrored_text_on_back_layer` - every bottom reference designator now has
  `(justify mirror)`.
- 61 `silk_over_copper` - the diode references moved 1.2 mm off their pads, the
  controller's outline box moved out to ±10 × ±15.25 mm so it no longer crosses its
  own through-hole pads, and the board title moved from the top of the board (which
  is the controller) into the silk-free strip under the key field.
- 5 `silk_overlap`, 1 `silk_edge_clearance` - same moves; `SW_PWR`'s reference now
  sits inboard of the switch, mirrored for the right half.
- 39 `lib_footprint_issues` - the footprints are written inline by the generator and
  exist in no library, so this check cannot apply. It is switched off the documented
  way, in the board's `.kicad_pro`, rather than filtered out of the output.

Turning the gate on immediately found a real electrical-mechanical defect that the
old gate had been hiding: a GND **via drilled into U1's pin-4 hole** on the left MX
board (`hole_to_hole`, a 0.0 mm gap, warning severity). The router now marks
through-hole pad drills as via-forbidden and steers around them.

### P1-11. Left spacebar is 1u with a 1u dead gap — ACCEPTED

`pcb/generate_pcb.js` comments state "Row 4 skips col 5 (Space_L is 2.25u)". The
switch footprint is placed on the standard 1u column grid (`c = 4`), not centered
at `4.5u`. A 2.25u keycap has a center stem and would collide with the Alt switch
at `c = 3`, so `Space_L` is a 1u keycap and a 1u gap remains between Space and Fn1.

**Decision:** keep it and document it (`docs/assembly.md` - do not buy a 2u or
2.25u keycap). The alternative that costs nothing in CAD is to put the missing key
back at row 4, column 5: one line in the generator, one in the plate, one binding
in the keymap, and the 19 mm hole becomes the 77th key. That is a layout decision
for the designer, not a defect fix, so it is recorded here rather than taken.

### P1-12. Rotary encoder knob rubs against Esc if >= 18 mm — DOCUMENTED

The EC11 encoder at `(0, 0)` is 18.0 mm (Choc) / 19.05 mm (MX) from the Esc switch
at `(0, 1)`. An MBK Choc keycap half-width is 8.75 mm, leaving 9.25 mm of radial
clearance from the encoder shaft, so a knob of 18 mm or more rubs. 16 mm is the
safe ceiling, and `docs/assembly.md` + `docs/part-dimensions.md` now say so.

### P1-13. ~~Vertical dovetail slide has tight tolerance and no bottom lead-in~~ — FIXED

The tab now has a **1.2 mm chamfer on its leading (bottom) flanks** - `offset()` on
the whole profile would have eaten the 6 mm throat, so only the flanks are tapered
and the tip keeps its own clearance. `tab_lead_in` went 0.8 → 1.2 mm and also
widened the socket mouth; `interlock_tol` went 0.20 → 0.25 mm, which after typical
PETG perimeter swelling leaves ~0.15 mm per flank. The joint is retained by the
magnets, not by friction, so the extra clearance costs nothing but wobble that the
magnets already damp. The undercut assert still holds (9 mm head, 6 mm throat,
6 mm-deep socket, 1 mm minimum back wall).

---

## P2 — polish

- `docs/kle_layout.json` used to be a hand-maintained file that disagreed with the
  hardware (wide modifiers and a 2.75u space that do not exist). It is now
  generated by `docs/generate_layout.js` along with the SVG, from the same key
  positions the PCB and CAD use, so it cannot drift again.
- `interlock_ergo_dongle.overlay` uses `events = <0>` where `< >` is the idiom, and
  re-declares `chosen` nodes the `.dtsi` already sets. Both benign.
- `interlock_ergo_left.conf` carries `CONFIG_ZMK_SPLIT_BLE_CENTRAL_BATTERY_LEVEL_*`
  which are gated on `ZMK_SPLIT_ROLE_CENTRAL` and therefore dropped on a
  peripheral. Harmless, misleading. **Fixed:** they now live only in
  `interlock_ergo_dongle.conf`, which is the central.
- The keymap's adjust layer binds `&bootloader` on both halves, which on a
  peripheral boots that half only. Fine, but worth a line in the docs.
- No `.zmk.yml` metadata, so the board will not appear in ZMK's hardware index.
- No release artifacts: `*.stl` is git-ignored, so a source-only clone has no
  printable parts until `node cad/build_models.js` is run. `cad/dist/` is
  reproducible in one command, which is arguably better than committing 2 MB of
  STLs, but a tagged release should attach the zips.
- **The ordering of the generator's stages is part of the safety property.** The
  board is written, then its netlist is verified, then DRC runs, then the fab files
  are emitted, and previous fab files are withdrawn *before* any of it. Inserting a
  step in the wrong place would make a dirty board orderable; the comment in
  `generateKiCadPCB` says so.
- **The DRC warning that `lib_footprint_issues` is off** lives in a small generated
  `.kicad_pro` next to each board, not in the gate code. If a future KiCad renames
  the check, the warnings come back and the gate fails loudly, which is the right
  failure direction.

---

## Verified working (this pass)

| Claim | How it was checked |
|---|---|
| 76 unique matrix positions, 34 left + 42 right | `tests/test_matrix.js` |
| `col-offset = <7>` on the transform, not the kscan | `tests/test_matrix.js` |
| `CONFIG_ZMK_SPLIT` set for all three shields | `tests/test_matrix.js` |
| `<shield>.conf` files named so Zephyr actually loads them | `tests/test_matrix.js` |
| CAD and PCB row stagger identical | `tests/test_matrix.js` |
| Every STL is a single watertight manifold shell | `tests/test_models.js` |
| Case heights equal the stackup sum, plate thickness exact, plate fits the rebate | `tests/test_models.js` |
| Plate-to-PCB gap equals the switch body depth (3.5 mm Choc / 5.0 mm MX) | `tests/test_models.js` |
| Dovetail is a real undercut (6 mm throat → 9 mm head), socket blind, ≥1 mm back wall | `assert()` in `cad/interlock_params.scad` |
| Magnet pockets are really open at the seam face, with the back wall intact, and the cell recess and bosses are really there | sampled in `cad/dist/interlock_choc_left.stl` during this pass (probe points at the pockets, recess and boss ring) |
| PCB bosses land on the PCB's four 2.2 mm mounting holes | geometry: cavity origin + 4 mm both sides |
| Rods/pockets/plate/PCB all agree on one origin chain | `cad/interlock_params.scad` dimensional comment + asserts |
| Access: USB-C window aligned to the controller edge, power actuator inside the wall, bay open for the controller and its reset button | geometry, cross-checked against `mcu_x`/`sw_x` in the generator |
| Every SMD part on the board is in both `bom_*.csv` and `cpl_*.csv`, and the three fiducials are on the assembly side and not collinear | `tests/test_fab_rules.js` |
| No two drills are closer than 0.4 mm edge-to-edge, and every via keeps that gap from a pad drill | `tests/test_fab_rules.js`, and the router's via-forbidden map |
| Emitting the same sources twice produces byte-identical boards and gerber zips | ran `pcb/generate_pcb.js` twice and compared md5 |
| Layout diagram matches the keymap | `docs/generate_layout.js` parses the keymap; 76 keys, labels match |
| Every PCB switch footprint is on the plate's aperture grid, encoder included, and every key has its own diode net | `tests/test_alignment.js`, against all four boards |
| Hotswap solder pads sit 3.15-3.40 mm outboard of a 3.0 mm pin clearance hole, as the socket requires | `tests/test_alignment.js`, mutation-tested |
| The exported plate meshes really have a 14.0mm aperture where each key goes, material in the webs between them, and the case really has the rebate where the plate lands | `tests/test_alignment.js` samples the STLs with a tilted ray cast; mutation-tested by shifting the aperture grid 1mm |
| Track width, via annular ring, pad annular ring and drill sizes are inside JLCPCB's 2-layer process limits - DRC cannot prove this, because KiCad's default minimums are 0 | `tests/test_fab_rules.js` |
| Order quantity per design stays inside the 650 cm² area budget | `tests/test_fab_rules.js` (it is 3 for the left Choc board and 2 for the others, not 3 for all) |
| **All three shields compile, link and emit `zmk.uf2`** | `nix build .#firmware-{left,right,dongle}` on ARM GCC 13.3 — left 21.00 % FLASH / 12.59 % RAM, right 20.84 % / 12.48 %, dongle 26.36 % / 20.38 % |
| The USB-C window is open through the case wall, with the overmold relief, and open through the dongle wall **and** its lid's lip | `tests/test_alignment.js` samples the exported meshes at the port; mutation-tested by restoring the old case |
| The DRC gate fails on warnings, not just errors | a `hole_to_hole` warning blocked the left MX board until the router was fixed |
| The schematic is drawn from the verified board and matches it pad for pad | `pcb/generate_schematic.js`: `kicad-cli sch erc` (0 errors, only the two explained library-nickname warning classes) and a 168/197-pad netlist diff, plus a choc-vs-mx net comparison; mutation-tested by renaming one mx pad net |
| `ZMK_KEYBOARD_NAME` fits Zephyr's `BT_DEVICE_NAME_MAX` | `tests/test_matrix.js`; the dongle name was 21 chars, which failed the build with a static assertion |
| The flake's `zephyrDepsHash` matches the pinned west manifest | a clean `nix build` of each shield; the previous literal was stale and blocked every firmware target |

## Not verified — do not assume

- **Anything about a physical unit.** No part of this repository has been printed,
  soldered or typed on. The dry-fit list in `docs/assembly.md` is the first thing
  to do, before ordering PCBs.
- **Live JLCPCB quotes.** Board sizes and the 650 cm² threshold are computed, not
  quoted.
- **nice!nano v2 exact outline** (17.8 × 33.0 mm is inferred from the Pro Micro
  pad grid) and the **nRF52840 dongle's** dimensions.
- **The encoder's plate clearance** (13.5 mm square) against your specific EC11.
- **RF performance** of the docked assembly, with the two radios ~150 mm apart and
  magnets 15 mm from each antenna.
- **Battery runtime.** The 1–2 week figure is arithmetic from a 200 mAh pack and a
  typical nRF52840 peripheral duty cycle, not a measurement.
- **The dovetail fit after the tolerance change.** 0.25 mm nominal is a print-and-see
  number; the dry fit in step 1 of [assembly.md](assembly.md) is the test.
- **The USB-C relief in real hands.** The pocket is sized against published
  overmold dimensions (11–12.5 × 6.0–6.8 mm), not against a cable on the bench.
