#!/usr/bin/env node
/*
 * Draws docs/images/layout.svg from the same numbers the CAD and PCB use.
 *
 * Everything here is derived: the row stagger, pitches, margins, wall thickness
 * and the key legends are all read out of cad/interlock_params.scad and the ZMK
 * keymap, so the picture cannot drift away from the hardware. If the diagram and
 * the board disagree, the board is wrong - this file is not hand-maintained.
 *
 *   node docs/generate_layout.js
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const outFile = path.join(__dirname, 'images', 'layout.svg');

const scad = fs.readFileSync(path.join(rootDir, 'cad', 'interlock_params.scad'), 'utf8');
const consts = {};
for (const m of scad.matchAll(/^([a-z_][a-z0-9_]*)\s*=\s*(-?[\d.]+)\s*;/gim)) consts[m[1]] = parseFloat(m[2]);
const stagger = JSON.parse(
    '[' + scad.match(/row_stagger_u\s*=\s*\[([^\]]+)\]/)[1].replace(/[^\d.,-]/g, '') + ']'
);

function variant(name) {
    const mx = name === 'mx';
    return {
        name,
        pitchX: mx ? consts.mx_pitch_x : consts.choc_pitch_x,
        pitchY: mx ? consts.mx_pitch_y : consts.choc_pitch_y,
        plateT: mx ? consts.mx_plate_thickness : consts.choc_plate_thickness,
        gap: mx ? consts.mx_plate_gap : consts.choc_plate_gap,
        depth: consts.floor_thickness + consts.standoff_h + consts.pcb_thickness +
            (mx ? consts.mx_plate_gap : consts.choc_plate_gap) + (mx ? consts.mx_plate_thickness : consts.choc_plate_thickness)
    };
}

// ---------------------------------------------------------------- key legends

const KEY_NAMES = {
    N0: '0', N1: '1', N2: '2', N3: '3', N4: '4', N5: '5', N6: '6', N7: '7', N8: '8', N9: '9',
    ESC: 'Esc', TAB: 'Tab', CLCK: 'Caps', SPACE: 'Space', RET: 'Enter', BSPC: 'Bksp',
    MINUS: '-', EQUAL: '=', LBKT: '[', RBKT: ']', BSLH: '\\', SEMI: ';', SQT: "'",
    COMMA: ',', DOT: '.', FSLH: '/', GRAVE: '`',
    LSHFT: 'Shift', RSHFT: 'Shift', LCTRL: 'Ctrl', RCTRL: 'Ctrl', LGUI: 'Win', RGUI: 'Win', LALT: 'Alt', RALT: 'Alt',
    UP: 'Up', DOWN: 'Down', LEFT: 'Left', RIGHT: 'Right',
    HOME: 'Home', END: 'End', DEL: 'Del', PG_UP: 'PgUp', PG_DN: 'PgDn', PSCRN: 'PrtSc',
    C_MUTE: 'Mute', C_PLAY_PAUSE: 'Play', C_AL_CALC: 'Calc',
    F1: 'F1', F2: 'F2', F3: 'F3', F4: 'F4', F5: 'F5', F6: 'F6',
    F7: 'F7', F8: 'F8', F9: 'F9', F10: 'F10', F11: 'F11', F12: 'F12'
};

function legend(token) {
    let m = token.match(/^&kp\s+([A-Z0-9_]+)$/);
    if (m) return KEY_NAMES[m[1]] || (m[1].length === 1 ? m[1] : m[1].toLowerCase());
    m = token.match(/^&mo\s+(\d+)$/);
    if (m) return `Fn${m[1]}`;
    m = token.match(/^&trans$/);
    if (m) return '';
    return token.replace(/^&/, '');
}

const keymap = fs.readFileSync(
    path.join(rootDir, 'config', 'boards', 'shields', 'interlock_ergo', 'interlock_ergo.keymap'), 'utf8');
const defaultLayer = keymap.slice(keymap.indexOf('default_layer {'));
const bindingBlock = defaultLayer.slice(defaultLayer.indexOf('bindings = <') + 13, defaultLayer.indexOf('>;'));
const tokens = bindingBlock.match(/&[a-z0-9_]+(?:\s+[A-Z0-9_]+)*/gi) || [];

// The two halves are not the same shape: row 2 of the right half and row 4 of both
// halves are one or two keys short. These counts are the same ones the keymap and
// the matrix transform use.
const LEFT_COLS = 6;
const RIGHT_COLS = 8;
const rows = [];
let t = 0;
const leftRowLen = [6, 6, 6, 6, 5];       // left bottom row skips one position
const rightRowLen = [8, 8, 7, 8, 8];      // right home row ends at Enter (7 keys)
for (let r = 0; r < 5; r++) {
    const left = tokens.slice(t, t + leftRowLen[r]); t += leftRowLen[r];
    const right = tokens.slice(t, t + rightRowLen[r]); t += rightRowLen[r];
    rows.push({ left, right });
}
if (t !== tokens.length) throw new Error(`${tokens.length - t} unassigned keymap bindings`);

