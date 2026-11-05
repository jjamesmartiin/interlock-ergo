# Interlock Ergo Keyboard

[![Build ZMK Firmware](https://github.com/jamesm/interlock-ergo/actions/workflows/build-zmk.yml/badge.svg)](https://github.com/jamesm/interlock-ergo/actions/workflows/build-zmk.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![ZMK Firmware](https://img.shields.io/badge/Firmware-ZMK-purple.svg)](https://zmk.dev/)
[![Hardware](https://img.shields.io/badge/Hardware-KiCad%20%7C%20OpenSCAD-green.svg)](pcb/)

An open-source, wireless split ergonomic keyboard designed to solve the classic split keyboard touch-typing dilemma described in [this Reddit r/keyboards post](https://www.reddit.com/r/keyboards/comments/37ez40/help_im_looking_for_a_split_ergonomic_keyboard/):

1. **`6-Y-H-N` Strictly on the Right Half:** Traditional split boards awkwardly bundle the `6` key onto the left hand (`1-2-3-4-5-6`), causing constant mis-strikes for right-hand index finger touch typists. Interlock Ergo routes `6`, `Y`, `H`, and `N` cleanly on the right half.
2. **2-in-1 Interlocking Case:** Sliding dovetail joints with embedded N52 neodymium disc magnets allow both halves to lock into a single, rigid 65%+ unibody keyboard for lap typing, train/plane travel, or couch use—then pull apart for shoulder-width ergonomic desk typing.
3. **Plug-and-Play 2.4GHz USB Dongle:** Powered by native ZMK split central architecture. Both halves connect wire-free over low-latency 2.4GHz RF to a miniature USB dongle. The dongle acts as a genuine USB HID keyboard: zero Bluetooth pairing friction, works in BIOS/UEFI, and bypasses corporate IT Bluetooth restrictions. Instant Bluetooth profile switching (`&out OUT_BLE`) remains available for phones and tablets.
4. **Rotary Encoder & Macro Column:** Left half features an EC11 rotary encoder (volume / scroll scrub / mute click) and a dedicated vertical macro column (M1–M4).
5. **Dual Switch Standards Supported:**
   - **Variant A (Kailh Choc v1):** 18×17mm compact ergo spacing, 1.2mm plate, 2-prong crkbd/Corne hotswap sockets.
   - **Variant B (Cherry MX):** 19.05×19.05mm standard spacing, 1.5mm plate, MX hotswap sockets.

---

## Layout

```
[Enc/Mute] [Esc] [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]  ||  [ 6 ] [ 7 ] [ 8 ] [ 9 ] [ 0 ] [ - ] [ = ] [Bksp] [Home]
[  M1   ] [Tab  ] [ Q ] [ W ] [ E ] [ R ] [ T ]  ||  [ Y ] [ U ] [ I ] [ O ] [ P ] [ [ ] [ ] ] [  \  ] [End ]
[  M2   ] [Caps  ] [ A ] [ S ] [ D ] [ F ] [ G ]  ||  [ H ] [ J ] [ K ] [ L ] [ ; ] [ ' ] [  Enter  ]
[  M3   ] [Shift   ] [ Z ] [ X ] [ C ] [ V ] [ B ]||  [ N ] [ M ] [ , ] [ . ] [ / ] [Shift] [Up ] [Del] [PgUp]
[  M4   ] [Ctrl][Win][Alt] [ Space (2.25u) ] [Fn1]||  [ Space (2.0u/2.75u) ] [Alt][Fn2][Ctrl][Left][Down][Right][PgDn]
```

---

## Repository Directory

```
├── .github/workflows/
│   └── build-zmk.yml           # Automated cloud firmware compilation
├── cad/
│   ├── interlock_params.scad   # Shared parametric joint & tolerance math
│   ├── interlock_case_choc.scad# Kailh Choc v1 case (18x17mm pitch)
│   ├── interlock_case_mx.scad  # Cherry MX case (19.05mm pitch)
│   ├── interlock_plate_choc.scad # 1.2mm Choc switch plate
│   ├── interlock_plate_mx.scad # 1.5mm MX switch plate
│   ├── dongle_case.scad        # Snap-fit USB dongle case
│   ├── build_models.js         # Headless OpenSCAD STL compiler
│   └── dist/                   # Watertight, production-ready STL models
├── config/
│   ├── boards/shields/interlock_ergo/
│   │   ├── Kconfig.shield      # Left, Right, and Dongle shield declarations
│   │   ├── Kconfig.defconfig   # CONFIG_ZMK_SPLIT & central/peripheral roles
│   │   ├── interlock_ergo.dtsi # 76-key matrix transform
│   │   ├── interlock_ergo_left.overlay   # Left half GPIO matrix + EC11 encoder
│   │   ├── interlock_ergo_right.overlay  # Right half GPIO matrix with col-offset = 7
│   │   ├── interlock_ergo_dongle.overlay # Central USB receiver mock kscan
│   │   ├── interlock_ergo_left.conf      # Sleep & +8dBm BLE power
│   │   ├── interlock_ergo_right.conf     # Sleep & +8dBm BLE power
│   │   ├── interlock_ergo_dongle.conf    # Dongle central role & max connections
│   │   └── interlock_ergo.keymap         # QWERTY, Nav/Fn, and Media/BLE layers
│   ├── build.yaml              # ZMK build matrix
│   └── west.yml                # West manifest
├── docs/
│   ├── bom.md                  # Comprehensive parts list with verified links
│   ├── architecture.md         # Rationale, dongle architecture, battery math
│   ├── matrix_and_pinout.md    # Ground-truth GPIO pin mapping & wiring
│   ├── kle_layout.json         # Keyboard Layout Editor format
│   └── production-readiness-audit.md # Exhaustive adversarial audit report
├── pcb/
│   ├── generate_pcb.js         # KiCad board generator, Gerber & CPL exporter
│   ├── interlock_ergo_left_choc.kicad_pcb
│   ├── interlock_ergo_right_choc.kicad_pcb
│   ├── interlock_ergo_left_mx.kicad_pcb
│   ├── interlock_ergo_right_mx.kicad_pcb
│   └── dist/                   # Upload-ready JLCPCB Gerbers, BOM, and CPL files
└── tests/
    └── test_matrix.js          # Adversarial test verifying matrix, config, and 6YHN
```

---

## Manufacturing & Ordering Guide

### 1. Ordering PCBs from JLCPCB

1. Navigate to [JLCPCB](https://jlcpcb.com/quote).
2. Upload the Gerber zip package for your chosen variant from `pcb/dist/`:
   - Choc v1: `interlock_ergo_left_choc_gerbers.zip` and `interlock_ergo_right_choc_gerbers.zip`
   - MX: `interlock_ergo_left_mx_gerbers.zip` and `interlock_ergo_right_mx_gerbers.zip`
3. **Settings:**
   - **Dimensions:** Detected automatically.
   - **Layers:** 2 Layers.
   - **PCB Thickness:** 1.6 mm.
   - **Quantity:** **Select 3 pcs** (Selecting 5 pcs exceeds the 650 cm² total area limit and triggers a $57.46 surcharge. 3 pcs costs ~$18 total!).
   - **Surface Finish:** LeadFree HASL or ENIG (recommended for hotswap durability).
   - **Solder Mask:** Black (or your preferred color).
4. **SMT Assembly (Optional):**
   - Upload `bom_*.csv` and `cpl_*.csv` from `pcb/dist/` to have diodes pre-soldered.

### 2. 3D Printing the Case & Plates

- **Printer:** CoreXY FDM (Elegoo Centauri Carbon, Bambu Lab A1/X1/P1, Voron) with ≥ 180×180mm bed.
- **Material:** PETG recommended for mechanical joint flexibility and durability.
- **Settings:** 0.16mm layer height, 4 perimeters/walls, 20% Gyroid infill.
- **Plate Thickness:** 1.2mm for Choc v1, 1.5mm for MX.
- **Magnets:** Press-fit four 6×3mm N52 neodymium disc magnets into the side pockets with a drop of cyanoacrylate (CA glue). **Verify opposite polarities (N facing S) before gluing.**

---

## Sourcing & Bill of Materials

See [docs/bom.md](docs/bom.md) for full sourcing links and vendor alternatives.

- **Controllers:** 2× nice!nano v2 (keyboard halves) + 1× Seeed Studio XIAO BLE nRF52840 (USB dongle).
- **Batteries:** 2× 3.7V 500mAh LiPo pouches with integrated PCM protection circuit.
- **Switches:** 76× Kailh Choc v1 (PG1350) or Cherry MX-compatible switches.
- **Sockets:** 76× Kailh Hotswap sockets (Choc #C5333465 or MX #C2800547).
- **Diodes:** 76× 1N4148W SOD-123 diodes (LCSC #C81598).
- **Hardware:** 8× 6×3mm N52 neodymium disc magnets, 2× MSK-12D19 mini slide switches, 1× Alps Alpine EC11 encoder.

---

## Firmware Flashing & Pairing

### Automatic Cloud Build
1. Fork or push to your GitHub repo.
2. Under **Actions**, download the firmware zip containing `.uf2` files.
3. Put the left controller in bootloader mode (double-tap reset) and copy `interlock_ergo_left-nice_nano_v2-zmk.uf2`.
4. Put the right controller in bootloader mode and copy `interlock_ergo_right-nice_nano_v2-zmk.uf2`.
5. Put the dongle in bootloader mode and copy `interlock_ergo_dongle-seeeduino_xiao_ble-zmk.uf2`.

### Dongle RF Link
The central dongle automatically scans and bonds with both peripherals on first boot. Plug the dongle into any computer, console, or USB port for instant, driverless HID typing.

---

## Verification Tests

Run the built-in matrix and configuration test suite:
```bash
node tests/test_matrix.js
```

Rebuild all 3D STL models:
```bash
node cad/build_models.js
```

Regenerate all KiCad PCBs, Gerbers, and pick-and-place files:
```bash
node pcb/generate_pcb.js
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.
