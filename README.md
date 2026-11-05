# Interlock Ergo Keyboard

An open-source, wireless split ergonomic keyboard designed to solve the classic split keyboard touch-typing flaw described in [this Reddit r/keyboards post](https://www.reddit.com/r/keyboards/comments/37ez40/help_im_looking_for_a_split_ergonomic_keyboard/):

1. **`6-Y-H-N` Strictly on the Right Half:** Traditional split boards awkwardly bundle the `6` key onto the left hand (`1-2-3-4-5-6`), alienating touch typists who hit `6` with their right index finger. This board places `6`, `Y`, `H`, and `N` cleanly on the right half.
2. **Interlocking Mechanical Case:** Precision dovetail guide tabs and N52 neodymium magnets allow the left and right halves to lock together into a single, rigid 65%+ unibody keyboard for lap typing, train/plane travel, or couch use—then pull apart for shoulder-width ergonomic desk typing.
3. **2.4GHz USB Dongle via ZMK Firmware:** Both halves connect wire-free over low-latency 2.4GHz RF to a miniature USB dongle. The dongle acts as a genuine standard USB HID keyboard: zero Bluetooth pairing friction, works in BIOS/UEFI, and bypasses company IT Bluetooth bans. Also supports instant switching to Bluetooth profiles (`&out OUT_BLE`) for mobile devices.
4. **Rotary Encoder & Macro Column:** Left half features an EC11 rotary encoder (volume / scroll scrubbing / mute click) and a dedicated vertical macro column (M1–M4).

---

## Layout Overview

```
[Enc/Mute] [Esc] [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ]  ||  [ 6 ] [ 7 ] [ 8 ] [ 9 ] [ 0 ] [ - ] [ = ] [Bksp] [Home]
[  M1   ] [Tab  ] [ Q ] [ W ] [ E ] [ R ] [ T ]  ||  [ Y ] [ U ] [ I ] [ O ] [ P ] [ [ ] [ ] ] [  \  ] [End ]
[  M2   ] [Caps  ] [ A ] [ S ] [ D ] [ F ] [ G ]  ||  [ H ] [ J ] [ K ] [ L ] [ ; ] [ ' ] [  Enter  ]
[  M3   ] [Shift   ] [ Z ] [ X ] [ C ] [ V ] [ B ]||  [ N ] [ M ] [ , ] [ . ] [ / ] [Shift] [Up ] [Del] [PgUp]
[  M4   ] [Ctrl][Win][Alt] [ Space (2.25u) ] [Fn1]||  [ Space (2.75u) ] [Alt][Fn2][Ctrl][Left][Down][Right][PgDn]
```

---

## Repository Structure

```
├── .github/workflows/
│   └── build-zmk.yml           # Automated GitHub Actions cloud firmware compilation
├── cad/
│   ├── interlock_case.scad     # Parametric case with magnetic dovetail joint
│   ├── interlock_dock.scad     # 12° angled ergonomic lap/desk docking tray
│   ├── dongle_case.scad        # Snap-fit enclosure for 2.4GHz USB dongle
│   └── README.md               # 3D printing & slicing settings
├── config/
│   ├── boards/shields/interlock_ergo/
│   │   ├── Kconfig.shield      # ZMK shield declarations (Left, Right, Dongle)
│   │   ├── Kconfig.defconfig   # Peripheral vs central dongle roles
│   │   ├── interlock_ergo.dtsi # Unified matrix transform
│   │   ├── interlock_ergo_left.overlay   # Left half matrix & EC11 encoder
│   │   ├── interlock_ergo_right.overlay  # Right half matrix (col-offset 7)
│   │   ├── interlock_ergo_dongle.overlay # Central dongle mock kscan
│   │   ├── interlock_ergo.keymap         # QWERTY, Nav/Fn, and BLE layers
│   │   ├── interlock_ergo.conf           # Power sleep & +8dBm TX power
│   │   └── interlock_ergo_dongle.conf    # USB central receiver config
│   ├── build.yaml              # ZMK build matrix
│   └── west.yml                # West manifest
├── docs/
│   ├── architecture.md         # Design rationale, dongle vs QMK, battery math
│   ├── matrix_and_pinout.md    # Pinout reference and wiring
│   └── kle_layout.json         # Keyboard Layout Editor JSON
└── tests/
    └── test_matrix.js          # Self-test validating matrix, layers, and 6YHN mapping
```

---

## Quick Start: Flashing the Firmware

### Option A: Automatic GitHub Actions Build (Recommended)
1. Fork or push this repository to GitHub.
2. The GitHub Actions workflow (`.github/workflows/build-zmk.yml`) will build firmware for:
   - `nice_nano_v2` (Left Half)
   - `nice_nano_v2` (Right Half)
   - `seeeduino_xiao_ble` or `nice_nano_v2` or `nrf52840dongle` (USB Dongle)
3. Download the firmware artifact zip file.
4. Double-tap reset on each controller to mount its `NICENANO` USB drive, then drag and drop the respective `.uf2` file.

### Option B: Local Docker Build
```bash
# Build Left Half
west build -s app -b nice_nano_v2 -- -DSHIELD=interlock_ergo_left -DZMK_CONFIG="$(pwd)/config"

# Build Right Half
west build -s app -b nice_nano_v2 -- -DSHIELD=interlock_ergo_right -DZMK_CONFIG="$(pwd)/config"

# Build USB Dongle
west build -s app -b seeeduino_xiao_ble -- -DSHIELD=interlock_ergo_dongle -DZMK_CONFIG="$(pwd)/config"
```

---

## Running Verification Tests

Run the built-in matrix and layout validator:
```bash
node tests/test_matrix.js
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.