// ---------------------------------------------------------------- geometry

const C = consts;
const pcbW = (cols, p) => cols * p.pitchX + 2 * C.pcb_margin_x + C.stagger_max_u * p.pitchX;
const pcbL = (p) => 5 * p.pitchY + 2 * C.pcb_margin_y + C.pcb_top_bay;
const plateW = (cols, p) => cols * p.pitchX + C.stagger_max_u * p.pitchX;
const plateL = (p) => 5 * p.pitchY;
const caseW = (cols, p) => C.wall_thickness + pcbW(cols, p) + C.seam_wall + C.pcb_clearance;
const caseL = (p) => 2 * C.wall_thickness + pcbL(p) + C.pcb_clearance;
const cavX = C.wall_thickness + C.pcb_clearance / 2;
const cavY = C.wall_thickness + C.pcb_clearance / 2;

// The silhouette is a stack of full-width bands, the same one the PCB, the plate and
// the case are built from. Drawn as one traced polygon so the diagram cannot claim a
// rectangular case.
const rowEdge = (r, cols, p, seamRight) => seamRight
    ? stagger[r] * p.pitchX
    : C.pcb_margin_x + (stagger[r] + cols) * p.pitchX + C.pcb_margin_x;
function outlineBands(cols, p, seamRight) {
    const w = pcbW(cols, p);
    const h = pcbL(p);
    const y0 = C.pcb_top_bay + C.pcb_margin_y;
    const bands = [[0, C.pcb_top_bay, 0, w], [C.pcb_top_bay, y0, 0, w]];
    for (let r = 0; r < 5; r++) {
        const e = rowEdge(r, cols, p, seamRight);
        bands.push([y0 + r * p.pitchY, y0 + (r + 1) * p.pitchY, seamRight ? e : 0, seamRight ? w : e]);
    }
    const e = rowEdge(4, cols, p, seamRight);
    bands.push([y0 + 5 * p.pitchY, h, seamRight ? e : 0, seamRight ? w : e]);
    return bands;
}

function traceBands(bands) {
    const pts = [[bands[0][2], bands[0][0]], [bands[0][3], bands[0][0]]];
    let prev = bands[0];
    for (let i = 1; i < bands.length; i++) {
        const b = bands[i];
        if (b[3] !== prev[3]) pts.push([prev[3], b[0]], [b[3], b[0]]);
        prev = b;
    }
    const last = bands[bands.length - 1];
    pts.push([last[3], last[1]], [last[2], last[1]]);
    prev = last;
    for (let i = bands.length - 2; i >= 0; i--) {
        const b = bands[i];
        if (b[2] !== prev[2]) pts.push([prev[2], b[1]], [b[2], b[1]]);
        prev = b;
    }
    return pts;
}

function layout(p) {
    // The two halves are not mirror images in one respect: the left half carries the
    // seam wall on its right, the right half on its left, so the right half's key
    // field starts 2 mm further in (seam_wall vs wall_thickness). Both are 6 mm
    // thick on the seam side, which is why the width formula is the same.
    const leftW = caseW(LEFT_COLS, p);
    const rightW = caseW(RIGHT_COLS, p);
    const plateX = cavX + C.pcb_margin_x;
    const rightPlateX = C.seam_wall + C.pcb_clearance / 2 + C.pcb_margin_x;
    const plateY = cavY + C.pcb_top_bay + C.pcb_margin_y;
    const keys = [];
    for (let r = 0; r < 5; r++) {
        // Left half: 6 columns, bottom row skips column 4.
        for (let c = 0; c < LEFT_COLS; c++) {
            if (r === 4 && c === 4) continue;
            const idx = r === 4 && c > 4 ? c - 1 : c;
            keys.push({
                x: plateX + c * p.pitchX + stagger[r] * p.pitchX + p.pitchX / 2,
                y: plateY + r * p.pitchY + p.pitchY / 2,
                label: legend(rows[r].left[idx] || ''),
                half: 'L', r, c
            });
        }
        // Right half: 8 columns, shifted by the left case width.
        let ri = 0;
        for (let c = 0; c < RIGHT_COLS; c++) {
            if (r === 2 && c === 7) continue;
            keys.push({
                x: leftW + rightPlateX + c * p.pitchX + stagger[r] * p.pitchX + p.pitchX / 2,
                y: plateY + r * p.pitchY + p.pitchY / 2,
                label: legend(rows[r].right[ri++] || ""),
                half: "R", r, c
            });
        }
    }
    // Seam gap: centre-to-centre distance between the 5 and the 6 on each row.
    // Centre-to-centre distance between each half's innermost keys.
    const seamGaps = [0, 1, 2, 3, 4].map((r) => {
        const leftX = Math.max(...keys.filter((k) => k.half === "L" && k.r === r).map((k) => k.x));
        const rightX = Math.min(...keys.filter((k) => k.half === "R" && k.r === r).map((k) => k.x));
        return rightX - leftX;
    });
    return { keys, leftW, rightW, dockedW: leftW + rightW, plateX, rightPlateX, plateY, caseL: caseL(p), seamGaps };
}

