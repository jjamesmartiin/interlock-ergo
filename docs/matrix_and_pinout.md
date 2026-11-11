# Matrix & Pinout Specifications

Ground truth mapping verified against ZMK's Pro Micro devicetree definitions (`arduino_pro_micro_pins.dtsi`).

---

## Left Half Pinout (Nice!Nano v2 / Pro Micro Footprint)

The left half hosts a 5-row × 6-column matrix. There is no rotary encoder and no
function column: 6 + 8 columns across the two halves match a DZ60 split down the middle (14 columns total), which is what
puts `1`/`Q`/`A`/`Z` on GH60's own x.

### Row GPIOs (Col2Row, Active High / Pull-Down):
- **Row 0:** `&pro_micro 4` -> `P0.22`
- **Row 1:** `&pro_micro 5` -> `P0.24`
- **Row 2:** `&pro_micro 6` -> `P1.00`
- **Row 3:** `&pro_micro 7` -> `P0.11`
- **Row 4:** `&pro_micro 8` -> `P1.04`

### Column GPIOs (Active High Drive):
- **Col 0:** `&pro_micro 18` -> `P1.15` — Esc, Tab, Caps, LShift, LCtrl
- **Col 1:** `&pro_micro 15` -> `P1.13` — 1, Q, A, Z, LGui
- **Col 2:** `&pro_micro 14` -> `P1.11` — 2, W, S, X, LAlt
- **Col 3:** `&pro_micro 16` -> `P0.10` — 3, E, D, C, Space_L
- **Col 4:** `&pro_micro 10` -> `P0.09` — 4, R, F, V (no bottom-row key)
- **Col 5:** `&pro_micro 1`  -> `P0.06` — 5, T, G, B, Fn/Mo(1)

Unused on the left: `&pro_micro 0` (the freed column pin), `21` and `20` (the
encoder's A/B pins). Their pads exist on the PCB with no net.

---

## Right Half Pinout (Nice!Nano v2 / Pro Micro Footprint)

The right half hosts a 5-row × 8-column matrix.

### Row GPIOs:
- **Row 0:** `&pro_micro 4` -> `P0.22`
- **Row 1:** `&pro_micro 5` -> `P0.24`
- **Row 2:** `&pro_micro 6` -> `P1.00`
- **Row 3:** `&pro_micro 7` -> `P0.11`
- **Row 4:** `&pro_micro 8` -> `P1.04`

### Column GPIOs (Col Offset 6 assigned via `&default_transform`):
- **Col 6:**  `&pro_micro 18` -> `P1.15` — **6, Y, H, N, Space_R** (the 6YHN column; all five rows populated)
- **Col 7:**  `&pro_micro 15` -> `P1.13` — 7, U, J, M, RAlt
- **Col 8:**  `&pro_micro 14` -> `P1.11` — 8, I, K, Comma, Mo(1)
- **Col 9:**  `&pro_micro 16` -> `P0.10` — 9, O, L, Dot, RGui
- **Col 10:** `&pro_micro 10` -> `P0.09` — 0, P, Semicolon, Slash, RCtrl
- **Col 11:** `&pro_micro 1`  -> `P0.06` — Minus, [, Quote, RShift, Left Arrow
- **Col 12:** `&pro_micro 0`  -> `P0.08` — Equal, ], Enter, Up Arrow, Down Arrow
- **Col 13:** `&pro_micro 2`  -> `P0.17` — Bksp, Backslash, Delete, Right Arrow (no home-row key)

Unused on the right: `&pro_micro 3` (P0.20). Its pad exists on the PCB with no net.
Notice the inverted-T arrow cluster: Up at Col 12 is directly above Down at Col 12,
flanked by Left at Col 11 (under RShift) and Right at Col 13 (under Delete).

---

## Power & Battery Circuit

- **Battery Input:** 3.7V LiPo with integrated PCM (Protection Circuit Module).
- **Power Switch:** SPDT mini slide switch (MSK-12D19) connected in series between the LiPo positive terminal and the nice!nano's battery input. On the nice!nano that input is the Pro Micro footprint's `RAW` pad, which is the same node as its `B+` pad and its charger; the switch is therefore in the charge path too, so the cell charges only with the switch ON.
- **Battery Negative:** Direct to nice!nano `B-` / `GND`.
- **Battery Polarity:** `J_BAT` pin 1 is BAT+, pin 2 is GND, and both are marked `+`/`-` on the front silk. Check the pack's wiring with a meter before plugging it in - reversed polarity destroys the charger.
- **Battery Fuel Gauge:** nice!nano v2 measures cell voltage directly via internal VDDH (`zmk,battery-nrf-vddh`). No divider, no ADC pin.
- **Cell:** protected LP402030 pack (~200 mAh; a 4 mm cell, but the PCM board makes the pack ~34 mm long and 4.5 mm thick with tape). The bay is sized for that; a 5 mm pouch does not fit.
