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

// Which matrix positions actually carry a switch: the left bottom row skips one, and
// the right half's home row stops short at Enter.
function hasSwitch(side, r, col) {
    if (side === 'left') {
        if (r === 4 && col === 4) return false;   // omitted space position
        return true;
    }
    if (r === 2 && col === 7) return false;       // home row ends at Enter (7 keys)
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

    // Every switch must reach the matrix through its own diode net: a shared net
    // silently couples two keys, and the board still passes DRC.
    const diodeNets = [...fs.readFileSync(b.file, 'utf8').matchAll(/\(net \d+ "(SW_D_R\d+_C\d+)"\)/g)]
        .map((m) => m[1]);
    const uniqueDiodeNets = new Set(diodeNets);
    const wantNets = expected.length;
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

// ------------------------------------------------------------------ solids
//
// The PCB is only half the chain: the plate is generated in OpenSCAD and exported
// to STL, so "the plate has a hole where the PCB has a switch" is a claim about a
// mesh. These sample the exported meshes directly - a vertical ray-cast per point,
// odd crossings means the point is inside the solid. That catches a plate whose
// apertures drifted from the keymap, and a case whose plate rebate is not where the
// plate is, which no dimension check would see.

function loadTriangles(file) {
    const buf = fs.readFileSync(file);
    if (buf.length >= 84) {
        const n = buf.readUInt32LE(80);
        if (buf.length === 84 + n * 50) {
            const out = [];
            for (let i = 0; i < n; i++) {
                const o = 84 + i * 50 + 12;
                const v = [];
                for (let k = 0; k < 9; k++) v.push(buf.readFloatLE(o + k * 4));
                out.push([[v[0], v[1], v[2]], [v[3], v[4], v[5]], [v[6], v[7], v[8]]]);
            }
            return out;
        }
    }
    const text = buf.toString('utf8');
    const v = [...text.matchAll(/vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g)]
        .map((m) => [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
    const out = [];
    for (let i = 0; i + 2 < v.length; i += 3) out.push([v[i], v[i + 1], v[i + 2]]);
    return out;
}

// True if (x, y, z) is inside the mesh: count crossings of a ray that is tilted a
// hair off vertical (Moller-Trumbore). A straight +Z ray lands exactly on
// triangulation edges whenever the sample point has a round coordinate, and the
// crossing is then counted twice, flipping the parity. The tilt costs 0.016mm of
// drift over a 1.2mm plate, which is nothing against a 0.2mm probe step.
const RAY_X = 0.0137, RAY_Y = 0.0091;
function insideMesh(tris, x, y, z) {
    let crossings = 0;
    for (const [a, b, c] of tris) {
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const p = [RAY_Y * e2[2] - e2[1], e2[0] - RAY_X * e2[2], RAY_X * e2[1] - RAY_Y * e2[0]];
        const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        const tv = [x - a[0], y - a[1], z - a[2]];
        const u = (tv[0] * p[0] + tv[1] * p[1] + tv[2] * p[2]) * inv;
        if (u < 0 || u > 1) continue;
        const q = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
        const vv = (RAY_X * q[0] + RAY_Y * q[1] + q[2]) * inv;
        if (vv < 0 || u + vv > 1) continue;
        const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
        if (t > 0) crossings++;
    }
    return crossings % 2 === 1;
}

let meshChecked = 0;
for (const [variant, v] of Object.entries(variants)) {
    const plateT = variant === 'mx' ? c.mx_plate_thickness : c.choc_plate_thickness;
    const caseDepth = c.floor_thickness + c.standoff_h + c.pcb_thickness +
        (variant === 'mx' ? c.mx_plate_gap : c.choc_plate_gap) + plateT;
    const ledgeZ = caseDepth - plateT;

    for (const side of ['left', 'right']) {
        const plateFile = path.join(rootDir, 'cad', 'dist', `interlock_plate_${variant}_${side}.stl`);
        const caseFile = path.join(rootDir, 'cad', 'dist', `interlock_${variant}_${side}.stl`);
        if (!fs.existsSync(plateFile) || !fs.existsSync(caseFile)) {
            console.log(`  skip ${variant} ${side} meshes (run node cad/build_models.js)`);
            continue;
        }
        const plate = loadTriangles(plateFile);
        const kase = loadTriangles(caseFile);

        // Plate-local aperture centre, from the same grid the plate module uses.
        const apX = (r, col) => v.pitchX / 2 + col * v.pitchX + stagger[r] * v.pitchX;
        const apY = (r) => v.pitchY / 2 + r * v.pitchY;
        const zMid = plateT / 2;
        const hasAp = (r, col) => hasSwitch(side, r, col);
        const cols = COLS[side];

        const bad = [];
        // Each aperture is 14.0mm square, so probe just
        // inside and just outside its edge on both axes. That pins the hole to
        // +/-0.25mm in position and edge-to-edge size - a uniform 1mm shift of the
        // whole grid is invisible to a single centre sample, and this catches it.
        const half = () => c.choc_switch_cutout / 2;
        for (let r = 0; r < 5; r++) {
            for (let col = 0; col < cols; col++) {
                if (!hasAp(r, col)) continue;
                const cx = apX(r, col), cy = apY(r), h = half(r, col);
                const insideBy = h - 0.2, outsideBy = h + 0.3;
                for (const [dx, dy, want] of [
                    [-insideBy, 0, false], [insideBy, 0, false], [0, -insideBy, false], [0, insideBy, false],
                    [-outsideBy, 0, true], [outsideBy, 0, true], [0, -outsideBy, true], [0, outsideBy, true]
                ]) {
                    const solid = insideMesh(plate, cx + dx, cy + dy, zMid);
                    if (solid !== want) {
                        bad.push(`row ${r} col ${col}: ${want ? "no material" : "no hole"} at ${dx >= 0 ? "+" : ""}${dx.toFixed(2)},${dy >= 0 ? "+" : ""}${dy.toFixed(2)} from the aperture centre`);
                    }
                }
            }
        }
        // Web between horizontally adjacent apertures must be solid plate.
        for (let r = 0; r < 5; r++) {
            for (let col = 0; col + 1 < cols; col++) {
                if (!hasAp(r, col) || !hasAp(r, col + 1)) continue;
                if (!insideMesh(plate, apX(r, col) + v.pitchX / 2, apY(r), zMid)) {
                    bad.push(`no material between row ${r} cols ${col}/${col + 1}`);
                }
            }
        }
        assert.strictEqual(bad.length, 0,
            `interlock_plate_${variant}_${side}.stl: ${bad.slice(0, 4).join("; ")}`);

        // The case must follow the same band outline as the PCB, with the plate rebate
        // cut where the plate actually is. Sampled per row, because the silhouette steps
        // between rows - one sample at mid-height would miss a wall in the wrong place.
        const wallL = side === 'left' ? c.wall_thickness : c.seam_wall;
        const cavX = wallL + c.pcb_clearance / 2;
        const cavY = c.wall_thickness + c.pcb_clearance / 2;
        const py = cavY + TOP_BAY + MARGIN_Y;
        const plateW = cols * v.pitchX + c.stagger_max_u * v.pitchX;
        const plateL = 5 * v.pitchY;
        const zAbove = ledgeZ + 0.2;
        const inw = side === 'left' ? 1 : -1;   // toward the middle of the board
        // Same band edges the PCB generator and interlock_params.scad derive.
        const rowEdge = (r) => side === 'left'
            ? stagger[r] * v.pitchX
            : MARGIN_X + (stagger[r] + cols) * v.pitchX + MARGIN_X;
        const keyFieldOuter = (r) => side === 'left'
            ? MARGIN_X + stagger[r] * v.pitchX
            : MARGIN_X + (stagger[r] + cols) * v.pitchX;

        assert(!insideMesh(kase, cavX + keyFieldOuter(0) + plateW * 0.4, py + plateL / 2, zAbove),
            `interlock_${variant}_${side}.stl: no opening for the plate at its centre - the plate would not drop in`);
        assert(!insideMesh(kase, cavX + keyFieldOuter(0) + 1, py + plateL / 2, ledgeZ - 0.2),
            `interlock_${variant}_${side}.stl: the cavity is not open below the plate ledge`);
        for (let r = 0; r < 5; r++) {
            const midY = py + (r + 0.5) * v.pitchY;
            const wallX = cavX + rowEdge(r) - inw * (c.wall_thickness + c.pcb_clearance / 2 - c.wall_thickness / 2);
            assert(insideMesh(kase, wallX, midY, zAbove),
                `interlock_${variant}_${side}.stl: no case wall at the row ${r} silhouette edge`);
            const shelfX = cavX + keyFieldOuter(r) - inw * 0.6;
            assert(insideMesh(kase, shelfX, midY, zAbove),
                `interlock_${variant}_${side}.stl: no shelf for the plate at row ${r}`);
            const rebateX = cavX + keyFieldOuter(r) + inw * 0.4;
            assert(!insideMesh(kase, rebateX, midY, zAbove),
                `interlock_${variant}_${side}.stl: the plate rebate is not open at row ${r}`);
        }

        // A boss under every PCB mounting hole, tall enough to meet the PCB.
        const be = rowEdge(4);
        const boardWt = cols * v.pitchX + 2 * MARGIN_X + c.stagger_max_u * v.pitchX;
        const holes = [[4, 4], [boardWt - 4, 4],
                       [side === 'left' ? be + 4 : be - 4, 5 * v.pitchY + 2 * MARGIN_Y + TOP_BAY - 4],
                       [side === 'left' ? boardWt - 4 : 4, 5 * v.pitchY + 2 * MARGIN_Y + TOP_BAY - 4]];
        for (const [hx, hy] of holes) {
            // Sample the boss ring, not its 1.6mm screw pilot.
            assert(insideMesh(kase, cavX + hx - 2.2, cavY + hy, c.floor_thickness + 0.6),
                `interlock_${variant}_${side}.stl: no boss under the PCB mounting hole at (${hx.toFixed(1)}, ${hy.toFixed(1)})`);
            assert(insideMesh(kase, cavX + hx - 2.2, cavY + hy, c.floor_thickness + c.standoff_h - 0.3),
                `interlock_${variant}_${side}.stl: the boss under (${hx.toFixed(1)}, ${hy.toFixed(1)}) is too short`);
        }

        // USB-C: the window has to be open through the front wall, with the exterior
        // relief pocket for the cable overmold. Both have shipped broken here: the
        // window stopped 1.3mm short of the outer face (a membrane over the port) and
        // the dongle's was extruded outside the case. A dimension check sees neither.
        const pw = cols * v.pitchX + 2 * MARGIN_X + c.stagger_max_u * v.pitchX;
        const mcuX = cavX + pw / 2;
        const zWin = c.floor_thickness + c.standoff_h + c.pcb_thickness + 2.0;
        assert(!insideMesh(kase, mcuX, 1.0, zWin),
            `interlock_${variant}_${side}.stl: the USB-C window is blocked - a plug cannot reach the controller`);
        assert(!insideMesh(kase, mcuX + c.usb_relief_w / 2 - 1.0, 0.3, zWin),
            `interlock_${variant}_${side}.stl: no exterior relief pocket beside the USB-C window`);
        assert(insideMesh(kase, mcuX, 1.0, zWin - c.usb_relief_h / 2 - 0.6),
            `interlock_${variant}_${side}.stl: the USB-C relief is a slot, not a pocket`);
        assert(insideMesh(kase, mcuX + 40, 1.0, zWin),
            `interlock_${variant}_${side}.stl: the front wall is missing beside the USB-C window`);

        meshChecked++;
        console.log(`  ok ${`${variant} ${side} plate + case`.padEnd(38)} apertures, webs and rebate sampled in the meshes`);
    }
}

if (meshChecked) console.log(`✓ ${meshChecked} plate/case pairs: every aperture, web and rebate is where the plan says.`);

// The dongle's USB-C window: open through the 1.4mm wall, and open through the
// lid's lip, which sits directly in front of the connector.
{
    const src = fs.readFileSync(path.join(rootDir, 'cad', 'dongle_case.scad'), 'utf8');
    const d = {};
    for (const m of src.matchAll(/^([a-z_][a-z0-9_]*)\s*=\s*(-?[\d.]+)\s*;/gm)) d[m[1]] = parseFloat(m[2]);
    const base = path.join(rootDir, 'cad', 'dist', 'dongle_case_base.stl');
    const lid = path.join(rootDir, 'cad', 'dist', 'dongle_case_lid.stl');
    if (fs.existsSync(base) && fs.existsSync(lid)) {
        const xUsb = (d.board_l + 1.2 + 2 * d.wall) / 2;
        const zUsb = d.floor_t + d.standoff + d.board_t + 1.4;
        assert(!insideMesh(loadTriangles(base), xUsb, d.wall / 2, zUsb),
            'dongle base: the USB-C window is blocked by the wall - a plug cannot reach the XIAO');
        assert(!insideMesh(loadTriangles(lid), xUsb, d.wall + d.fit + 0.5, zUsb),
            'dongle lid: the lip blocks the USB-C window');
        assert(insideMesh(loadTriangles(base), xUsb + 10, d.wall / 2, zUsb),
            'dongle base: the short wall is missing beside the USB-C window');
        console.log('  ok dongle base + lid'.padEnd(42) + 'USB-C window open through wall and lip');
    }
}

// ------------------------------------------------------- hotswap footprint
//
// The one defect that produces a scrap board rather than a build problem. A
// hotswap socket does not solder to the switch pin positions: its two solder pads
// sit about 3.275mm outboard of the pins, and each pin needs a 3.0mm clearance hole
// for the socket body to sit in. Verified against marbastlib's
// SW_choc_v1_HS_CPG135001S30_1u / SW_MX_HS_CPG151101S11 and ergogen's choc.js and
// mx.js, which agree. A pad on the pin position is invisible to DRC and to the
// netlist check - it is electrically perfect and mechanically unsolderable.
// Choc: marbastlib and keebio agree on 3.245. MX: ergogen says 3.275/3.302,
// marbastlib says 3.55 - the sources disagree by 0.275mm, which a 2.55mm-wide pad
// absorbs, so the window covers both rather than picking a winner.
const OUTBOARD_MIN = 3.10;
const OUTBOARD_MAX = 3.60;

for (const b of boards) {
    if (!fs.existsSync(b.file)) continue;
    const text = fs.readFileSync(b.file, 'utf8');
    const chunks = text.split('(footprint "').slice(1)
        .filter((chunk) => /^Kailh_(Choc|MX)_/.test(chunk));

    const bad = [];
    for (const chunk of chunks) {
        const pads = [];
        for (const m of chunk.matchAll(/\(pad "([^"]*)" (\w+) (\w+) \(at (-?[\d.]+) (-?[\d.]+)[^)]*\)/g)) {
            const window = chunk.slice(m.index, m.index + 420);
            const size = window.match(/\(size ([\d.]+) ([\d.]+)\)/);
            const drill = window.match(/\(drill ([\d.]+)/);
            pads.push({
                num: m[1], type: m[2],
                x: parseFloat(m[4]), y: parseFloat(m[5]),
                w: size ? parseFloat(size[1]) : null,
                drill: drill ? parseFloat(drill[1]) : null
            });
        }
        const smd = pads.filter((p) => p.type === 'smd');
        const pinHoles = pads.filter((p) => p.type === 'np_thru_hole' && p.drill !== null && Math.abs(p.drill - 3.0) < 0.01);

        if (smd.length !== 2) bad.push(`${smd.length} solder pads, expected 2`);
        if (pinHoles.length !== 2) bad.push(`${pinHoles.length} 3.0mm pin clearance holes, expected 2`);

        for (const pad of smd) {
            const host = pinHoles.reduce((best, h) => {
                const d = Math.hypot(pad.x - h.x, pad.y - h.y);
                return d < best.d ? { d, h } : best;
            }, { d: Infinity, h: null });
            if (!host.h) continue;
            const outboard = Math.abs(pad.x - host.h.x);
            if (Math.abs(pad.y - host.h.y) > 0.01 || outboard < OUTBOARD_MIN || outboard > OUTBOARD_MAX) {
                bad.push(`pad ${pad.num} at (${pad.x}, ${pad.y}) is ${outboard.toFixed(3)}mm outboard of its pin hole - expected ${OUTBOARD_MIN}-${OUTBOARD_MAX}mm, same y`);
            }
            if (pad.w === null || pad.w < 2.5) bad.push(`pad ${pad.num} is only ${pad.w}mm wide; the socket tab needs >=2.5mm`);
        }
    }
    assert.strictEqual(bad.length, 0,
        `${path.basename(b.file)}: hotswap footprint is not solderable - ${[...new Set(bad)].slice(0, 3).join('; ')}`);
    console.log(`  ok ${path.basename(b.file).padEnd(38)} ${chunks.length} hotswap footprints: pads outboard of 3.0mm pin holes`);
}

console.log('✓ Every hotswap footprint matches the socket, not the switch pin.');