// ---------------------------------------------------------------- SVG

const W = 1600;
const PAD = 34;
const FOOT = 118;

function svg(p) {
    const L = layout(p);
    const totalW = L.dockedW;
    const totalL = L.caseL;
    const scale = (W - 2 * PAD) / (totalW / 10);
    const S = scale / 10;                       // mm -> px
    const H = totalL * S + PAD * 2 + FOOT;
    const key = p.pitchX * S - 2;

    const out = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H.toFixed(0)}" viewBox="0 0 ${W} ${H.toFixed(0)}" font-family="ui-sans-serif, -apple-system, Segoe UI, Helvetica, Arial, sans-serif">`);
    out.push(`<rect width="${W}" height="${H.toFixed(0)}" fill="#f6f7f9"/>`);

    // Case outlines: the right half is 36 mm wider than the left (nine columns, not
    // seven) - drawing both at the left half's width is what made the docked width
    // in the README wrong for two revisions. The outline steps with the row stagger.
    for (const [half, cols, seamRight] of [[0, LEFT_COLS, true], [1, RIGHT_COLS, false]]) {
        const ox = PAD + (half ? L.leftW : 0) * S;
        const pts = traceBands(outlineBands(cols, p, seamRight))
            .map(([x, y]) => `${(ox + x * S).toFixed(1)},${(PAD + y * S).toFixed(1)}`).join(' ');
        out.push(`<polygon points="${pts}" fill="${half ? '#e8ebef' : '#eef0f4'}" stroke="#9aa4b2" stroke-width="1.6"/>`);
    }
    // Plates: the same bands, inset to the key field.
    for (const [half, cols, px, seamRight] of [[0, LEFT_COLS, L.plateX, true], [1, RIGHT_COLS, L.leftW + L.rightPlateX, false]]) {
        const inner = seamRight ? Math.max(...[0, 1, 2, 3, 4].map((r) => C.pcb_margin_x + (stagger[r] + cols) * p.pitchX))
                                : C.pcb_margin_x;
        const y0 = C.pcb_top_bay + C.pcb_margin_y;
        // Trace the stepped boundary, not every band edge.
        const path = traceBands([0, 1, 2, 3, 4].map((r) => {
            const left = seamRight ? C.pcb_margin_x + stagger[r] * p.pitchX : inner;
            const right = seamRight ? inner : C.pcb_margin_x + (stagger[r] + cols) * p.pitchX;
            return [y0 + r * p.pitchY, y0 + (r + 1) * p.pitchY, left, right];
        })).map(([x, y]) => `${(PAD + (px + x) * S).toFixed(1)},${(PAD + y * S).toFixed(1)}`).join(' ');
        out.push(`<polygon points="${path}" fill="#dfe4ea" stroke="#8b95a3" stroke-width="1.1" stroke-dasharray="4 3"/>`);
    }
    // Seam marker
    out.push(`<line x1="${(PAD + L.leftW * S).toFixed(1)}" y1="${(PAD - 8)}" x2="${(PAD + L.leftW * S).toFixed(1)}" y2="${(PAD + totalL * S + 8).toFixed(1)}" stroke="#d9534f" stroke-width="2" stroke-dasharray="7 5"/>`);

    // Keys
    for (const k of L.keys) {
        const x = PAD + k.x * S - key / 2;
        const y = PAD + k.y * S - key / 2;
        out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${key.toFixed(1)}" height="${key.toFixed(1)}" rx="${(key * 0.14).toFixed(1)}" fill="${k.half === 'R' ? '#ffffff' : '#fdfdfd'}" stroke="#7c8794" stroke-width="1"/>`);
        if (k.label) {
            const size = Math.min(key * 0.38, key * 1.6 / Math.max(2, k.label.length));
            out.push(`<text x="${(x + key / 2).toFixed(1)}" y="${(y + key / 2 + size * 0.36).toFixed(1)}" font-size="${size.toFixed(1)}" text-anchor="middle" fill="#26313f">${k.label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
        }
    }
    // Emphasise 6-Y-H-N on the right half
    for (const k of L.keys.filter((k) => k.half === 'R' && k.c === 0 && k.r !== 2)) {
        const x = PAD + k.x * S - key / 2;
        const y = PAD + k.y * S - key / 2;
        out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${key.toFixed(1)}" height="${key.toFixed(1)}" rx="${(key * 0.14).toFixed(1)}" fill="none" stroke="#c0392b" stroke-width="2.6"/>`);
    }

    // Callouts
    const gap = L.seamGaps[1];
    const seamY = PAD + (L.plateY + 1.5 * p.pitchY) * S;
    out.push(`<text x="${(PAD + L.leftW * S + 10).toFixed(1)}" y="${(seamY - 10).toFixed(1)}" font-size="15" fill="#c0392b">seam - dovetail + magnets</text>`);

    const footY = PAD + totalL * S + 34;
    out.push(`<text x="${PAD}" y="${footY}" font-size="21" font-weight="600" fill="#1f2933">Interlock Ergo - ${p.name === 'choc' ? 'Kailh Choc v1' : 'Cherry MX'} layout, ${L.keys.length} keys</text>`);
    const lines = [
        `Case ${L.leftW.toFixed(1)} x ${(totalL).toFixed(1)} mm left, ${L.rightW.toFixed(1)} x ${(totalL).toFixed(1)} mm right, docked ${(totalW).toFixed(1)} mm wide. Plate ${p.plateT} mm, case ${p.depth} mm tall.`,
        `Stagger ${stagger.join(' / ')} u is GH60's own stagger (its letters sit at 1 / 1.5 / 1.75 / 2.25 u), shifted 1 u right by the left function column; the 22.5 mm of shear it needs is the dead strip at each half's seam edge.`,
        `Centre of "5" to centre of "6": ${gap.toFixed(1)} mm (${(gap / p.pitchX).toFixed(1)} u) on every row - that is the docked centre gap, not ${(1.5).toFixed(1)} u.`,
        `Red outline marks the 6-Y-H-N column: 6, Y, H and N all fall on the right half.`
    ];
    lines.forEach((l, i) => out.push(`<text x="${PAD}" y="${footY + 26 + i * 21}" font-size="14.5" fill="#4a5561">${l}</text>`));
    out.push('</svg>');
    return out.join('\n');
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, svg(variant('choc')));
console.log(`wrote ${path.relative(rootDir, outFile)}`);

