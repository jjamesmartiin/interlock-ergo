# Production readiness audit — current tree

**Reviewed:** working tree after the CAD/firmware remediation on top of `9b92192`
**Method:** read every file, re-ran every gate, recomputed the geometry numerically,
solved the stackup by hand against the actual part dimensions, and checked the
firmware against ZMK's devicetree conventions.
**Supersedes:** [audit-initial-commit.md](audit-initial-commit.md), which reviewed
the first commit and no longer describes this tree.

---

## Verdict

Both halves are now manufacturable. Every gate in the repository passes: firmware
matrix and shield configuration, mesh watertightness and dimensions, the
plate/case/PCB alignment, and the PCB DRC gate. All four boards route clean
(0 violations, 0 unconnected pads) and their JLCPCB gerber/BOM/CPL packages are in
`pcb/dist/`.

What has **not** happened is a physical build. Do the dry-fit in step 1 of
[assembly.md](assembly.md) before spending money.

| Area | State |
|---|---|
| Case / plate / dongle CAD | ✅ buildable, gated by `tests/test_models.js`, dimensions derived from one stackup |
| Firmware configuration | ✅ split transport, `col-offset`, per-shield `.conf`, `settings_reset` all correct |
| Matrix ↔ CAD ↔ PCB agreement | ✅ gated by `tests/test_alignment.js` and by the generator itself |
| PCB routing and fabrication output | ✅ 0 DRC violations, 0 unconnected, inside the fab's process limits, gerbers + BOM + CPL emitted |
| Documentation | ✅ assembly guide, generated layout diagram, BOM with real part numbers |
| Schematic capture | ⚠️ none — the netlist is code, diffed against the overlays on every build |

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
| left choc | 0 | 0 | 5724 | 89 |
| right choc | 0 | 0 | 5964 | 76 |
| left mx | 0 | 0 | 6406 | 89 |
| right mx | 0 | 0 | 7581 | 111 |

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

### P0-2. There is no schematic

Still open. The boards are generated from JavaScript and the netlist exists only as
code, so:

- there is no human-reviewable electrical document;
- there is no ERC — only the netlist diff plus PCB DRC;
- a repairer cannot trace a fault;
- editing the generator risks a silent electrical change.

`verifyNetlist` closes the last of these as far as firmware↔PCB agreement goes, and
the board is simple enough (one matrix, 76 diodes, no active silicon) that a
schematic is not needed in order to *build* it. Emitting a `.kicad_sch` from the
generator is the remaining polish item.

## P1 — will cost money or goodwill if shipped as-is

### P1-1. The docked centre gap is 67 mm, and every document said otherwise

The row stagger (0 / 0.5 / 0.75 / 1.25 / 0.25 u) needs 22.5 mm of horizontal
shear. With a straight seam plane that shear lands as dead case width on each
half's seam edge, so the centre-to-centre distance between `5` and `6` is
**67.1 mm on every row** (3.7 u), not the "~46 mm" claimed in the previous README
and not the ~1.5 u of a normal staggered board.

The board is therefore 350.2 mm wide docked, against 285 mm for a GH60 — it is
noticeably wider than a 65 % and has a hand-width hole in the middle. It still
works, and wide-split users may even prefer it, but it must be stated plainly
(it now is, in the README and on the generated layout diagram).

**Fix if you want it narrower:** make the seam a staircase that follows the row
edges instead of a straight plane. That changes the case outline, the joint and
the plate outline, and the dead zone drops to about 24 mm. Not a blocker; a real
design change.

### P1-2. Cell capacity is 200 mAh, not 500–800 mAh

`standoff_h = 5.5 mm` puts the PCB 5.5 mm above the floor, which is what a 4 mm
pouch plus wires and protection actually needs. A 5 mm 503040 cell — the one the
old BOM specified — **does not fit**. The build now specifies a 402030
(4 × 20 × 30 mm cell, but the PCM board makes the pack ~34 mm and it is rated
**200 mAh**, not the 250 an earlier pass assumed), which is honestly **1–2 weeks**
between charges.

