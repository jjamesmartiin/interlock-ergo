# Matrix & Pinout Specifications

## Left Half Pinout (Nice!Nano v2 / Pro Micro Footprint)

The left half hosts a 5-row × 7-column matrix plus an EC11 rotary encoder.

### Row GPIOs (Col2Row, Active High / Pull-Down):
- **Row 0:** `P0.17` (`&pro_micro 4`)
- **Row 1:** `P0.20` (`&pro_micro 5`)
- **Row 2:** `P0.22` (`&pro_micro 6`)
- **Row 3:** `P0.24` (`&pro_micro 7`)
- **Row 4:** `P1.00` (`&pro_micro 8`)

### Column GPIOs (Active High Drive):
- **Col 0:** `P0.31` (`&pro_micro 18`) — Macro column (Encoder Click / M1, M2, M3, M4, M5)
- **Col 1:** `P1.13` (`&pro_micro 15`) — Esc, Tab, Caps, LShift, LCtrl
- **Col 2:** `P1.11` (`&pro_micro 14`) — 1, Q, A, Z, LGui
- **Col 3:** `P0.10` (`&pro_micro 16`) — 2, W, S, X, LAlt
- **Col 4:** `P0.09` (`&pro_micro 10`) — 3, E, D, C, Space_L
- **Col 5:** `P0.02` (`&pro_micro 1`)  — 4, R, F, V
- **Col 6:** `P1.15` (`&pro_micro 0`)  — 5, T, G, B, Fn/Mo(1)

### Rotary Encoder Pins:
- **Pin A (Channel A):** `P0.29` (`&pro_micro 21`) (Pull-up)
- **Pin B (Channel B):** `P0.02` / `P0.26` (`&pro_micro 20`) (Pull-up)
- **Common Pin (C):** `GND`
- **Push Button:** Wired to Row 0, Column 0 in the switch matrix.

---

## Right Half Pinout (Nice!Nano v2 / Pro Micro Footprint)

The right half hosts a 5-row × 9-column matrix.

### Row GPIOs:
- **Row 0:** `P0.17` (`&pro_micro 4`)
- **Row 1:** `P0.20` (`&pro_micro 5`)
- **Row 2:** `P0.22` (`&pro_micro 6`)
- **Row 3:** `P0.24` (`&pro_micro 7`)
- **Row 4:** `P1.00` (`&pro_micro 8`)

### Column GPIOs (Col Offset 7):
- **Col 7:**  `P0.31` (`&pro_micro 18`) — **6, Y, H, N, Space_R**
- **Col 8:**  `P1.13` (`&pro_micro 15`) — 7, U, J, M, RAlt
- **Col 9:**  `P1.11` (`&pro_micro 14`) — 8, I, K, Comma, Mo(2)
- **Col 10:** `P0.10` (`&pro_micro 16`) — 9, O, L, Dot, RCtrl
- **Col 11:** `P0.09` (`&pro_micro 10`) — 0, P, Semicolon, Slash, Left Arrow
- **Col 12:** `P0.02` (`&pro_micro 1`)  — Minus, [, Quote, RShift, Down Arrow
- **Col 13:** `P1.15` (`&pro_micro 0`)  — Equal, ], Enter, Up Arrow, Right Arrow
- **Col 14:** `P0.06` (`&pro_micro 2`)  — Backspace, Backslash, Delete
- **Col 15:** `P0.08` (`&pro_micro 3`)  — Page Up, Page Down

---

## USB Dongle Wiring

The USB dongle requires no key matrix:
1. Connect nRF52840 (e.g. Seeed XIAO BLE) to USB.
2. (Optional) Single tact switch between `RST` and `GND` for double-tap UF2 bootloader entry.
3. Flash with `interlock_ergo_dongle` firmware.