// Keyboard Layout Editor file, in key units, generated from the same positions.
// KLE's x/y are cursor-relative, so each key carries the delta from where the last
// key left the cursor.
function kle(p) {
    const L = layout(p);
    let cx = 0, cy = 0;
    const keys = [];
    for (const k of [...L.keys].sort((a, b) => a.y - b.y || a.x - b.x)) {
        const x = k.x / p.pitchX, y = k.y / p.pitchY;
        keys.push({ x: +(x - cx).toFixed(4), y: +(y - cy).toFixed(4), w: 1, h: 1, label: k.label });
        cx = x + 1; cy = y;
    }
    return [keys];
}
const kleFile = path.join(__dirname, 'kle_layout.json');
fs.writeFileSync(kleFile, JSON.stringify(kle(variant('choc')), null, 0) + '\n');
console.log(`wrote ${path.relative(rootDir, kleFile)}`);
for (const v of ['choc', 'mx']) {
    const L = layout(variant(v));
    console.log(`  ${v}: ${L.keys.length} keys, docked ${L.dockedW.toFixed(1)} mm wide (${L.leftW.toFixed(1)} + ${L.rightW.toFixed(1)}), 5-to-6 centre gap ${L.seamGaps.map((g) => g.toFixed(1)).join('/')} mm`);
}

// Plain-text layout table for the README. Printed, not written, so it can be
// pasted only after a human has looked at it.
function asciiTable(p) {
    const L = layout(p);
    const cell = (s) => `[${(s || '').padEnd(5)}]`;
    const leftKeys = (r) => L.keys.filter((k) => k.half === 'L' && k.r === r).sort((a, b) => a.x - b.x);
    const rightKeys = (r) => L.keys.filter((k) => k.half === 'R' && k.r === r).sort((a, b) => a.x - b.x);
    const lines = [];
    for (let r = 0; r < 5; r++) {
        const l = leftKeys(r).map((k) => cell(k.label)).join(' ');
        const rr = rightKeys(r).map((k) => cell(k.label)).join(' ');
        // Indent each left row by the stagger so the columns line up as they do on the board.
        const indent = ' '.repeat(Math.round(stagger[r] * 6));
        lines.push(`${indent}${l}  ‖ ${rr}`);
    }
    return lines.join('\n');
}
console.log('\n' + asciiTable(variant('choc')));
