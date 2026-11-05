const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pcbDir = __dirname;
const distDir = path.join(pcbDir, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

console.log('--- Generating Routed Interlock Ergo KiCad PCBs (Choc v1 & MX) ---');

function generateKiCadPCB(opts) {
    const { variant, side, cols, rows, pitchX, pitchY, isChoc } = opts;
    const boardW = cols * pitchX + 16.0;
    const boardH = rows * pitchY + 16.0;
    const offsetX = 10.0 + pitchX * 0.5;
    const offsetY = 10.0 + pitchY * 0.5;

    // Define Nets
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
        nets.push({ id: 10 + c, name: `COL${colOffset + c}` });
    }

    let netEncA = null;
    let netEncB = null;
    if (side === 'left') {
        netEncA = { id: nets.length, name: 'ENC_A' };
        nets.push(netEncA);
        netEncB = { id: nets.length, name: 'ENC_B' };
        nets.push(netEncB);
    }

    let pcbContent = `(kicad_pcb
  (version 20240108)
  (generator "interlock_pcb_generator")
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

    pcbContent += `  (gr_rect (start 0 0) (end ${boardW.toFixed(2)} ${boardH.toFixed(2)}) (layer "Edge.Cuts") (width 0.15) (fill none))\n`;
    pcbContent += `  (gr_text "Interlock Ergo (${side.toUpperCase()} - ${variant.toUpperCase()})" (at ${(boardW * 0.5).toFixed(2)} 4.0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.25))))\n`;
    pcbContent += `  (gr_text "Designed for ZMK & 2.4GHz Dongle" (at ${(boardW * 0.5).toFixed(2)} 7.0) (layer "F.SilkS") (effects (font (size 1.2 1.2) (thickness 0.2))))\n`;
    if (side === 'right') {
        pcbContent += `  (gr_text "6-Y-H-N ON RIGHT HALF" (at ${(boardW * 0.5).toFixed(2)} 10.0) (layer "F.SilkS") (effects (font (size 1.3 1.3) (thickness 0.25))))\n`;
    }

    const cplRows = [];
    const segments = [];
    let switchIndex = 1;

    // Track matrix nodes for trace routing
    const rowDiodeNodes = Array.from({ length: rows }, () => []);
    const colSwitchNodes = Array.from({ length: cols }, () => []);

    for (let r = 0; r < rows; r++) {
        const rowNet = nets.find(n => n.name === `ROW${r}`);
        for (let c = 0; c < cols; c++) {
            if (side === 'left' && r === 0 && c === 0) continue;

            const colNet = nets.find(n => n.name === `COL${colOffset + c}`);
            const x = (offsetX + c * pitchX).toFixed(2);
            const y = (offsetY + r * pitchY).toFixed(2);
            const swRef = `SW${switchIndex}`;
            const dRef = `D${switchIndex}`;
            switchIndex++;

            let pad1X, pad1Y, pad2X, pad2Y;

            if (isChoc) {
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
    (pad "2" smd rect (at 5.0 -3.8) (size 2.5 1.6) (layers "B.Cu" "B.Paste" "B.Mask") (net ${rowNet.id} "${rowNet.name}"))
  )\n`;
            } else {
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
    (pad "2" smd rect (at 2.54 -5.08) (size 2.5 1.6) (layers "B.Cu" "B.Paste" "B.Mask") (net ${rowNet.id} "${rowNet.name}"))
  )\n`;
            }

            const dx = (parseFloat(x) - 4.5).toFixed(2);
            const dy = (parseFloat(y) + 4.0).toFixed(2);
            pcbContent += `  (footprint "Diode_SMD:D_SOD-123" (layer "B.Cu")
    (at ${dx} ${dy})
    (fp_text reference "${dRef}" (at 0 1.2) (layer "B.SilkS"))
    (pad "1" smd rect (at -1.65 0) (size 0.9 1.2) (layers "B.Cu" "B.Paste" "B.Mask") (net ${rowNet.id} "${rowNet.name}"))
    (pad "2" smd rect (at 1.65 0) (size 0.9 1.2) (layers "B.Cu" "B.Paste" "B.Mask") (net ${colNet.id} "${colNet.name}"))
  )\n`;

            cplRows.push({
                designator: dRef,
                midX: dx,
                midY: dy,
                layer: 'bottom',
                rotation: 0
            });

            // Save nodes for routing
            const diodeCathodeX = parseFloat(dx) - 1.65;
            const diodeCathodeY = parseFloat(dy);
            rowDiodeNodes[r].push({ x: diodeCathodeX, y: diodeCathodeY, netId: rowNet.id });
            colSwitchNodes[c].push({ x: pad1X, y: pad1Y, netId: colNet.id });

            // Connect Switch pad 2 to Diode pad 2
            segments.push({
                x1: pad2X.toFixed(2),
                y1: pad2Y.toFixed(2),
                x2: (parseFloat(dx) + 1.65).toFixed(2),
                y2: parseFloat(dy).toFixed(2),
                layer: 'B.Cu',
                netId: colNet.id
            });
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

    // Place MCU Footprint
    const mcuX = (boardW * 0.5).toFixed(2);
    const mcuY = 22.0;
    pcbContent += `  (footprint "NiceNano_v2_ProMicro" (layer "F.Cu")
    (at ${mcuX} ${mcuY})
    (fp_text reference "U1" (at 0 -17) (layer "F.SilkS"))
    (fp_line (start -9 -16) (end 9 -16) (layer "F.SilkS") (width 0.15))
    (fp_line (start 9 -16) (end 9 16) (layer "F.SilkS") (width 0.15))
    (fp_line (start 9 16) (end -9 16) (layer "F.SilkS") (width 0.15))
    (fp_line (start -9 16) (end -9 -16) (layer "F.SilkS") (width 0.15))
`;
    for (let p = 0; p < 12; p++) {
        const py = (-13.97 + p * 2.54).toFixed(2);
        pcbContent += `    (pad "${p + 1}" thru_hole circle (at -7.62 ${py}) (size 1.7 1.7) (drill 1.0) (layers *.Cu *.Mask))\n`;
        pcbContent += `    (pad "${p + 13}" thru_hole circle (at 7.62 ${py}) (size 1.7 1.7) (drill 1.0) (layers *.Cu *.Mask))\n`;
    }
    pcbContent += `  )\n`;

    // Rotary Encoder on Left
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

    // Power Switch
    const swX = (boardW - 8.0).toFixed(2);
    const swY = (boardH * 0.5).toFixed(2);
    pcbContent += `  (footprint "SlideSwitch_MSK12D19" (layer "F.Cu")
    (at ${swX} ${swY})
    (fp_text reference "SW_PWR" (at 0 -4) (layer "F.SilkS"))
    (pad "1" thru_hole circle (at 0 -2.0) (size 1.6 1.6) (drill 0.9) (layers *.Cu *.Mask) (net 9 "BAT_PLUS"))
    (pad "2" thru_hole circle (at 0 0) (size 1.6 1.6) (drill 0.9) (layers *.Cu *.Mask) (net 3 "RAW"))
    (pad "3" thru_hole circle (at 0 2.0) (size 1.6 1.6) (drill 0.9) (layers *.Cu *.Mask))
  )\n`;

    // Battery Connector
    const batX = (boardW - 12.0).toFixed(2);
    const batY = (boardH * 0.5 + 12.0).toFixed(2);
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
    console.log(`Generated: ${path.basename(outPcbFile)} with ${segments.length} routed copper segments.`);

    const gerberSubdir = path.join(distDir, `gerbers_${side}_${variant}`);
    if (fs.existsSync(gerberSubdir)) execSync(`rm -rf "${gerberSubdir}"`);
    fs.mkdirSync(gerberSubdir, { recursive: true });

    execSync(`kicad-cli pcb export gerbers -o "${gerberSubdir}/" "${outPcbFile}"`);
    execSync(`kicad-cli pcb export drill -o "${gerberSubdir}/" "${outPcbFile}"`);

    const zipName = `interlock_ergo_${side}_${variant}_gerbers.zip`;
    const zipPath = path.join(distDir, zipName);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execSync(`cd "${gerberSubdir}" && nix-shell -p zip --run "zip -q '${zipPath}' *"`);
    const zipStat = fs.statSync(zipPath);
    console.log(`  -> JLCPCB Gerber Package: ${zipName} (${(zipStat.size / 1024).toFixed(1)} KB)`);

    const cplFile = path.join(distDir, `cpl_${side}_${variant}.csv`);
    let cplText = 'Designator,Mid X,Mid Y,Layer,Rotation\n';
    for (const row of cplRows) {
        cplText += `${row.designator},${row.midX},${row.midY},${row.layer},${row.rotation}\n`;
    }
    fs.writeFileSync(cplFile, cplText, 'utf8');

    const bomFile = path.join(distDir, `bom_${side}_${variant}.csv`);
    let bomText = 'Comment,Designator,Footprint,LCSC Part #\n';
    bomText += `1N4148W,"${cplRows.map(r => r.designator).join(',')}",SOD-123,C81598\n`;
    fs.writeFileSync(bomFile, bomText, 'utf8');
}

// 1. Choc v1 Left & Right (18mm x 17mm pitch)
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

// 2. MX Left & Right (19.05mm x 19.05mm pitch)
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

console.log('✓ All routed KiCad PCB designs, JLCPCB Gerbers, Drill files, BOMs, and CPL files created!');
