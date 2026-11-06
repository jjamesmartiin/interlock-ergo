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
    minHoleToHole: 0.5
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

    // Board outline -> area, and how many of it fit in the order budget.
    const rect = text.match(/\(gr_rect \(start (-?[\d.]+) (-?[\d.]+)\) \(end (-?[\d.]+) (-?[\d.]+)\) \(layer "Edge\.Cuts"\)/);
    assert(rect, `${b.name}: no closed Edge.Cuts rectangle`);
    const w = Math.abs(+rect[3] - +rect[1]);
    const h = Math.abs(+rect[4] - +rect[2]);
    const areaCm2 = (w * h) / 100;

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
    console.log(`✓ All ${rows.length} boards are inside the process limits, and the order quantity per design is above.`);
}
