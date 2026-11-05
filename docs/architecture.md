# System Architecture & Design Rationale

## 1. The "6 Key on the Right" Problem

In touch-typing methodology, the number row is allocated to fingers symmetrically:
- **Left Index Finger:** `4`, `5` (and columns `R-T`, `F-G`, `V-B`)
- **Right Index Finger:** `6`, `7` (and columns `Y-U`, `H-J`, `N-M`)

However, on classic commercial split keyboards (e.g., Microsoft Natural 4000, Microsoft Sculpt, Ergodox, Alice clones), manufacturers frequently place the `6` key on the **left half** (`1-2-3-4-5-6`), leaving only `7-8-9-0` on the right. For touch typists trained to hit `6` with the right hand, this leads to relentless mis-types and wrist strain.

As highlighted in the [Reddit r/keyboards inquiry](https://www.reddit.com/r/keyboards/comments/37ez40/help_im_looking_for_a_split_ergonomic_keyboard/), budget split keyboards almost uniformly place `6` on the left, while split keyboards offering `6` on the right have historically been boutique or exorbitantly expensive ($250+).

**Interlock Ergo** resolves this by placing `6`, `Y`, `H`, and `N` strictly on the right half.

---

## 2. Firmware Choice: ZMK vs. QMK for 2.4GHz Wireless

| Feature | ZMK (Zephyr RTOS) | QMK Firmware |
| :--- | :--- | :--- |
| **Native Wireless Architecture** | Built from inception for BLE & low-power nRF52840 | Primarily wired; wireless is experimental / third-party |
| **2.4GHz USB Dongle Mode** | Native (`ZMK_SPLIT_BLE_ROLE_CENTRAL` + 2 peripherals) | Requires complex custom bridging |
| **Battery Life (500mAh LiPo)** | 3 to 6 months per charge with deep sleep | Hours to a few days |
| **Plug-and-Play HID (BIOS/UEFI)** | Dongle acts as genuine USB HID keyboard | Wired only |
| **Multi-Host Switching** | Switch between 2.4GHz Dongle, BT 0, BT 1, BT 2 | Limited |

### Why the 2.4GHz USB Dongle is the Best Setup:
1. **Universal Versatility:** Plugs into any USB-A or USB-C port (Linux, Windows, macOS, Android, Steam Deck, BIOS/UEFI setup screens).
2. **Bypasses IT Bluetooth Restrictions:** Operates as a standard wired USB HID keyboard to the host OS—no Bluetooth pairing or driver installation required on locked-down company laptops.
3. **Completely Wire-Free Typing:** Both halves are battery-powered and communicate wirelessly to the tiny USB dongle. No TRRS cable between halves to get tangled or short out.
4. **Dual Output Mode:** When traveling without the dongle, toggle `&out OUT_BLE` to pair directly with phones, iPads, or laptops via Bluetooth LE.

---

## 3. Interlocking Mechanical System

A major drawback of split keyboards is that they cannot be used on a lap, on a train, in bed, or on small airline tray tables without sliding around.

**Interlock Ergo** solves this with a 2-in-1 hybrid design:
- **Separated Mode (Desk):** The left and right halves sit apart at shoulder width and custom splay angles for optimal posture.
- **Docked Mode (Lap / Travel):** The two halves slide together along the staggered seam (`5-T-G-B` on left, `6-Y-H-N` on right). Embedded N52 neodymium magnets and precision dovetail tabs lock them into a rigid unibody 65%+ keyboard that can be picked up with one hand.
- **Angled Tray Mode (Optional):** Drop both halves into the 3D-printed dock to lock them at a fixed 12° ergonomic angle with integrated tenting.

---

## 4. Hardware Bill of Materials (BOM)

- **Controllers (2x):** Nice!nano v2 (or SuperMini nRF52840) for keyboard halves.
- **Dongle Controller (1x):** Seeed Studio XIAO BLE (nRF52840) or Nordic nRF52840 Dongle (PCA10059) or Nice!nano v2.
- **Batteries (2x):** 3.7V 500mAh - 800mAh LiPo (dimensions ~30mm x 40mm x 5mm, e.g. 503040).
- **Power Switches (2x):** MSK-12D19 mini slide switches (SPDT).
- **Rotary Encoder (1x):** EC11 rotary encoder with integrated push button (7mm or 15mm D-shaft).
- **Key Switches (67x - 76x):** Kailh Choc v1 low profile OR Cherry MX / Gateron style switches.
- **Diodes (76x):** 1N4148 / 1N4148W switching diodes (SOD-123 or through-hole).
- **Magnets (4x):** 6mm diameter × 3mm thick Neodymium N52 disc magnets.
