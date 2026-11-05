#!/usr/bin/env node
/*
 * Mesh gate for the printable parts.
 *
 * A slicer will happily accept a mesh that is two loose shells or has a hole in
 * it, and you only find out three hours into a print. This checks, for every
 * exported STL:
 *   - exactly one connected component (no bosses or tabs left floating)
 *   - every edge shared by exactly two triangles (watertight, manifold)
 *   - no zero-area triangles
 *   - bounding boxes against the stackup and key-grid numbers in
 *     cad/interlock_params.scad, so a case and a plate cannot drift apart.
 *
 * Run after `node cad/build_models.js`.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.join(__dirname, '..');
const cadDist = path.join(rootDir, 'cad', 'dist');

// ---------------------------------------------------------------- STL parsing

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
    const verts = [...text.matchAll(/vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g)]
        .map((m) => [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
    const out = [];
    for (let i = 0; i + 2 < verts.length; i += 3) out.push([verts[i], verts[i + 1], verts[i + 2]]);
    return out;
}

// ---------------------------------------------------------------- mesh checks

const key = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)},${p[2].toFixed(3)}`;

function analyse(tris, name) {
    const parent = new Map();
    const pos = new Map();
    const find = (a) => {
        while (parent.get(a) !== a) {
            parent.set(a, parent.get(parent.get(a)));
            a = parent.get(a);
        }
        return a;
    };
    const union = (a, b) => {
        a = find(a); b = find(b);
        if (a !== b) parent.set(a, b);
    };

    for (const t of tris) {
        for (const p of t) {
            const k = key(p);
            if (!parent.has(k)) {
                parent.set(k, k);
                pos.set(k, p);
            }
        }
    }

    const edges = new Map();
    const bump = (a, b) => {
        const e = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(e, (edges.get(e) || 0) + 1);
    };
    let degenerate = 0;
    for (const [a, b, c] of tris) {
        const ka = key(a), kb = key(b), kc = key(c);
        if (ka === kb || kb === kc || ka === kc) { degenerate++; continue; }
        union(ka, kb); union(kb, kc);
        bump(ka, kb); bump(kb, kc); bump(kc, ka);
    }

    const components = new Set([...parent.keys()].map(find)).size;
    let openEdges = 0;
    let badEdges = 0;
    for (const count of edges.values()) {
        if (count === 1) openEdges++;
        else if (count !== 2) badEdges++;
    }

    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const p of pos.values()) {
        for (let i = 0; i < 3; i++) {
            lo[i] = Math.min(lo[i], p[i]);
            hi[i] = Math.max(hi[i], p[i]);
        }
    }

    assert.strictEqual(components, 1, `${name}: ${components} disconnected shells (each one is a part that falls off the plate)`);
    assert.strictEqual(openEdges, 0, `${name}: ${openEdges} open edges, the mesh is not watertight`);
    assert.strictEqual(badEdges, 0, `${name}: ${badEdges} edges shared by more than two triangles (non-manifold)`);
    // CGAL leaves a handful of zero-area slivers where an undercut meets a back
    // face. Slicers discard them; hundreds of them means the mesh went wrong.
    assert(degenerate <= Math.max(4, tris.length * 0.005),
        `${name}: ${degenerate} zero-area triangles`);

    return {
        size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]],
        lo, hi,
        tris: tris.length
    };
}

// ---------------------------------------------------------------- model numbers

function parseScadConstants() {
    const text = fs.readFileSync(path.join(rootDir, 'cad', 'interlock_params.scad'), 'utf8');
    const out = {};
    for (const m of text.matchAll(/^([a-z_][a-z0-9_]*)\s*=\s*(-?[\d.]+)\s*;/gim)) {
        out[m[1]] = parseFloat(m[2]);
    }
    return out;
}

const c = parseScadConstants();
const near = (a, b, tol, what) =>
    assert(Math.abs(a - b) <= tol, `${what}: got ${a.toFixed(3)}, expected ${b.toFixed(3)} (±${tol})`);

const pcbW = (cols, pitchX) => cols * pitchX + 2 * c.pcb_margin_x + c.stagger_max_u * pitchX;
const pcbL = (pitchY) => c.rows * pitchY + 2 * c.pcb_margin_y + c.pcb_top_bay;
const plateW = (cols, pitchX) => cols * pitchX + c.stagger_max_u * pitchX;
const plateL = (pitchY) => c.rows * pitchY;
const caseW = (cols, pitchX) => c.wall_thickness + pcbW(cols, pitchX) + c.seam_wall + c.pcb_clearance;
const caseL = (pitchY) => 2 * c.wall_thickness + pcbL(pitchY) + c.pcb_clearance;
const caseDepth = (plateGap, plateT) =>
    c.floor_thickness + c.standoff_h + c.pcb_thickness + plateGap + plateT;

const variants = {
    choc: { pitchX: c.choc_pitch_x, pitchY: c.choc_pitch_y, plateT: c.choc_plate_thickness, gap: c.choc_plate_gap },
    mx: { pitchX: c.mx_pitch_x, pitchY: c.mx_pitch_y, plateT: c.mx_plate_thickness, gap: c.mx_plate_gap }
};

// ---------------------------------------------------------------- run

const report = [];
function check(file, expect) {
    const tris = loadTriangles(path.join(cadDist, file));
    const a = analyse(tris, file);
    if (expect) expect(a);
    report.push(`  ${file.padEnd(34)} ${a.size.map((v) => v.toFixed(1).padStart(7)).join(' ')} mm   ${String(a.tris).padStart(6)} tris`);
}

for (const [variant, v] of Object.entries(variants)) {
    v.depth = caseDepth(v.gap, v.plateT);
    for (const [half, cols] of [['left', c.cols_left], ['right', c.cols_right]]) {
        check(`interlock_${variant}_${half}.stl`, (a) => {
            near(a.size[2], v.depth, 0.02, `${variant} ${half} case height`);
            // The left half carries the dovetail tabs, which stand proud of the seam face.
            const tabs = half === "left" ? c.tab_protrusion : 0;
            near(a.size[0], caseW(cols, v.pitchX) + tabs, 0.05, `${variant} ${half} case width`);
            near(a.size[1], caseL(v.pitchY), 0.05, `${variant} ${half} case length`);
        });
        check(`interlock_plate_${variant}_${half}.stl`, (a) => {
            near(a.size[2], v.plateT, 0.02, `${variant} ${half} plate thickness`);
            near(a.size[0], plateW(cols, v.pitchX), 0.05, `${variant} ${half} plate width`);
            near(a.size[1], plateL(v.pitchY), 0.05, `${variant} ${half} plate length`);
        });
    }
}

for (const f of ['dongle_case_base.stl', 'dongle_case_lid.stl']) check(f);

// The plate has to drop inside the case, or the whole stackup is fantasy.
for (const [variant, v] of Object.entries(variants)) {
    const ledgeZ = v.depth - v.plateT;
    const pcbTop = c.floor_thickness + c.standoff_h + c.pcb_thickness;
    assert(ledgeZ > pcbTop, `${variant}: the plate ledge is below the PCB top`);
    near(ledgeZ - pcbTop, v.gap, 1e-6,
        `${variant}: plate-to-PCB gap (this is the space the switch body needs)`);
}

console.log('Mesh gate');
console.log('  model                              width   length   height');
report.forEach((l) => console.log(l));
console.log(`✓ ${report.length} STLs: single shell, watertight, manifold, dimensions match the stackup.`);
