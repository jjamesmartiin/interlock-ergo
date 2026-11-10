# Verified part dimensions

Every mechanical number the CAD depends on, with where it came from. The point of
this file is that a future change can be checked against a source instead of
against memory — three of the numbers below were wrong when they were first
assumed, and one of those three would have scrapped a PCB order.

Rules for this table: a number is only "verified" if there is a primary source
(manufacturer drawing, official library footprint, or an official 3D model). If
two independent libraries are the only evidence, say so. If nothing could be
confirmed, say `UNVERIFIED` and do not build on it.

| Part | Dimension used | Value | Verified how |
|---|---|---|---|
| Kailh Choc v1 PG1350 | plate aperture | **14.0 × 14.0 mm** | Kailh drawing gives 13.8 ± 0.2; 14.0 is the upper bound and is what ai03's production plate generator emits for Choc. Used deliberately: a printed PETG aperture comes out ~0.1-0.2 mm small, so 13.8 printed is risky and 14.0 printed lands near nominal. Retention on Choc comes from barbs bearing on the plate's underside, not from a tight bore, so the extra 0.1 mm/side costs no grip. |
| Kailh Choc v1 PG1350 | plate thickness | **1.2 mm** | The switch's plate seat is 1.3 mm (Kailh drawing), so 1.2 leaves the 0.1 mm the barbs take up. 1.5 mm is an MX number and gives loose Choc switches. |
| Kailh Choc v1 PG1350 | plate underside → PCB top | **3.5 mm** — *inferred, not read* | Kailh's PG1350 drawing (Adafruit-hosted PDF) is outlined vector text with no extractable dimension layer. What could be recovered is a consistent chain: total body height **5.00 mm** above the PCB, plate seat **1.30 mm**, and **4.70 mm** to the seat's top. 3.5 + 1.2 = 4.7, and 4.7 + 0.3 = 5.0. That is self-consistent but it is an inference. **Measure this before printing**: it is the single number that sets `case_depth`. See the tolerance procedure in [assembly.md](assembly.md). |
| Kailh Choc v1 PG1350 | switch pins | `(0, -5.95)` and `(5, -3.75)`, 1.2 mm pins | marbastlib `SW_choc_v1_1u` + ergogen `choc.js` agree. |
| Kailh Choc v1 | side retention pegs / centre post | Ø1.7 at x = ±5.5; Ø3.429 centre | marbastlib + ai03. |
| Kailh CPG135001S30 hotswap socket | solder pad position | **3.245 mm outboard of each pin** | marbastlib and keebio agree on 3.245; ergogen uses 3.275. |
| Kailh CPG135001S30 | solder pad size | **2.65 × 2.6 mm** | marbastlib and keebio (both traced to Kailh's drawing); ergogen uses 2.6 × 2.6. |
| Kailh CPG135001S30 | pin clearance hole | **Ø3.0, unplated** | Both libraries. Unplated matters: plating it invites shorts to the socket pads, and in a hotswap build the switch pin is not soldered. |
| Kailh MX CPG151101S11 | solder pad position | **3.275–3.55 mm outboard** — *sources disagree* | ergogen says 3.275/3.302, marbastlib says 3.55. Sources disagree by 0.275 mm; a 2.55 mm-wide pad absorbs it. `tests/test_alignment.js` accepts 3.10–3.60 for this reason. |
| Alps EC11E (with push) | body footprint | **12.0 × 12.2 mm** | KiCad official `RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm` (12.0 × 11.6) and marbastlib `ROT_Alps_EC11E-Switch` (11.8 × 12.2). The plate cuts 13.5 mm square, which leaves print tolerance. |
| Alps EC11E | terminals | A/B/C on 5.0 mm pitch at y = +7.5; push switch at y = −7 | Alps EC11E catalogue + both libraries. |
| Alps EC11E | mounting posts | **11.2 mm apart** (x = ±5.6), oval 2.8 × 1.5 | Alps drawing + both libraries. Without holes for these the encoder stands on its own legs and never seats. |
| Alps EC11E | bushing | Ø7.0 | Alps drawing. |
| Alps EC11E | body height above PCB | **UNVERIFIED (~6.5 mm assumed)** | The Alps drawing's vertical chain could not be read and no 3D model was available. The plate clearance is driven by this, so measure a sample if the encoder ever fouls the plate. |
| MSK-12D19 slide switch | body | **9.0 × 3.5 mm, 5.5 mm overall height** | LCSC C2904913 (DEALON MS-12D19-G2) spec table. That means ~3.5 mm body + ~2.0 mm of actuator **on the top face**, travelling along the 9.0 mm axis. |
| MSK-12D19 | pin pitch / travel | **UNVERIFIED** | No text-readable drawing found. The footprint uses 2.0 mm pitch; measure a sample before trusting it. |
| nice!nano v2 | board outline | **33.02 × 17.78 mm** | marbastlib's nice!nano footprints place the 24 pads at x = ±7.62, y = −13.97…+13.97 — the Pro Micro standard, 2.54 mm of board beyond each end. |
| nice!nano v2 | USB position | at the −Y short end, connector overhanging the board edge | Pro Micro convention; the case's front-wall window is sized for the connector, not the module. `mcuY = 17.0` puts the module's front edge 0.49 mm inside the PCB so nothing enters the wall. |
| Seeed XIAO nRF52840 | board outline | **20.955 × 17.78 mm, 1.6 mm thick, R1.905 corners** | Seeed's official KiCad project `Edge.Cuts`. **17.78 mm, not 17.5** — 17.5 is the older XIAO boards and a 17.5 mm pocket will not take this one. |
| Seeed XIAO nRF52840 | USB-C shell | ~1.4 mm inboard of the short edge, centred on Y | Same KiCad project. |
| Protected LiPo | cell + PCM | **LP402030: 4.0 × 20 × 30 mm cell, ~200 mAh, +3.2 mm PCM → ~34 mm pack** | LiPol Battery Co. LP402030 datasheet and PKCELL's model table. Allow 35 mm in the pocket, 4.5 mm with tape. There is no 402030 at Adafruit/SparkFun/Pimoroni; the documented 402030 is 200 mAh, not 250. |
| 6 × 3 mm N52 magnet | pocket | Ø6.2 × 3.2 deep, flush at the seam face | Own design; a 0.1 mm radial clearance for glue and 0.2 mm of relief behind the magnet. |
| USB-C cable overmold | max plug housing | **11-12.5 x 6.0-6.8 mm seats in the relief pocket** (13.0 x 7.2 x 2.4 deep) | Without the relief a flush window leaves the plug ~3 mm short of full insertion. The relief opens through the rim above the bay; that is intended. |
| EC11 encoder knob | max knob outer diameter | **≤ 16.0 mm** | 18 mm pitch to Esc with 17.5 mm keycap leaves 9.25 mm radial clearance; ≥ 18 mm knob rubs keycap. |
| JST-PH 2-Pin | polarity | **Pin 1 BAT+, Pin 2 GND** | Marked `+`/`-` on the front silk now; still check the LiPo harness, packs ship both ways. |

## Things this table caught

These values were wrong when first assumed, and every one was wrong in a way that
no test based on the netlist or DRC could see:

1. **Hotswap solder pads on the switch pin positions.** Electrically perfect,
   physically unsolderable. Would have scrapped a PCB order.
2. **No holes for the EC11 mounting posts.** The encoder would have stood on its
   own legs.
3. **The power switch cutout was in a side wall at the actuator's height.** An
   MSK-12D19's actuator is on the *top* face, so it is reached from above — the
   cutout was at the wrong height and the wrong axis, and is now gone entirely
   because the open controller bay already exposes it.
4. **The USB-C window never reached the outer wall face.** The through-cut stopped
   1.3 mm short, leaving a membrane over the port, so no cable could ever have
   connected; the dongle's window was extruded the wrong way and cut empty space
   *outside* its case. Both were invisible to the dimension checks and to every
   existing test. `tests/test_alignment.js` now samples the case and dongle meshes
   at the port and fails if the window is not open.

Items 1, 2 and 4 are now gates in `tests/test_alignment.js`, mutation-tested.