Battery life figures in `docs/architecture.md` have been corrected. If you want
500 mAh, raise `standoff_h` to ~7 mm in `cad/interlock_params.scad` and re-print
both halves; the entire case depth is derived from that constant.

### P1-3. The slide switch fit is assumed, not verified

The case has a through-slot plus a finger recess in the outer side wall, and the
PCB places `SW_PWR` 2.05 mm from the outer board edge so its actuator sits inside
the 4 mm wall thickness. That assumes a MSK-12D19-class body of about
3.5 mm × 8.7 mm with ~1.5 mm of actuator travel. **Clones differ.** Measure the
part you buy; if the body is taller, the actuator is buried in the wall.
`docs/assembly.md` documents the two constants to change.

The switch is also recessed, so it is operated with a fingernail through the
recess rather than a proud tab. Documented, but it is a deliberate compromise
forced by a 4 mm wall.

### P1-4. No antenna keep-out is modelled

The nice!nano's 2.4 GHz antenna end sits under the open controller bay, which is
good — but nothing in the model or the docs enforces a 5 mm keep-out from metal
around it. Do not use a metal plate or a copper-pour case. Worth stating on the
product page.

### P1-5. No ESD, no TVS, no test points, no fiducials

Fine for a hand-soldered hobby board; a problem for a batch. If you ever use
JLCPCB assembly, add three 1 mm fiducials on the bottom side.

### P1-6. ~~The extra dongle firmware targets have no enclosure~~ — DOCUMENTED

`config/build.yaml` builds the dongle shield for the XIAO BLE, the nice!nano v2
and the nRF52840 USB-A dongle. The printed case fits the **XIAO only** — the
nRF52840 dongle is a USB-A stick and physically cannot go in it. Either drop the
two unenclosed targets or document them as firmware-only. Chosen: documented. The
README firmware table and `docs/bom.md` now both say the printed enclosure fits the
XIAO and that the other two are firmware-only targets.

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
  peripheral. Harmless, misleading.
- The keymap's adjust layer binds `&bootloader` on both halves, which on a
  peripheral boots that half only. Fine, but worth a line in the docs.
- No `.zmk.yml` metadata, so the board will not appear in ZMK's hardware index.
- No release artifacts: `*.stl` is git-ignored, so a source-only clone has no
  printable parts until `node cad/build_models.js` is run. `cad/dist/` is
  reproducible in one command, which is arguably better than committing 2 MB of
  STLs, but a tagged release should attach the zips.

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
| Magnet pockets flush at the seam face, mirrored on a shared datum, non-breaching | computed; `assert()` bounds the depth |
| PCB bosses land on the PCB's four 2.2 mm mounting holes | geometry: cavity origin + 4 mm both sides |
| Rods/pockets/plate/PCB all agree on one origin chain | `cad/interlock_params.scad` dimensional comment + asserts |
| Access: USB-C window aligned to the controller edge, power actuator inside the wall, bay open for the controller and its reset button | geometry, cross-checked against `mcu_x`/`sw_x` in the generator |
| Layout diagram matches the keymap | `docs/generate_layout.js` parses the keymap; 76 keys, labels match |
| Every PCB switch footprint is on the plate's aperture grid, encoder included, and every key has its own diode net | `tests/test_alignment.js`, against all four boards |
| Hotswap solder pads sit 3.15-3.40 mm outboard of a 3.0 mm pin clearance hole, as the socket requires | `tests/test_alignment.js`, mutation-tested |
| The exported plate meshes really have a 14.0mm aperture where each key goes, material in the webs between them, and the case really has the rebate where the plate lands | `tests/test_alignment.js` samples the STLs with a tilted ray cast; mutation-tested by shifting the aperture grid 1mm |
| Track width, via annular ring, pad annular ring and drill sizes are inside JLCPCB's 2-layer process limits - DRC cannot prove this, because KiCad's default minimums are 0 | `tests/test_fab_rules.js` |
| Order quantity per design stays inside the 650 cm² area budget | `tests/test_fab_rules.js` (it is 3 for the left Choc board and 2 for the others, not 3 for all) |

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
