# Matrix & Pinout Specifications

Ground truth mapping verified against ZMK's Pro Micro devicetree definitions (`arduino_pro_micro_pins.dtsi`).

---

## Left Half Pinout (Nice!Nano v2 / Pro Micro Footprint)

The left half hosts a 5-row × 7-column matrix plus an EC11 rotary encoder.

### Row GPIOs (Col2Row, Active High / Pull-Down):
- **Row 0:** `&pro_micro 4` -> `P0.22`
- **Row 1:** `&pro_micro 5` -> `P0.24`
- **Row 2:** `&pro_micro 6` -> `P1.00`
- **Row 3:** `&pro_micro 7` -> `P0.11`
- **Row 4:** `&pro_micro 8` -> `P1.04`

### Column GPIOs (Active High Drive):
- **Col 0:** `&pro_micro 18` -> `P1.15` — Encoder push (row 0, `RC(0,0)`), then Mute / Play / PrtSc / Calc / Fn2 down the column. The encoder push switch and the row-0 key share one matrix position, so the PCB emits a series diode for it and no switch socket.
- **Col 1:** `&pro_micro 15` -> `P1.13` — Esc, Tab, Caps, LShift, LCtrl
- **Col 2:** `&pro_micro 14` -> `P1.11` — 1, Q, A, Z, LGui
- **Col 3:** `&pro_micro 16` -> `P0.10` — 2, W, S, X, LAlt
- **Col 4:** `&pro_micro 10` -> `P0.09` — 3, E, D, C, Space_L
- **Col 5:** `&pro_micro 1`  -> `P0.06` — 4, R, F, V
- **Col 6:** `&pro_micro 0`  -> `P0.08` — 5, T, G, B, Fn/Mo(1)

### Rotary Encoder Pins:
- **Pin A (Channel A):** `&pro_micro 21` -> `P0.31` (Internal pull-up)
- **Pin B (Channel B):** `&pro_micro 20` -> `P0.29` (Internal pull-up)
- **Common Pin (C):** `GND`
- **Push Button:** Wired to Row 0, Column 0 in the switch matrix.

---

## Right Half Pinout (Nice!Nano v2 / Pro Micro Footprint)

The right half hosts a 5-row × 9-column matrix.

### Row GPIOs:
- **Row 0:** `&pro_micro 4` -> `P0.22`
- **Row 1:** `&pro_micro 5` -> `P0.24`
- **Row 2:** `&pro_micro 6` -> `P1.00`
- **Row 3:** `&pro_micro 7` -> `P0.11`
- **Row 4:** `&pro_micro 8` -> `P1.04`

### Column GPIOs (Col Offset 7 assigned via `&default_transform`):
- **Col 7:**  `&pro_micro 18` -> `P1.15` — **6, Y, N, Space_R** (no home-row key: the home row ends at Enter)
- **Col 8:**  `&pro_micro 15` -> `P1.13` — 7, U, J, M, RAlt
- **Col 9:**  `&pro_micro 14` -> `P1.11` — 8, I, K, Comma, Mo(2)
- **Col 10:** `&pro_micro 16` -> `P0.10` — 9, O, L, Dot, RCtrl
- **Col 11:** `&pro_micro 10` -> `P0.09` — 0, P, Semicolon, Slash, Left Arrow
- **Col 12:** `&pro_micro 1`  -> `P0.06` — Minus, [, Quote, RShift, Down Arrow
- **Col 13:** `&pro_micro 0`  -> `P0.08` — Equal, ], Enter, Up Arrow, Right Arrow
- **Col 14:** `&pro_micro 2`  -> `P0.17` — Bksp, Backslash, Delete, PgDn (no home-row key)
- **Col 15:** `&pro_micro 3`  -> `P0.20` — Home, End, PgUp (no home-row or bottom-row key)

---

## Power & Battery Circuit

- **Battery Input:** 3.7V LiPo with integrated PCM (Protection Circuit Module).
- **Power Switch:** SPDT mini slide switch (MSK-12D19) connected in series between LiPo positive terminal and nice!nano `B+` pad.
- **Battery Negative:** Direct to nice!nano `B-` / `GND`.
- **Battery Fuel Gauge:** nice!nano v2 measures cell voltage directly via internal VDDH (`zmk,battery-nrf-vddh`). No divider, no ADC pin.
- **Cell:** protected LP402030 pack (~200 mAh; a 4 mm cell, but the PCM board makes the pack ~34 mm long and 4.5 mm thick with tape). The bay is sized for that; a 5 mm pouch does not fit.
