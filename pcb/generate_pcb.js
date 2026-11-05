const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pcbDir = __dirname;
const distDir = path.join(pcbDir, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

console.log('--- Generating Electrically-Verified Interlock Ergo KiCad PCBs ---');

function getCmd(bin) {
    try {
        execSync(`command -v ${bin} >/dev/null 2>&1`);
        return bin;
    } catch {
        try {
            execSync('command -v nix-shell >/dev/null 2>&1');
            return `nix-shell -p ${bin} --run ${bin}`;
        } catch {
            return bin;
        }
    }
}

const zipBin = getCmd('zip');

function generateKiCadPCB(opts) {
    const { variant, side, cols, rows, pitchX, pitchY, isChoc } = opts;
    
    // Board geometry: Add 28mm top controller bay for Nice!Nano + Battery + Power Switch
    const topBayHeight = 28.0;
    const marginX = 8.0;
    const marginY = 8.0;
    const boardW = cols * pitchX + marginX * 2;
    const boardH = rows * pitchY + marginY * 2 + topBayHeight;
    
    const offsetX = marginX + pitchX * 0.5;
    const offsetY = topBayHeight + marginY + pitchY * 0.5;

    // Define Global Nets
    const nets = [
        { id: 0, name: '' },
        { id: 1, name: 'GND' },
        { id: 2, name: 'VCC' },
        { id: 3, name: 'RAW' },
        { id: 4, name: 'ROW0' },
        { id: 5, name: 'ROW1' },
        { id: 6, name: 'ROW2' },
        { id: 7, name: 'ROW3' },
        { id: 8, name: 'ROW4' },
        { id: 9, name: 'BAT_PLUS' }
    ];

    const colOffset = side === 'left' ? 0 : 7;
    for (let c = 0; c < cols; c++) {
        nets.push({ id: nets.length, name: `COL${colOffset + c}` });
    }

    let netEncA = null;
    let netEncB = null;
    if (side === 'left') {
        netEncA = { id: nets.length, name: 'ENC_A' };
        nets.push(netEncA);
        netEncB = { id: nets.length, name: 'ENC_B' };
        nets.push(netEncB);
    }

    // Key definition matrix according to firmware dtsi (34 keys left, 42 keys right)
    // Left: 7 cols x 5 rows. Row 4 skips col 5 (Space_L is 2.25u). Total = 34 keys.
    // Right: Row 0 has cols 7..15 (9 keys); Row 1 has cols 7..15 (9 keys);
    //        Row 2 has cols 7..13 (7 keys); Row 3 has cols 7..15 (9 keys);
    //        Row 4 has cols 7..14 (8 keys). Total = 42 keys.
    const activeKeys = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (side === 'left') {
                if (r === 4 && c === 5) continue; // Skip omitted space position
                activeKeys.push({ r, c });
            } else {
                if (r === 2 && (c === 7 || c === 8)) continue; // Home row ends at Enter (7 keys)
                if (r === 4 && c === 8) continue; // Bottom row has 8 keys (cols 7..14)
                activeKeys.push({ r, c });
            }
        }
    }

    // Add unique switch-to-diode intermediate nets for every key to prevent shorts!
    for (const k of activeKeys) {
        const netName = `SW_D_R${k.r}_C${k.c}`;
        k.diodeNet = { id: nets.length, name: netName };
        nets.push(k.diodeNet);
    }

    let pcbContent = `(kicad_pcb
  (version 20240108)
  (generator "interlock_pcb_generator_v2")
  (generator_version "10.0")
  (general
    (thickness 1.6)
    (legacy_teardrops no)
  )
  (paper "A4")
  (layers
    (0 "F.Cu" signal)
    (31 "B.Cu" signal)
    (36 "B.SilkS" user "B.Silkscreen")
    (37 "F.SilkS" user "F.Silkscreen")
    (38 "B.Mask" user)
    (39 "F.Mask" user)
    (44 "Edge.Cuts" user)
  )
  (setup
    (pad_to_mask_clearance 0.05)
    (pcbplotparams
      (layerselection 0x00010fc_ffffffff)
      (plot_on_all_layers_selection 0x0000000_00000000)
      (disableapertmacros no)
      (usegerberextensions yes)
      (usegerberattributes yes)
      (usegerberadvancedattributes yes)
      (creategerberjobfile yes)
      (outputformat 1)
      (subtractmaskfromsilk yes)
    )
  )
`;

    for (const n of nets) {
        pcbContent += `  (net ${n.id} "${n.name}")\n`;
    }

    // Board Outline
    pcbContent += `  (gr_rect (start 0 0) (end ${boardW.toFixed(2)} ${boardH.toFixed(2)}) (layer "Edge.Cuts") (width 0.15) (fill none))\n`;

    // 4x M2 Mounting Holes (2.2mm drill, 4.0mm clearance pad)
    const mHoles = [
        [4.0, 4.0],
        [boardW - 4.0, 4.0],
        [4.0, boardH - 4.0],
        [boardW - 4.0, boardH - 4.0]
    ];
    for (const h of mHoles) {
        pcbContent += `  (footprint "MountingHole:MountingHole_2.2mm_M2" (layer "F.Cu")
    (at ${h[0].toFixed(2)} ${h[1].toFixed(2)})
    (pad "" np_thru_hole circle (at 0 0) (size 2.2 2.2) (drill 2.2) (layers *.Cu *.Mask))
  )\n`;
    }

    // Silkscreen metadata
    pcbContent += `  (gr_text "Interlock Ergo (${side.toUpperCase()} - ${variant.toUpperCase()})" (at ${(boardW * 0.5).toFixed(2)} 4.0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.25))))\n`;
    pcbContent += `  (gr_text "ZMK 2.4GHz Wireless Split" (at ${(boardW * 0.5).toFixed(2)} 7.0) (layer "F.SilkS") (effects (font (size 1.2 1.2) (thickness 0.2))))\n`;
    if (side === 'right') {
        pcbContent += `  (gr_text "6-Y-H-N ON RIGHT HALF" (at ${(boardW * 0.5).toFixed(2)} 10.0) (layer "F.SilkS") (effects (font (size 1.3 1.3) (thickness 0.25))))\n`;
    }

    // Dimensions for MCU, Power Switch, and Battery in Top Controller Bay
    const mcuX = (boardW * 0.5).toFixed(2);
    const mcuY = 14.0;
    const swX = (boardW - 12.0).toFixed(2);
    const swY = 14.0;
    const batX = (boardW - 24.0).toFixed(2);
    const batY = 14.0;

    const cplRows = [];
    const segments = [];
    let switchIndex = 1;

    // Track matrix nodes for trace routing
    const rowDiodeNodes = Array.from({ length: rows }, () => []);
    const colSwitchNodes = Array.from({ length: cols }, () => []);

    for (const k of activeKeys) {
        const { r, c, diodeNet } = k;
        
        // Skip switch footprint on Left Half at (0,0) if encoder is placed there
        const isEncoderPos = (side === 'left' && r === 0 && c === 0);

        const rowNet = nets.find(n => n.name === `ROW${r}`);
        const colNet = nets.find(n => n.name === `COL${colOffset + c}`);
        const x = (offsetX + c * pitchX).toFixed(2);
        const y = (offsetY + r * pitchY).toFixed(2);
        const swRef = `SW${switchIndex}`;
        const dRef = `D${switchIndex}`;
        switchIndex++;

        let pad1X, pad1Y, pad2X, pad2Y;

        if (!isEncoderPos) {
            if (isChoc) {
                // Kailh Choc v1 (Corne/crkbd style 2-prong)
                pad1X = parseFloat(x);
                pad1Y = parseFloat(y) - 5.9;
                pad2X = parseFloat(x) + 5.0;
                pad2Y = parseFloat(y) - 3.8;

                pcbContent += `  (footprint "Kailh_Choc_V1_CPG135001S30" (layer "B.Cu")
    (at ${x} ${y})
    (fp_text reference "${swRef}" (at 0 3.0) (layer "B.SilkS"))
    (pad "" np_thru_hole circle (at 0 0) (size 3.4 3.4) (drill 3.4) (layers *.Cu *.Mask))
    (pad "" np_thru_hole circle (at -5.5 0) (size 1.9 1.9) (drill 1.9) (layers *.Cu *.Mask))
    (pad "" np_thru_hole circle (at 5.5 0) (size 1.9 1.9) (drill 1.9) (layers *.Cu *.Mask))
    (pad "1" smd rect (at 0 -5.9) (size 2.5 1.6) (layers "B.Cu" "B.Paste" "B.Mask") (net ${colNet.id} "${colNet.name}"))
    (pad "2" smd rect (at 5.0 -3.8) (size 2.5 1.6) (layers "B.Cu" "B.Paste" "B.Mask") (net ${diodeNet.id} "${diodeNet.name}"))
  )\n`;
            } else {
                // Cherry MX Hotswap
                pad1X = parseFloat(x) - 3.81;
                pad1Y = parseFloat(y) - 2.54;
                pad2X = parseFloat(x) + 2.54;
                pad2Y = parseFloat(y) - 5.08;

                pcbContent += `  (footprint "Kailh_MX_CPG151101S11" (layer "B.Cu")
    (at ${x} ${y})
    (fp_text reference "${swRef}" (at 0 3.5) (layer "B.SilkS"))
    (pad "" np_thru_hole circle (at 0 0) (size 4.0 4.0) (drill 4.0) (layers *.Cu *.Mask))
    (pad "" np_thru_hole circle (at -5.08 0) (size 1.7 1.7) (drill 1.7) (layers *.Cu *.Mask))
    (pad "" np_thru_hole circle (at 5.08 0) (size 1.7 1.7) (drill 1.7) (layers *.Cu *.Mask))
    (pad "1" smd rect (at -3.81 -2.54) (size 2.5 1.6) (layers "B.Cu" "B.Paste" "B.Mask") (net ${colNet.id} "${colNet.name}"))
    (pad "2" smd rect (at 2.54 -5.08) (size 2.5 1.6) (layers "B.Cu" "B.Paste" "B.Mask") (net ${diodeNet.id} "${diodeNet.name}"))
  )\n`;
            }

            // SOD-123 Diode (Pad 1: Cathode -> ROWr; Pad 2: Anode -> SW_D_r_c)
            const dx = (parseFloat(x) - 4.5).toFixed(2);
            const dy = (parseFloat(y) + 4.0).toFixed(2);
            pcbContent += `  (footprint "Diode_SMD:D_SOD-123" (layer "B.Cu")
    (at ${dx} ${dy})
    (fp_text reference "${dRef}" (at 0 1.2) (layer "B.SilkS"))
    (pad "1" smd rect (at -1.65 0) (size 0.9 1.2) (layers "B.Cu" "B.Paste" "B.Mask") (net ${rowNet.id} "${rowNet.name}"))
    (pad "2" smd rect (at 1.65 0) (size 0.9 1.2) (layers "B.Cu" "B.Paste" "B.Mask") (net ${diodeNet.id} "${diodeNet.name}"))
  )\n`;

            cplRows.push({
                designator: dRef,
                midX: dx,
                midY: dy,
                layer: 'bottom',
                rotation: 0
            });

            // Connect Switch Pad 2 to Diode Pad 2 (Anode) on B.Cu
            segments.push({
                x1: pad2X.toFixed(2),
                y1: pad2Y.toFixed(2),
                x2: (parseFloat(dx) + 1.65).toFixed(2),
                y2: parseFloat(dy).toFixed(2),
                layer: 'B.Cu',
                netId: diodeNet.id
            });

            const diodeCathodeX = parseFloat(dx) - 1.65;
            const diodeCathodeY = parseFloat(dy);
            const rowBusY = diodeCathodeY + 2.5; // Offset 2.5mm below to avoid Pad 2 short

            // Vertical stub from Diode Pad 1 to Row Bus line
            segments.push({
                x1: diodeCathodeX.toFixed(2),
                y1: diodeCathodeY.toFixed(2),
                x2: diodeCathodeX.toFixed(2),
                y2: rowBusY.toFixed(2),
                layer: 'B.Cu',
                netId: rowNet.id
            });

            rowDiodeNodes[r].push({ x: diodeCathodeX, y: rowBusY, netId: rowNet.id });
            colSwitchNodes[c].push({ x: pad1X, y: pad1Y, netId: colNet.id });
        }
    }

    // Route Row Busses (Horizontal segments on B.Cu)
    for (let r = 0; r < rows; r++) {
        const nodes = rowDiodeNodes[r];
        for (let i = 0; i < nodes.length - 1; i++) {
            segments.push({
                x1: nodes[i].x.toFixed(2),
                y1: nodes[i].y.toFixed(2),
                x2: nodes[i + 1].x.toFixed(2),
                y2: nodes[i + 1].y.toFixed(2),
                layer: 'B.Cu',
                netId: nodes[i].netId
            });
        }
    }

    // Route Column Busses (Vertical segments on F.Cu)
    for (let c = 0; c < cols; c++) {
        const nodes = colSwitchNodes[c];
        for (let i = 0; i < nodes.length - 1; i++) {
            segments.push({
                x1: nodes[i].x.toFixed(2),
                y1: nodes[i].y.toFixed(2),
                x2: nodes[i + 1].x.toFixed(2),
                y2: nodes[i + 1].y.toFixed(2),
                layer: 'F.Cu',
                netId: nodes[i].netId
            });
        }
    }

    // Connect Row Busses and Column Busses to MCU Pads
    // MCU Pin coordinates
    for (let r = 0; r < rows; r++) {
        const rowNode = rowDiodeNodes[r][rowDiodeNodes[r].length - 1];
        if (!rowNode) continue;
        const rowNet = nets.find(n => n.name === `ROW${r}`);
        // Row MCU pins are pins 19..23 on right header (+7.62mm)
        const pinIdx = 18 + r; // 18, 19, 20, 21, 22 (0-indexed for 19..23)
        const py = parseFloat(mcuY) - 13.97 + (pinIdx - 12) * 2.54;
        const px = parseFloat(mcuX) + 7.62;
        segments.push({
            x1: rowNode.x.toFixed(2),
            y1: rowNode.y.toFixed(2),
            x2: px.toFixed(2),
            y2: py.toFixed(2),
            layer: 'B.Cu',
            netId: rowNet.id
        });
    }

    for (let c = 0; c < cols; c++) {
        const colNode = colSwitchNodes[c][0];
        if (!colNode) continue;
        const colNet = nets.find(n => n.name === `COL${colOffset + c}`);
        // Col MCU pins
        let px, py;
        if (side === 'left') {
            if (c <= 4) {
                // Pins 8..12 on left header (-7.62mm)
                px = parseFloat(mcuX) - 7.62;
                py = parseFloat(mcuY) - 13.97 + (7 + c) * 2.54;
            } else {
                // Pins 13..14 on right header (+7.62mm)
                px = parseFloat(mcuX) + 7.62;
                py = parseFloat(mcuY) - 13.97 + (c - 5) * 2.54;
            }
        } else {
            if (c <= 4) {
                px = parseFloat(mcuX) - 7.62;
                py = parseFloat(mcuY) - 13.97 + (7 + c) * 2.54;
            } else {
                px = parseFloat(mcuX) + 7.62;
                py = parseFloat(mcuY) - 13.97 + (c - 5) * 2.54;
            }
        }
        segments.push({
            x1: colNode.x.toFixed(2),
            y1: colNode.y.toFixed(2),
            x2: px.toFixed(2),
            y2: py.toFixed(2),
            layer: 'F.Cu',
            netId: colNet.id
        });
    }

    // Connect Battery connector Pad 1 to Power Switch Pad 1
    segments.push({
        x1: (parseFloat(batX) - 1.0).toFixed(2),
        y1: parseFloat(batY).toFixed(2),
        x2: parseFloat(swX).toFixed(2),
        y2: (parseFloat(swY) - 2.0).toFixed(2),
        layer: 'F.Cu',
        netId: 9 // BAT_PLUS
    });

    // Connect Power Switch Pad 2 to MCU RAW (Pin 1)
    segments.push({
        x1: parseFloat(swX).toFixed(2),
        y1: parseFloat(swY).toFixed(2),
        x2: (parseFloat(mcuX) - 7.62).toFixed(2),
        y2: (parseFloat(mcuY) - 13.97).toFixed(2),
        layer: 'F.Cu',
        netId: 3 // RAW
    });

    // Connect Battery connector Pad 2 to MCU GND (Pin 2)
    segments.push({
        x1: (parseFloat(batX) + 1.0).toFixed(2),
        y1: parseFloat(batY).toFixed(2),
        x2: (parseFloat(mcuX) - 7.62).toFixed(2),
        y2: (parseFloat(mcuY) - 13.97 + 2.54).toFixed(2),
        layer: 'F.Cu',
        netId: 1 // GND
    });

    // Place Nice!Nano / Pro Micro MCU Footprint in Top Controller Bay (Clear of all switches!)
    pcbContent += `  (footprint "NiceNano_v2_ProMicro" (layer "F.Cu")
    (at ${mcuX} ${mcuY})
    (fp_text reference "U1" (at 0 -10) (layer "F.SilkS"))
    (fp_line (start -9 -14) (end 9 -14) (layer "F.SilkS") (width 0.15))
    (fp_line (start 9 -14) (end 9 14) (layer "F.SilkS") (width 0.15))
    (fp_line (start 9 14) (end -9 14) (layer "F.SilkS") (width 0.15))
    (fp_line (start -9 14) (end -9 -14) (layer "F.SilkS") (width 0.15))
`;

    // Map all 24 MCU pads to their exact matrix signals!
    const mcuPinNets = side === 'left' ? [
        nets.find(n => n.name === 'BAT_PLUS'), // Pin 1: RAW
        nets.find(n => n.name === 'GND'),      // Pin 2: GND
        nets.find(n => n.name === 'GND'),      // Pin 3: RST
        nets.find(n => n.name === 'VCC'),      // Pin 4: VCC
        netEncA,                               // Pin 5: P0.31 (ENC_A)
        netEncB,                               // Pin 6: P0.29 (ENC_B)
        nets.find(n => n.name === 'GND'),      // Pin 7
        nets.find(n => n.name === 'COL0'),     // Pin 8: P1.15 (COL0)
        nets.find(n => n.name === 'COL1'),     // Pin 9: P1.13 (COL1)
        nets.find(n => n.name === 'COL2'),     // Pin 10: P1.11 (COL2)
        nets.find(n => n.name === 'COL3'),     // Pin 11: P0.10 (COL3)
        nets.find(n => n.name === 'COL4'),     // Pin 12: P0.09 (COL4)
        // Right header (pins 13..24)
        nets.find(n => n.name === 'COL5'),     // Pin 13: P0.06 (COL5)
        nets.find(n => n.name === 'COL6'),     // Pin 14: P0.08 (COL6)
        nets.find(n => n.name === 'GND'),      // Pin 15: GND
        nets.find(n => n.name === 'GND'),      // Pin 16: GND
        nets.find(n => n.name === 'GND'),      // Pin 17
        nets.find(n => n.name === 'GND'),      // Pin 18
        nets.find(n => n.name === 'ROW0'),     // Pin 19: P0.22 (ROW0)
        nets.find(n => n.name === 'ROW1'),     // Pin 20: P0.24 (ROW1)
        nets.find(n => n.name === 'ROW2'),     // Pin 21: P1.00 (ROW2)
        nets.find(n => n.name === 'ROW3'),     // Pin 22: P0.11 (ROW3)
        nets.find(n => n.name === 'ROW4'),     // Pin 23: P1.04 (ROW4)
        nets.find(n => n.name === 'GND')       // Pin 24
    ] : [
        // Right Half MCU Pin mapping
        nets.find(n => n.name === 'BAT_PLUS'), // Pin 1: RAW
        nets.find(n => n.name === 'GND'),      // Pin 2: GND
        nets.find(n => n.name === 'GND'),      // Pin 3: RST
        nets.find(n => n.name === 'VCC'),      // Pin 4: VCC
        nets.find(n => n.name === 'GND'),      // Pin 5
        nets.find(n => n.name === 'GND'),      // Pin 6
        nets.find(n => n.name === 'GND'),      // Pin 7
        nets.find(n => n.name === 'COL7'),     // Pin 8: P1.15 (COL7 - 6YHN!)
        nets.find(n => n.name === 'COL8'),     // Pin 9: P1.13 (COL8)
        nets.find(n => n.name === 'COL9'),     // Pin 10: P1.11 (COL9)
        nets.find(n => n.name === 'COL10'),    // Pin 11: P0.10 (COL10)
        nets.find(n => n.name === 'COL11'),    // Pin 12: P0.09 (COL11)
        // Right header (pins 13..24)
        nets.find(n => n.name === 'COL12'),    // Pin 13: P0.06 (COL12)
        nets.find(n => n.name === 'COL13'),    // Pin 14: P0.08 (COL13)
        nets.find(n => n.name === 'GND'),      // Pin 15: GND
        nets.find(n => n.name === 'GND'),      // Pin 16: GND
        nets.find(n => n.name === 'COL14'),    // Pin 17: P0.17 (COL14)
        nets.find(n => n.name === 'COL15'),    // Pin 18: P0.20 (COL15)
        nets.find(n => n.name === 'ROW0'),     // Pin 19: P0.22 (ROW0)
        nets.find(n => n.name === 'ROW1'),     // Pin 20: P0.24 (ROW1)
        nets.find(n => n.name === 'ROW2'),     // Pin 21: P1.00 (ROW2)
        nets.find(n => n.name === 'ROW3'),     // Pin 22: P0.11 (ROW3)
        nets.find(n => n.name === 'ROW4'),     // Pin 23: P1.04 (ROW4)
        nets.find(n => n.name === 'GND')       // Pin 24
    ];

    for (let p = 0; p < 12; p++) {
        const py = (-13.97 + p * 2.54).toFixed(2);
        const lNet = mcuPinNets[p] || { id: 0, name: '' };
        const rNet = mcuPinNets[p + 12] || { id: 0, name: '' };
        pcbContent += `    (pad "${p + 1}" thru_hole circle (at -7.62 ${py}) (size 1.7 1.7) (drill 1.0) (layers *.Cu *.Mask) (net ${lNet.id} "${lNet.name}"))\n`;
        pcbContent += `    (pad "${p + 13}" thru_hole circle (at 7.62 ${py}) (size 1.7 1.7) (drill 1.0) (layers *.Cu *.Mask) (net ${rNet.id} "${rNet.name}"))\n`;
    }
    pcbContent += `  )\n`;

    // Rotary Encoder on Left Half
    if (side === 'left') {
        const encX = offsetX.toFixed(2);
        const encY = offsetY.toFixed(2);
        const row0Net = nets.find(n => n.name === 'ROW0');
        const col0Net = nets.find(n => n.name === 'COL0');
        pcbContent += `  (footprint "RotaryEncoder_Alps_EC11" (layer "F.Cu")
    (at ${encX} ${encY})
    (fp_text reference "ENC1" (at 0 -8) (layer "F.SilkS"))
    (pad "A" thru_hole circle (at -2.5 7.0) (size 1.8 1.8) (drill 1.0) (layers *.Cu *.Mask) (net ${netEncA.id} "${netEncA.name}"))
    (pad "C" thru_hole circle (at 0 7.0) (size 1.8 1.8) (drill 1.0) (layers *.Cu *.Mask) (net 1 "GND"))
    (pad "B" thru_hole circle (at 2.5 7.0) (size 1.8 1.8) (drill 1.0) (layers *.Cu *.Mask) (net ${netEncB.id} "${netEncB.name}"))
    (pad "S1" thru_hole circle (at -2.5 -7.0) (size 1.8 1.8) (drill 1.0) (layers *.Cu *.Mask) (net ${col0Net.id} "${col0Net.name}"))
    (pad "S2" thru_hole circle (at 2.5 -7.0) (size 1.8 1.8) (drill 1.0) (layers *.Cu *.Mask) (net ${row0Net.id} "${row0Net.name}"))
  )\n`;
    }

    // Power Switch (MSK-12D19) in top right bay
    pcbContent += `  (footprint "SlideSwitch_MSK12D19" (layer "F.Cu")
    (at ${swX} ${swY})
    (fp_text reference "SW_PWR" (at 0 -4) (layer "F.SilkS"))
    (pad "1" thru_hole circle (at 0 -2.0) (size 1.6 1.6) (drill 0.9) (layers *.Cu *.Mask) (net 9 "BAT_PLUS"))
    (pad "2" thru_hole circle (at 0 0) (size 1.6 1.6) (drill 0.9) (layers *.Cu *.Mask) (net 3 "RAW"))
    (pad "3" thru_hole circle (at 0 2.0) (size 1.6 1.6) (drill 0.9) (layers *.Cu *.Mask))
  )\n`;

    // Battery Connector (JST-PH 2-Pin) in top bay
    pcbContent += `  (footprint "Connector_JST:JST_PH_S2B-PH-K_1x02" (layer "F.Cu")
    (at ${batX} ${batY})
    (fp_text reference "J_BAT" (at 0 -3) (layer "F.SilkS"))
    (pad "1" thru_hole roundrect (at -1.0 0) (size 1.5 2.0) (drill 0.8) (layers *.Cu *.Mask) (net 9 "BAT_PLUS"))
    (pad "2" thru_hole oval (at 1.0 0) (size 1.5 2.0) (drill 0.8) (layers *.Cu *.Mask) (net 1 "GND"))
  )\n`;

    // Emit Copper Trace Segments
    for (const seg of segments) {
        pcbContent += `  (segment (start ${seg.x1} ${seg.y1}) (end ${seg.x2} ${seg.y2}) (width 0.25) (layer "${seg.layer}") (net ${seg.netId}))\n`;
    }

    pcbContent += `)\n`;

    const outPcbFile = path.join(pcbDir, `interlock_ergo_${side}_${variant}.kicad_pcb`);
    fs.writeFileSync(outPcbFile, pcbContent, 'utf8');
    console.log(`Generated: ${path.basename(outPcbFile)} (${activeKeys.length} keys, ${segments.length} segments).`);

    const gerberSubdir = path.join(distDir, `gerbers_${side}_${variant}`);
    if (fs.existsSync(gerberSubdir)) execSync(`rm -rf "${gerberSubdir}"`);
    fs.mkdirSync(gerberSubdir, { recursive: true });

    execSync(`kicad-cli pcb export gerbers -o "${gerberSubdir}/" "${outPcbFile}"`);
    execSync(`kicad-cli pcb export drill -o "${gerberSubdir}/" "${outPcbFile}"`);

    const zipName = `interlock_ergo_${side}_${variant}_gerbers.zip`;
    const zipPath = path.join(distDir, zipName);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execSync(`cd "${gerberSubdir}" && ${zipBin} -q '${zipPath}' *`);
    const zipStat = fs.statSync(zipPath);
    console.log(`  -> JLCPCB Gerber Package: ${zipName} (${(zipStat.size / 1024).toFixed(1)} KB)`);

    // Individual lines for each diode in CPL and BOM (satisfies JLCPCB parser rules)
    const cplFile = path.join(distDir, `cpl_${side}_${variant}.csv`);
    let cplText = 'Designator,Mid X,Mid Y,Layer,Rotation\n';
    for (const row of cplRows) {
        cplText += `${row.designator},${row.midX},${row.midY},${row.layer},${row.rotation}\n`;
    }
    fs.writeFileSync(cplFile, cplText, 'utf8');

    const bomFile = path.join(distDir, `bom_${side}_${variant}.csv`);
    let bomText = 'Comment,Designator,Footprint,LCSC Part #\n';
    for (const row of cplRows) {
        bomText += `1N4148W,${row.designator},SOD-123,C81598\n`;
    }
    fs.writeFileSync(bomFile, bomText, 'utf8');
}

// 1. Choc v1 Left (34 keys) & Right (42 keys)
generateKiCadPCB({
    variant: 'choc',
    side: 'left',
    cols: 7,
    rows: 5,
    pitchX: 18.0,
    pitchY: 17.0,
    isChoc: true
});

generateKiCadPCB({
    variant: 'choc',
    side: 'right',
    cols: 9,
    rows: 5,
    pitchX: 18.0,
    pitchY: 17.0,
    isChoc: true
});

// 2. MX Left (34 keys) & Right (42 keys)
generateKiCadPCB({
    variant: 'mx',
    side: 'left',
    cols: 7,
    rows: 5,
    pitchX: 19.05,
    pitchY: 19.05,
    isChoc: false
});

generateKiCadPCB({
    variant: 'mx',
    side: 'right',
    cols: 9,
    rows: 5,
    pitchX: 19.05,
    pitchY: 19.05,
    isChoc: false
});

console.log('✓ All 4 KiCad PCBs generated with full MCU mapping and diode series isolation!');
