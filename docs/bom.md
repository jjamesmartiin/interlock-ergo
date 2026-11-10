# Interlock Ergo — Complete Bill of Materials (BOM) & Sourcing Directory

This directory provides verified sourcing links, Manufacturer Part Numbers (MPN), LCSC part numbers (for JLCPCB SMT), quantities, and price estimates for both the **Kailh Choc v1** and **Cherry MX** builds.

---

## 1. Electronics & Microcontrollers

| Item | Description & Spec | Qty | MPN / Part # | Primary Source Link | Alternative Source | Est. Unit Cost |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: |
| **Keyboard Controllers** | nice!nano v2 (nRF52840, BLE, LiPo charger) | 2 | nice!nano v2 | [Typeractive](https://typeractive.xyz/products/nice-nano) | [Boardsource](https://boardsource.xyz/store/5f4aae93b2a59a72785187ff) / [AliExpress SuperMini](https://www.aliexpress.com/item/1005005889754885.html) | $15.00 – $25.00 |
| **USB Dongle MCU** | Seeed Studio XIAO BLE (nRF52840, USB-C) | 1 | 102010448 | [Seeed Studio](https://www.seeedstudio.com/Seeed-XIAO-BLE-nRF52840-p-5201.html) | [Mouser](https://www.mouser.com/ProductDetail/Seeed-Studio/102010448?qs=GBLSl2AkirvS17WpU00wKw%3D%3D) / [DigiKey](https://www.digikey.com/en/products/detail/seeed-technology-co-ltd/102010448/16652880) | $9.90 |
| **Alternative Dongle** | Nordic nRF52840 USB-A Dongle — firmware target only, the printed enclosure fits the XIAO | 1 | nRF52840-Dongle (PCA10059) | [Mouser](https://www.mouser.com/ProductDetail/Nordic-Semiconductor/nRF52840-Dongle?qs=gZXFycFWdANX6k4nLp0c1Q%3D%3D) | [DigiKey](https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NRF52840-DONGLE/9491124) | $12.50 |
| **LiPo Batteries** | 3.7V protected pouch **LP402030 (4 x 20 x 30 mm cell)**, **200mAh**, with PCM | 2 | 402030 + PCM | [Adafruit protected LiPo](https://www.adafruit.com/category/574) | [PKCELL 402030](https://www.amazon.com/s?k=402030+lipo+protected) | $4.00 – $7.00 |
| **Cell fit note** | The PCM board on a protected 402030 adds ~3.2 mm, so the pack is ~34 mm long and 4.5 mm thick with tape. The bay is sized for that. A 5 mm 503040 does **not** fit this case - see docs/assembly.md | - | - | - | - | - |
| **Battery Connectors** | JST-PH 2.0mm 2-pin Right-Angle Header | 2 | S2B-PH-K-S | [DigiKey](https://www.digikey.com/en/products/detail/jst-sales-america-inc/S2B-PH-K-S/926626) | [LCSC C145955](https://www.lcsc.com/product-detail/JST_S2B-PH-K-S_C145955.html) | $0.20 |
| **Controller Headers** | 2.54mm 1x12 female header, to socket the nice!nano (or castellated-solder it and skip these) | 4 | Generic 1x12 | [DigiKey](https://www.digikey.com/en/products/detail/amphenol-icc-fci/68000-112HLF/863830) | [LCSC C2908565](https://www.lcsc.com/product-detail/Female-Headers_Connfly-DS1021-1x12S21_C2908565.html) | $0.30 |
| **Power Slide Switches** | SPDT Mini Slide Switch (MSK-12D19) | 2 | MSK-12D19 / SK-12D19 | [LCSC C432174](https://www.lcsc.com/product-detail/Slide-Switches_XKB-Enterprise-SK-12D19-G5-B_C432174.html) | [Typeractive](https://typeractive.xyz/products/spdt-switch) | $0.15 |
| **Rotary Encoder** | Alps Alpine EC11 with Push Switch (15mm D-Shaft) | 1 | EC11E15244G1 | [Keebio](https://keeb.io/products/rotary-encoder-ec11) | [Mouser](https://www.mouser.com/ProductDetail/Alps-Alpine/EC11E15244G1?qs=6EGMNY9ZYDRmB7Qc4L%2FkXw%3D%3D) | $2.50 |
| **Diodes (SMD)** | 1N4148W Switching Diode (SOD-123) | 76 | 1N4148W | [LCSC C81598](https://www.lcsc.com/product-detail/Diodes-General-Purpose_JCST-1N4148W_C81598.html) | [DigiKey](https://www.digikey.com/en/products/detail/diodes-incorporated/1N4148W-7-F/376281) | $0.02 |

---

## 2. Variant A: Kailh Choc v1 Low-Profile Sourcing

| Item | Description & Spec | Qty | MPN / Part # | Primary Source Link | Alternative Source | Est. Total |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: |
| **Choc Sockets** | Kailh Choc v1 2-prong Hotswap Sockets | 76 | CPG135001S30 | [LCSC C5333465](https://www.lcsc.com/product-detail/Others_Kailh-CPG135001S30_C5333465.html) | [Typeractive Choc Sockets](https://typeractive.xyz/products/kailh-choc-hotswap-sockets) | $12.00 |
| **Choc Switches** | Kailh Choc v1 Switches (Red Linear 50gf or Pro Red 35gf) | 80 | PG1350 | [Boardsource](https://boardsource.xyz/store/5e6bca927c9c053a479ff4b5) | [Chosfox](https://chosfox.com/products/kailh-choc-v1-switches) / [MKUltra](https://mkultra.click/kailh-choc-switches/) | $48.00 |
| **Choc Keycaps** | MBK Choc PBT Keycap Set + Convex Thumbs | 1 set | MBK Choc | [Typeractive MBK Legend](https://typeractive.xyz/products/mbk-legend-keycaps) | [Boardsource MBK](https://boardsource.xyz/store/5f6cd6a73d9e035048d06748) | $35.00 – $50.00 |
| **PCB Fab** | JLCPCB 2-Layer FR4 - order **left 3 pcs, right 2 pcs** (see 6. below) | 1 pair | Custom | [JLCPCB](https://jlcpcb.com/) | Upload `pcb/dist/*_choc_gerbers.zip` | $18.00 |
| **SMT assembly (optional)** | `pcb/dist/cpl_*_choc.csv` + `bom_*_choc.csv` cover the diodes and all hotswap sockets, bottom side; three 1 mm fiducials are on the board for placement. The controller, switch, encoder and battery jack are through-hole and stay hand-soldered. **Check the socket rotation in JLCPCB's placement preview before paying** - the pads are asymmetric, and a rotated socket is a rework job | 1 | - | [JLCPCB](https://jlcpcb.com/) | - | quote |
| **Switch Plate** | 3D Printed PETG (1.2mm) or JLCPCB FR4 Plate | 1 pair | Custom | 3D Print (`cad/dist/interlock_plate_choc_*.stl`) | JLCPCB FR4 1.2mm | $3.00 – $6.00 |

---

## 3. Variant B: Cherry MX Standard Profile Sourcing

| Item | Description & Spec | Qty | MPN / Part # | Primary Source Link | Alternative Source | Est. Total |
| :--- | :--- | :---: | :--- | :--- | :--- | :---: |
| **MX Sockets** | Kailh MX Hotswap Sockets | 76 | CPG151101S11 | [LCSC C2800547](https://www.lcsc.com/product-detail/Others_Kailh-CPG151101S11_C2800547.html) | [NovelKeys](https://novelkeys.com/products/kailh-pcb-sockets) | $10.00 |
| **MX Switches** | Gateron Milky Yellow / Kailh Box / Cherry MX | 80 | MX Style | [NovelKeys](https://novelkeys.com/products/gateron-milky-yellow-switches) | [Divinikey](https://divinikey.com/products/gateron-milky-yellow-pro-linear-switches) | $24.00 – $40.00 |
| **MX Keycaps** | 65% PBT Cherry/OEM Keycap Set with Split Space | 1 set | MX Stem | [Amazon PBT 65% Split](https://www.amazon.com/dp/B09V7CQ22Q) | [Drop Skylight](https://drop.com/buy/drop-skylight-series-keycap-set) | $25.00 – $45.00 |
| **PCB Fab** | JLCPCB 2-Layer FR4 - order **2 pcs of each half** (see 6. below) | 1 pair | Custom | [JLCPCB](https://jlcpcb.com/) | Upload `pcb/dist/*_mx_gerbers.zip` | $18.00 |
| **SMT assembly (optional)** | `pcb/dist/cpl_*_mx.csv` + `bom_*_mx.csv` cover the diodes and all hotswap sockets, bottom side; three 1 mm fiducials are on the board for placement. The controller, switch, encoder and battery jack are through-hole and stay hand-soldered. **Check the socket rotation in JLCPCB's placement preview before paying** - the pads are asymmetric, and a rotated socket is a rework job | 1 | - | [JLCPCB](https://jlcpcb.com/) | - | quote |
| **Switch Plate** | 3D Printed PETG (1.5mm) or JLCPCB FR4 Plate | 1 pair | Custom | 3D Print (`cad/dist/interlock_plate_mx_*.stl`) | JLCPCB FR4 1.5mm | $3.00 – $6.00 |

---

## 4. Mechanical Hardware & Finishing

| Item | Description | Qty | Sourcing Link | Est. Total |
| :--- | :--- | :---: | :--- | :---: |
| **Interlock Magnets** | 6mm diameter × 3mm thick Neodymium N52 Discs (two per seam) | 4 | [Amazon 6x3mm N52 Discs](https://www.amazon.com/dp/B093L3XQ9N) / [K&J Magnetics D42](https://www.kjmagnetics.com/proddetail.asp?prod=D42) | $4.50 |
| **Rubber Bumper Feet** | 3M Bumpon Hemispherical Silicone Feet (Ø8mm × 2mm) | 8 | [Amazon 3M Clear Feet](https://www.amazon.com/dp/B06XCLYL53) | $3.00 |
| **Adhesive** | Loctite Gel Control Cyanoacrylate (Super Glue) | 1 | Local Hardware / Amazon | $4.00 |
| **Filament** | eSun / Bambu / Polymaker PETG (1kg spool) | 0.5 spool | [Amazon eSun PETG Black](https://www.amazon.com/dp/B07PGZ9B5N) | ~$12.00 |

---

## 5. Fasteners

| Item | Description | Qty | Sourcing Link | Est. Total |
| :--- | :--- | :---: | :--- | :---: |
| **PCB screws** | M2 x 5 self-tapping, pan head (four per half, into the printed bosses) | 8 | Amazon / local hardware | $1.50 |
| **Cell insulation** | 0.5mm fishpaper or a printed shim between the cell and the PCB | 2 | Amazon | $2.00 |

---

## 6. Cost Summary & Budget Optimization

- **Prototype DIY Build (Hand-Soldered SMT, 3D-Printed Case/Plates):**
  - Choc v1 Variant: **~$165.00**
  - Cherry MX Variant: **~$145.00**
- **Batch Surcharge Dodge:**
  - Standard JLCPCB orders of 5 boards trigger an area threshold penalty ($57.46 surcharge).
  - The 650 cm² budget is per order, so the right quantity differs per board: **left Choc 3 pcs, right Choc 2, left MX 2, right MX 2**. Re-check on the live quote - `node tests/test_fab_rules.js` prints the current numbers.
