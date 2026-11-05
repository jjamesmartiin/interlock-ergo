#!/usr/bin/env node
/*
 * Keeps the plate and the PCB in the same place.
 *
 * The plate's switch apertures, the case's plate rebate and the PCB's switch
 * footprints are all derived from the same constants, but they are derived in
 * three different languages (OpenSCAD, JavaScript, KiCad). A one-row or one-column
 * offset between them is invisible until someone tries to build one, so this
 * recomputes the key grid from cad/interlock_params.scad and compares it against
 * the switch footprints actually present in each generated board.
 *
 * It also checks that the encoder sits where the plate expects its through-hole,
 * and that every switch has its own diode net (a shared net silently couples two
 * keys).
 *
 * Run after `node pcb/generate_pcb.js`.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.join(__dirname, '..');

// ---------------------------------------------------------------- constants

const scad = fs.readFileSync(path.join(rootDir, 'cad', 'interlock_params.scad'), 'utf8');
const c = {};
for (const m of scad.matchAll(/^([a-z_][a-z0-9_]*)\s*=\s*(-?[\d.]+)\s*;/gim)) c[m[1]] = parseFloat(m[2]);
const stagger = JSON.parse(
    '[' + scad.match(/row_stagger_u\s*=\s*\[([^\]]+)\]/)[1].replace(/[^\d.,-]/g, '') + ']'
);

assert.strictEqual(stagger.length, 5, 'row_stagger_u must have one entry per row');

// Mirrors pcb/generate_pcb.js. Kept as literals on purpose: if the generator moves
// them, this test is supposed to fail and force the CAD to be updated with them.
const MARGIN_X = 8.0;
const MARGIN_Y = 8.0;
const TOP_BAY = 28.0;

const variants = {
    choc: { pitchX: c.choc_pitch_x, pitchY: c.choc_pitch_y },
    mx: { pitchX: c.mx_pitch_x, pitchY: c.mx_pitch_y }
};
const COLS = { left: c.cols_left, right: c.cols_right };

assert(Math.abs(MARGIN_X - c.pcb_margin_x) < 1e-9, 'pcb_margin_x drift between generator and CAD');
assert(Math.abs(MARGIN_Y - c.pcb_margin_y) < 1e-9, 'pcb_margin_y drift between generator and CAD');
assert(Math.abs(TOP_BAY - c.pcb_top_bay) < 1e-9, 'pcb_top_bay drift between generator and CAD');
assert(Math.abs(1.25 - c.stagger_max_u) < 1e-9, 'stagger_max_u drift');

// Which matrix positions actually carry a switch. The encoder owns RC(0,0) on the
// left half, and the right half's home row and bottom row stop short.
function hasSwitch(side, r, col) {
    if (side === 'left') {
        if (r === 4 && col === 5) return false;   // omitted space position
        if (r === 0 && col === 0) return false;   // EC11 encoder, not a switch
        return true;
    }
    if (r === 2 && (col === 7 || col === 8)) return false;  // home row ends at Enter
    if (r === 4 && col === 8) return false;                 // bottom row ends at PgDn
    return true;
}

function expectedPositions(side, v) {
    const cols = COLS[side];
    const offsetX = MARGIN_X + v.pitchX * 0.5;
    const offsetY = TOP_BAY + MARGIN_Y + v.pitchY * 0.5;
    const out = [];
    for (let r = 0; r < 5; r++) {
        for (let col = 0; col < cols; col++) {
            if (!hasSwitch(side, r, col)) continue;
            out.push({
                r, col,
                x: +(offsetX + (stagger[r] + col) * v.pitchX).toFixed(2),
                y: +(offsetY + r * v.pitchY).toFixed(2)
            });
        }
    }
    return out;
}

// ---------------------------------------------------------------- parse boards

function parseFootprints(file) {
    const text = fs.readFileSync(file, 'utf8');
    const out = [];
    const chunks = text.split('(footprint "');
    for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        const name = chunk.slice(0, chunk.indexOf('"'));
        const at = chunk.match(/\(at\s+(-?[\d.]+)\s+(-?[\d.]+)/);
        if (!at) continue;
        out.push({ name, x: +(+at[1]).toFixed(2), y: +(+at[2]).toFixed(2) });
    }
    return out;
}

const boards = [];
for (const variant of Object.keys(variants)) {
    for (const side of ['left', 'right']) {
        boards.push({ variant, side, file: path.join(rootDir, 'pcb', `interlock_ergo_${side}_${variant}.kicad_pcb`) });
    }
}

let missing = 0;
for (const b of boards) {
    if (!fs.existsSync(b.file)) {
        console.log(`  skip ${path.basename(b.file)} (not generated yet)`);
        missing++;
        continue;
    }
    const v = variants[b.variant];
    const fps = parseFootprints(b.file);
    const switches = fps.filter((f) => /^Kailh_(Choc|MX)_/.test(f.name));
    const expected = expectedPositions(b.side, v);

    assert.strictEqual(switches.length, expected.length,
        `${path.basename(b.file)}: ${switches.length} switch footprints, expected ${expected.length}`);

    const key = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
    const actual = new Map(switches.map((s) => [key(s.x, s.y), s]));
    const problems = [];
    for (const e of expected) {
        if (!actual.has(key(e.x, e.y))) {
            problems.push(`missing switch at row ${e.r} col ${e.col} (${e.x}, ${e.y})`);
        }
    }
    for (const [k, s] of actual) {
        if (!expected.some((e) => key(e.x, e.y) === k)) problems.push(`unexpected switch at ${k} (${s.name})`);
    }
    assert.strictEqual(problems.length, 0,
        `${path.basename(b.file)}: switch grid does not match the plate formula:\n    ${problems.slice(0, 8).join('\n    ')}`);

    // Encoder on the left half, at the RC(0,0) grid position.
    if (b.side === 'left') {
        const enc = fps.filter((f) => /Encoder/i.test(f.name));
        assert.strictEqual(enc.length, 1, `${path.basename(b.file)}: expected exactly one encoder footprint`);
        const offsetX = MARGIN_X + v.pitchX * 0.5;
        const offsetY = TOP_BAY + MARGIN_Y + v.pitchY * 0.5;
        assert(Math.abs(enc[0].x - offsetX) < 0.02 && Math.abs(enc[0].y - offsetY) < 0.02,
            `${path.basename(b.file)}: encoder at (${enc[0].x}, ${enc[0].y}) is not on the plate's RC(0,0) position (${offsetX}, ${offsetY})`);
    } else {
        assert.strictEqual(fps.filter((f) => /Encoder/i.test(f.name)).length, 0,
            `${path.basename(b.file)}: right half must not carry an encoder`);
    }

    // Every switch must reach the matrix through its own diode net: a shared net
    // silently couples two keys, and the board still passes DRC.
    const diodeNets = [...fs.readFileSync(b.file, 'utf8').matchAll(/\(net \d+ "(SW_D_R\d+_C\d+)"\)/g)]
        .map((m) => m[1]);
    // One SW_D net per key, plus one for the encoder push switch on the left half.
    const uniqueDiodeNets = new Set(diodeNets);
    const wantNets = expected.length + (b.side === "left" ? 1 : 0);
    assert.strictEqual(uniqueDiodeNets.size, wantNets,
        `${path.basename(b.file)}: ${uniqueDiodeNets.size} distinct diode nets, expected ${wantNets}`);

    console.log(`  ok ${path.basename(b.file).padEnd(38)} ${switches.length} switches on the plate grid`);
}

if (missing === boards.length) {
    console.log('No boards generated yet - run `node pcb/generate_pcb.js` first.');
    process.exitCode = 1;
} else {
    console.log('✓ Plate, case and PCB agree on every switch position.');
}
