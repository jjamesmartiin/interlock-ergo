#!/usr/bin/env node
/*
 * Headless STL -> PNG renderer for the README images.
 *
 * OpenSCAD's PNG export needs an OpenGL context, which is not available in this
 * build environment, so this rasterises the exported STLs directly: orthographic
 * camera, z-buffer, one directional light, 2x supersampling. No dependencies.
 *
 *   node cad/render_preview.js            # all scenes into docs/images/
 *   node cad/render_preview.js hero       # one scene
 *
 * Scenes read cad/dist/*.stl, which build_models.js produces.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const cadDir = __dirname;
const distDir = path.join(cadDir, 'dist');
const outDir = path.join(cadDir, '..', 'docs', 'images');

// ---------------------------------------------------------------- STL loading

function loadStl(file) {
    const buf = fs.readFileSync(file);
    const tris = [];
    // Binary STL: 80-byte header, uint32 count, 50 bytes per facet.
    if (buf.length >= 84) {
        const n = buf.readUInt32LE(80);
        if (buf.length === 84 + n * 50) {
            for (let i = 0; i < n; i++) {
                const o = 84 + i * 50 + 12; // skip facet normal, derive it instead
                const v = [];
                for (let k = 0; k < 9; k++) v.push(buf.readFloatLE(o + k * 4));
                tris.push([[v[0], v[1], v[2]], [v[3], v[4], v[5]], [v[6], v[7], v[8]]]);
            }
            return tris;
        }
    }
    // ASCII STL
    const text = buf.toString('utf8');
    const verts = [...text.matchAll(/vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g)]
        .map((m) => [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
    for (let i = 0; i + 2 < verts.length; i += 3) tris.push([verts[i], verts[i + 1], verts[i + 2]]);
    return tris;
}

// ---------------------------------------------------------------- 3D helpers

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
};

function transform(tris, { translate = [0, 0, 0], rotateZ = 0 } = {}) {
    const a = (rotateZ * Math.PI) / 180;
    const c = Math.cos(a), s = Math.sin(a);
    return tris.map((t) => t.map(([x, y, z]) => [
        x * c - y * s + translate[0],
        x * s + y * c + translate[1],
        z + translate[2]
    ]));
}

// ---------------------------------------------------------------- rasteriser

function render(parts, opts) {
    const { width = 1600, height = 1100, yaw = 35, pitch = 30, ss = 2, zoom = 1, pad = 0.06 } = opts;
    const W = width * ss, H = height * ss;

    const tris = [];
    for (const p of parts) {
        for (const t of p.tris) tris.push({ t, color: p.color });
    }
    // Bounding box in world space
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const { t } of tris) {
        for (const v of t) {
            for (let i = 0; i < 3; i++) {
                if (v[i] < lo[i]) lo[i] = v[i];
                if (v[i] > hi[i]) hi[i] = v[i];
            }
        }
    }
    const centre = opts.target || [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];

    // Camera basis: `dir` points from the target towards the eye.
    const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180;
    const dir = norm([Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)]);
    const right = norm(cross(dir, [0, 0, 1]));
    const up = cross(right, dir);

    // Fit the projected bounding box into the frame.
    let pxlo = Infinity, pxhi = -Infinity, pylo = Infinity, pyhi = -Infinity;
    for (const { t } of tris) {
        for (const v of t) {
            const d = sub(v, centre);
            const x = dot(d, right), y = dot(d, up);
            if (x < pxlo) pxlo = x;
            if (x > pxhi) pxhi = x;
            if (y < pylo) pylo = y;
            if (y > pyhi) pyhi = y;
        }
    }
    const scale = Math.min((W * (1 - pad)) / (pxhi - pxlo), (H * (1 - pad)) / (pyhi - pylo)) * zoom;
    const cx = (pxlo + pxhi) / 2, cy = (pylo + pyhi) / 2;

    const colour = Buffer.alloc(W * H * 3);
    const depth = new Float32Array(W * H).fill(-Infinity);
    const bg = [246, 247, 249];
    for (let i = 0; i < W * H; i++) {
        colour[i * 3] = bg[0]; colour[i * 3 + 1] = bg[1]; colour[i * 3 + 2] = bg[2];
    }

    // Lighting is defined in CAMERA space, not world space, so a face that points
    // away from the camera (an underside, a back wall) is still lit rather than
    // collapsing to a black silhouette. Key light upper-left, plus a weak rim from
    // the lower right to separate overlapping parts.
    const light = norm([-0.45, 0.55, 0.72]);
    const rim = norm([0.62, -0.38, 0.30]);

    const project = (v) => {
        const d = sub(v, centre);
        return [
            W / 2 + (dot(d, right) - cx) * scale,
            H / 2 - (dot(d, up) - cy) * scale,
            dot(d, dir)
        ];
    };

    for (const { t, color } of tris) {
        const p0 = project(t[0]), p1 = project(t[1]), p2 = project(t[2]);
        let n = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])));
        if (dot(n, dir) < 0) n = [-n[0], -n[1], -n[2]]; // two-sided
        const nv = [dot(n, right), dot(n, up), dot(n, dir)];
        const lambert = 0.30 + 0.62 * Math.max(0, dot(nv, light)) + 0.12 * Math.max(0, dot(nv, rim));
        const [r, g, bl] = color;
        const cr = Math.min(255, r * lambert), cg = Math.min(255, g * lambert), cb = Math.min(255, bl * lambert);

        const minx = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
        const maxx = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
        const miny = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
        const maxy = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
        const den = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1]);
        if (Math.abs(den) < 1e-9) continue; // edge-on

        for (let y = miny; y <= maxy; y++) {
            for (let x = minx; x <= maxx; x++) {
                const px = x + 0.5, py = y + 0.5;
                const w0 = ((p1[1] - p2[1]) * (px - p2[0]) + (p2[0] - p1[0]) * (py - p2[1])) / den;
                const w1 = ((p2[1] - p0[1]) * (px - p2[0]) + (p0[0] - p2[0]) * (py - p2[1])) / den;
                const w2 = 1 - w0 - w1;
                if (w0 < 0 || w1 < 0 || w2 < 0) continue;
                const z = w0 * p0[2] + w1 * p1[2] + w2 * p2[2];
                const idx = y * W + x;
                if (z <= depth[idx]) continue;
                depth[idx] = z;
                colour[idx * 3] = cr; colour[idx * 3 + 1] = cg; colour[idx * 3 + 2] = cb;
            }
        }
    }

    // Downsample (box filter) and pack.
    const out = Buffer.alloc(width * height * 3);
    const inv = 1 / (ss * ss);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0;
            for (let sy = 0; sy < ss; sy++) {
                for (let sx = 0; sx < ss; sx++) {
                    const i = ((y * ss + sy) * W + (x * ss + sx)) * 3;
                    r += colour[i]; g += colour[i + 1]; b += colour[i + 2];
                }
            }
            const o = (y * width + x) * 3;
            out[o] = r * inv; out[o + 1] = g * inv; out[o + 2] = b * inv;
        }
    }
    return { width, height, rgb: out };
}

// ---------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

function encodePng({ width, height, rgb }) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 2;  // colour type: truecolour
    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0; // filter: none
        rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

// ---------------------------------------------------------------- scenes


const CASE = [104, 116, 134];   // slate
const CASE_R = [126, 138, 156]; // slate, lighter: distinguishes the other half
const PLATE = [58, 68, 84];     // near-black plate
const DONGLE = [86, 100, 120];

// Mirrors interlock_params.scad / interlock_case.scad. tests/test_models.js is the
// authority on the exported sizes; these only place the parts for the camera.
const CHOC = {
    pitchX: 18.0, pitchY: 17.0, staggerMax: 1.25, rows: 5,
    wall: 4.0, seamWall: 6.0, clearance: 0.6, margin: 8.0, topBay: 28.0,
    caseDepth: 14.2, plateT: 1.2
};
const pcbW = (cols) => cols * CHOC.pitchX + 2 * CHOC.margin + CHOC.staggerMax * CHOC.pitchX;
const pcbL = () => CHOC.rows * CHOC.pitchY + 2 * CHOC.margin + CHOC.topBay;
const caseW = (cols) => CHOC.wall + pcbW(cols) + CHOC.seamWall + CHOC.clearance;
const caseL = () => 2 * CHOC.wall + pcbL() + CHOC.clearance;
const cavX = CHOC.wall + CHOC.clearance / 2;
const cavY = CHOC.wall + CHOC.clearance / 2;
const rightCavX = CHOC.seamWall + CHOC.clearance / 2;
const plateAt = () => [cavX + CHOC.margin, cavY + CHOC.topBay + CHOC.margin, CHOC.caseDepth - CHOC.plateT];
const rightPlateAt = () => [rightCavX + CHOC.margin, cavY + CHOC.topBay + CHOC.margin, CHOC.caseDepth - CHOC.plateT];
const leftW = caseW(6);

const scenes = {
    // Both halves docked - the product shot.
    hero: () => ({
        parts: [
            { tris: transform(loadStl(path.join(distDir, 'interlock_choc_left.stl')), {}), color: CASE },
            { tris: transform(loadStl(path.join(distDir, 'interlock_choc_right.stl')), { translate: [leftW, 0, 0] }), color: CASE_R },
            { tris: transform(loadStl(path.join(distDir, 'interlock_plate_choc_left.stl')), { translate: plateAt() }), color: PLATE },
            { tris: transform(loadStl(path.join(distDir, 'interlock_plate_choc_right.stl')), { translate: [leftW + rightPlateAt()[0], rightPlateAt()[1], rightPlateAt()[2]] }), color: PLATE }
        ],
        opts: { yaw: 90, pitch: 38, width: 1600, height: 700, zoom: 1 }
    }),

    'case-left': () => ({
        parts: [{ tris: loadStl(path.join(distDir, 'interlock_choc_left.stl')), color: CASE }],
        opts: { yaw: 62, pitch: 28, width: 1200, height: 820 }
    }),

    'case-right': () => ({
        parts: [{ tris: loadStl(path.join(distDir, 'interlock_choc_right.stl')), color: CASE_R }],
        opts: { yaw: 118, pitch: 28, width: 1200, height: 820 }
    }),

    'case-underside': () => ({
        parts: [{ tris: loadStl(path.join(distDir, 'interlock_choc_left.stl')), color: CASE }],
        opts: { yaw: 208, pitch: -26, width: 1200, height: 820 }
    }),

    plates: () => ({
        parts: [
            { tris: loadStl(path.join(distDir, 'interlock_plate_choc_left.stl')), color: PLATE },
            { tris: transform(loadStl(path.join(distDir, 'interlock_plate_choc_right.stl')), { translate: [145, 0, 0] }), color: PLATE }
        ],
        opts: { yaw: 90, pitch: 89, width: 1300, height: 600, zoom: 0.95 }
    }),

    dongle: () => ({
        parts: [{ tris: loadStl(path.join(distDir, 'dongle_case.stl')), color: DONGLE }],
        opts: { yaw: 42, pitch: 30, width: 900, height: 560, zoom: 1 }
    })
};

// ---------------------------------------------------------------- main

// Coarse luma map, so a render can be sanity-checked without opening the PNG.
function asciiPreview({ width, height, rgb }, cols = Number(process.env.ASCII_COLS||78)) {
    const rows = Math.max(8, Math.round((cols * height) / width / 2.1));
    const ramp = ' .:-=+*#%@';
    const lines = [];
    for (let r = 0; r < rows; r++) {
        let line = '';
        for (let c = 0; c < cols; c++) {
            const x = Math.floor(((c + 0.5) / cols) * width);
            const y = Math.floor(((r + 0.5) / rows) * height);
            const i = (y * width + x) * 3;
            const luma = 0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2];
            const k = Math.min(ramp.length - 1, Math.max(0, Math.round(((255 - luma) / 255) * (ramp.length - 1) * 1.4)));
            line += ramp[k];
        }
        lines.push(line);
    }
    return lines.join('\n');
}

const wanted = process.argv[2] ? [process.argv[2]] : Object.keys(scenes);
fs.mkdirSync(outDir, { recursive: true });

for (const name of wanted) {
    const make = scenes[name];
    if (!make) {
        console.error(`Unknown scene "${name}". Known: ${Object.keys(scenes).join(', ')}`);
        process.exitCode = 1;
        continue;
    }
    const { parts, opts } = make();
    const img = render(parts, opts);
    if (process.env.ASCII) console.log(asciiPreview(img));
    const png = encodePng(img);
    const out = path.join(outDir, `${name}.png`);
    fs.writeFileSync(out, png);
    const tris = parts.reduce((n, p) => n + p.tris.length, 0);
    console.log(`rendered ${path.relative(process.cwd(), out)}  (${opts.width}x${opts.height}, ${tris} triangles, ${(png.length / 1024).toFixed(0)} KB)`);
}
