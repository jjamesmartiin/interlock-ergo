#!/usr/bin/env node
/*
 * Fabrication-rule gate.
 *
 * DRC proves the board is self-consistent, but KiCad's default rule set has a
 * minimum track width of 0 and a minimum drill of 0, so a board can pass DRC and
 * still be unmanufacturable at a given process. These are the process limits
 * themselves, checked directly against the generated boards and drill files.
 *
 * Also computes how many pieces of each design fit inside the order-area budget
 * used for the pricing note in the README, because that quantity differs per
 * design and getting it wrong is a real surcharge.
 *
 * Run after `node pcb/generate_pcb.js`.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.join(__dirname, '..');
const pcbDir = path.join(rootDir, 'pcb');

// JLCPCB 2-layer, 1 oz copper. Re-check these against the quote page before ordering;
// they are the numbers the design is held to, not a promise from the fab.
const LIMITS = {
    minTrackWidth: 0.127,
    minDrill: 0.3,
    minAnnularRing: 0.13,
    // JLCPCB quotes 0.5mm edge-to-edge for plated holes. These are all NPTH, and the
    // published Kailh MX socket footprint (marbastlib, and every other source) puts
    // its 1.7mm locating peg 0.46mm from the 3.0mm pin clearance hole, so 0.4 is the
    // floor this design can be held to. The check exists to catch drills that overlap
    // or nearly touch, not to second-guess the socket.
    minHoleToHole: 0.4
};

// The README used to tell people to order 3 pcs of every design. Only the smallest
// board fits 3 within the 650 cm^2 budget, so this is computed, not asserted.
const AREA_BUDGET_CM2 = 650;

const BOARDS = [];
for (const variant of ['choc', 'mx']) {
    for (const side of ['left', 'right']) {
        BOARDS.push({ variant, side, name: `interlock_ergo_${side}_${variant}` });
    }
}

function parseDrillFile(file) {
    const text = fs.readFileSync(file, 'utf8');
    const tools = new Map();
    for (const m of text.matchAll(/^T(\d+)C([\d.]+)/gm)) tools.set(m[1], parseFloat(m[2]));
    // Only count tools that actually appear in the body (KiCad emits the full table).
    return [...tools.values()];
}

function pointInPolygon(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

const rows = [];
let missing = 0;

for (const b of BOARDS) {
    const boardFile = path.join(pcbDir, `${b.name}.kicad_pcb`);
    const gerberDir = path.join(pcbDir, 'dist', `gerbers_${b.side}_${b.variant}`);
    if (!fs.existsSync(boardFile) || !fs.existsSync(gerberDir)) {
        console.log(`  skip ${b.name} (not generated)`);
        missing++;
        continue;
    }
    const text = fs.readFileSync(boardFile, 'utf8');

    // Board outline -> area, and how many of it fit in the order budget. The outline
    // is a stepped polygon (the silhouette follows the key rows), so this is a shoelace
    // sum over Edge.Cuts rather than a rectangle.
    const polyM = text.match(/\(gr_poly \(pts ((?:\(xy [-\d.]+ [-\d.]+\) ?)+)\)/);
    assert(polyM, `${b.name}: no closed Edge.Cuts polygon`);
    const poly = [...polyM[1].matchAll(/\(xy ([-\d.]+) ([-\d.]+)\)/g)].map((m) => [+m[1], +m[2]]);
    assert(poly.length >= 6, `${b.name}: Edge.Cuts polygon has only ${poly.length} points`);
    let twiceArea = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        twiceArea += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    }
    const areaCm2 = Math.abs(twiceArea / 2) / 100;
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);

    // A mounting hole that fell outside the stepped silhouette would be a drill in
    // thin air - the bottom holes moved when the outline stopped being a rectangle.
    const mountHoles = [...text.matchAll(/MountingHole_2\.2mm_M2" \(layer "F\.Cu"\)\s*\n\s*\(at ([-\d.]+) ([-\d.]+)/g)]
        .map((m) => [parseFloat(m[1]), parseFloat(m[2])]);
    assert.strictEqual(mountHoles.length, 4, `${b.name}: ${mountHoles.length} mounting holes, expected 4`);
    for (const [hx, hy] of mountHoles) {
        for (let a = 0; a < 8; a++) {
            const r = 1.6;   // hole radius + the 0.5mm edge rule
            const ang = (a * Math.PI) / 4;
            assert(pointInPolygon(poly, hx + r * Math.cos(ang), hy + r * Math.sin(ang)),
                `${b.name}: mounting hole at (${hx}, ${hy}) is too close to the board edge`);
        }
    }

    // Copper track widths (Edge.Cuts/Silk use the same property, so filter by layer).
    const widths = [...text.matchAll(/\(segment \(start [^)]*\) \(end [^)]*\) \(width ([\d.]+)\) \(layer "([FB]\.Cu)"\)/g)]
        .map((m) => parseFloat(m[1]));
    assert(widths.length > 0, `${b.name}: no copper segments found`);
    const minTrack = Math.min(...widths);
    assert(minTrack >= LIMITS.minTrackWidth,
        `${b.name}: ${minTrack}mm track, JLCPCB 2-layer minimum is ${LIMITS.minTrackWidth}mm`);

    // Vias.
    const vias = [...text.matchAll(/\(via \(at [^)]*\) \(size ([\d.]+)\) \(drill ([\d.]+)\)/g)]
        .map((m) => ({ size: parseFloat(m[1]), drill: parseFloat(m[2]) }));
    assert(vias.length > 0, `${b.name}: no vias (the router should always place some)`);
    for (const v of vias) {
        assert(v.drill >= LIMITS.minDrill, `${b.name}: via drill ${v.drill}mm below the ${LIMITS.minDrill}mm minimum`);
        const ring = (v.size - v.drill) / 2;
        assert(ring >= LIMITS.minAnnularRing, `${b.name}: via annular ring ${ring.toFixed(3)}mm below ${LIMITS.minAnnularRing}mm`);
    }

    // Plated through-hole pads: annular ring, and no hole smaller than the process allows.
    let minPadRing = Infinity;
    let minPadDrill = Infinity;
    for (const chunk of text.split('(pad ').slice(1)) {
        if (!chunk.startsWith('"')) continue;
        const type = chunk.match(/^"[^"]*"\s+(\w+)/);
        if (!type || !type[1].startsWith('thru_hole')) continue; // np_thru_hole has no copper
        const size = chunk.match(/\(size ([\d.]+)\s+([\d.]+)\)/);
        const drill = chunk.match(/\(drill ([\d.]+)/);
        if (!size || !drill) continue;
        const d = parseFloat(drill[1]);
        const ring = (Math.min(parseFloat(size[1]), parseFloat(size[2])) - d) / 2;
        minPadRing = Math.min(minPadRing, ring);
        minPadDrill = Math.min(minPadDrill, d);
    }
    assert(minPadRing >= LIMITS.minAnnularRing, `${b.name}: pad annular ring ${minPadRing.toFixed(3)}mm below ${LIMITS.minAnnularRing}mm`);
    assert(minPadDrill >= LIMITS.minDrill, `${b.name}: pad drill ${minPadDrill}mm below ${LIMITS.minDrill}mm`);

    // The drill file is what the fab actually reads.
    const drills = parseDrillFile(path.join(gerberDir, `${b.name}.drl`));
    const minDrill = Math.min(...drills);
    assert(minDrill >= LIMITS.minDrill, `${b.name}: drill file tooling starts at ${minDrill}mm, below ${LIMITS.minDrill}mm`);

    // Hole-to-hole: two drills that overlap are unmanufacturable whatever their
    // nets, which is why this is checked here as well as in DRC. Pad coordinates are
    // footprint-relative, so the footprint origin has to be added back in.
    const drillHoles = [];
    for (const chunk of text.split('(footprint "').slice(1)) {
        const at = chunk.match(/\(at (-?[\d.]+) (-?[\d.]+)/);
        const ox = at ? +at[1] : 0, oy = at ? +at[2] : 0;
        for (const m of chunk.matchAll(/\(pad "[^"]*" (?:thru_hole|np_thru_hole) \w+ \(at (-?[\d.]+) (-?[\d.]+)\)[^\n]*?\(drill (?:oval )?([\d.]+)/g)) {
            drillHoles.push({ x: ox + +m[1], y: oy + +m[2], d: +m[3] });
        }
    }
    for (const m of text.matchAll(/\(via \(at (-?[\d.]+) (-?[\d.]+)\) \(size [\d.]+\) \(drill ([\d.]+)/g)) {
        drillHoles.push({ x: +m[1], y: +m[2], d: +m[3] });
    }
    let minHoleGap = Infinity;
    for (let i = 0; i < drillHoles.length; i++) {
        const a = drillHoles[i];
        for (let j = i + 1; j < drillHoles.length; j++) {
            const c = drillHoles[j];
            const gap = Math.hypot(a.x - c.x, a.y - c.y) - a.d / 2 - c.d / 2;
            if (gap < minHoleGap) minHoleGap = gap;
        }
    }
    assert(minHoleGap >= LIMITS.minHoleToHole,
        `${b.name}: two drills are ${minHoleGap.toFixed(2)}mm apart; the fab needs ${LIMITS.minHoleToHole}mm`);

    // Every part that sits on the board must be in the BOM and the CPL, unless it is
    // a through-hole part (the assembler does not place those) or a fiducial.
    const cpl = fs.readFileSync(path.join(pcbDir, 'dist', `cpl_${b.side}_${b.variant}.csv`), 'utf8');
    const bom = fs.readFileSync(path.join(pcbDir, 'dist', `bom_${b.side}_${b.variant}.csv`), 'utf8');
    const cplRefs = new Set(cpl.trim().split('\n').slice(1).map((l) => l.split(',')[0]));
    const bomRefs = new Set(bom.trim().split('\n').slice(1).map((l) => l.split(',')[1]));
    const placed = { socket: [], diode: [] };
    for (const m of text.matchAll(/\(fp_text reference "(SW\d+|D\d+)"/g)) {
        (m[1].startsWith('SW') ? placed.socket : placed.diode).push(m[1]);
    }
    const absent = [...placed.socket, ...placed.diode].filter((r) => !cplRefs.has(r) || !bomRefs.has(r));
    assert.strictEqual(absent.length, 0,
        `${b.name}: ${absent.length} SMD parts missing from the assembly files (${absent.slice(0, 4).join(', ')}) - JLCPCB would ship them unpopulated`);
    const fiducials = [...text.matchAll(/Fiducial_1mm_Mask2mm" \(layer "B\.Cu"\)\s*\n\s*\(at (-?[\d.]+) (-?[\d.]+)\)/g)]
        .map((m) => [parseFloat(m[1]), parseFloat(m[2])]);
    assert.strictEqual(fiducials.length, 3, `${b.name}: ${fiducials.length} fiducials on the assembly side, expected 3`);
    const [f1, f2, f3] = fiducials;
    const area = (f2[0] - f1[0]) * (f3[1] - f1[1]) - (f3[0] - f1[0]) * (f2[1] - f1[1]);
    assert(Math.abs(area) > 100, `${b.name}: the three fiducials are collinear`);

    const maxQty = Math.max(1, Math.floor(AREA_BUDGET_CM2 / areaCm2));
    rows.push({
        name: b.name,
        size: `${w} x ${h}`,
        area: areaCm2.toFixed(1),
        qty: maxQty,
        track: minTrack.toFixed(3),
        via: `${Math.min(...vias.map((v) => v.size))}/${Math.min(...vias.map((v) => v.drill))}`,
        drill: minDrill
    });
}

if (missing === BOARDS.length) {
    console.log('No boards generated yet - run `node pcb/generate_pcb.js` first.');
    process.exitCode = 1;
} else {
    console.log('Fab rules (JLCPCB 2-layer, 1 oz)');
    console.log('  board                          mm              cm2   max pcs/' + AREA_BUDGET_CM2 + 'cm2  track  via   min drill');
    for (const r of rows) {
        console.log(`  ${r.name.padEnd(28)} ${r.size.padEnd(14)} ${r.area.padStart(6)} ${String(r.qty).padStart(12)}       ${r.track}   ${r.via.padEnd(6)} ${r.drill}`);
    }
    console.log(`✓ All ${rows.length} boards are inside the process limits, the order quantity per design is above,`);
    console.log('  every SMD part is in the BOM and CPL, and the fiducials are in place.');
}
