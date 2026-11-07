const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pcbDir = __dirname;
const distDir = path.join(pcbDir, 'dist');
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

// ANSI row stagger, in key units, indexed by row (0 = number row). ANSI's stagger
// comes from starting each row with a wide modifier; with 1u keys the row itself has
// to move, so offset = (KLE first-key width - 1u) and every letter column keeps its
// ANSI x. Must match row_stagger_u in cad/interlock_params.scad.
const ROW_STAGGER_U = [0, 0.5, 0.75, 1.25, 0.25];
const STAGGER_MAX_U = 1.25;

console.log('--- Generating Electrically-Verified Interlock Ergo KiCad PCBs ---');

/* Gerber packaging is done in-process (see writeZip) because `zip` is not
 * reliably in PATH and the nix-shell fallback mangles extra arguments. */

/* Minimal deterministic ZIP writer (deflate, no external tool needed).
 * `zip` is not guaranteed to be in PATH and shelling out to nix-shell mangles
 * the arguments, so gerber packaging is done in-process. */
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
/* KiCad stamps a creation date into every gerber, the .gbrjob and the DRC report,
 * so two runs from identical sources produce byte-different artifacts and the
 * working tree is dirty after every build. Pin the timestamps: the fab files are
 * then reproducible, which means a committed gerber set can be diffed and a
 * "the gerbers changed" commit actually means the copper changed. */
function pinTimestamps(dir) {
    const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2})?/g;
    const LOCAL = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g;
    const pin = (text) => text.replace(ISO, "1970-01-01T00:00:00+00:00").replace(LOCAL, "1970-01-01 00:00:00");
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        let text;
        try { text = fs.readFileSync(p, "utf8"); } catch { continue; }
        if (!text.includes("\u0000")) fs.writeFileSync(p, pin(text));
    }
}

function writeZip(zipPath, dir) {
    const zlib = require('zlib');
    const names = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort();
    const locals = [];
    const central = [];
    let offset = 0;
    for (const name of names) {
        const raw = fs.readFileSync(path.join(dir, name));
        const deflated = zlib.deflateRawSync(raw, { level: 9 });
        const crc = crc32(raw);
        const nameBuf = Buffer.from(name, 'utf8');

        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0);
        lh.writeUInt16LE(20, 4);
        lh.writeUInt16LE(0, 6);
        lh.writeUInt16LE(8, 8);
        lh.writeUInt16LE(0, 10);
        lh.writeUInt16LE(0x0021, 12);      // 1980-01-01, deterministic
        lh.writeUInt32LE(crc, 14);
        lh.writeUInt32LE(deflated.length, 18);
        lh.writeUInt32LE(raw.length, 22);
        lh.writeUInt16LE(nameBuf.length, 26);
        lh.writeUInt16LE(0, 28);
        locals.push(lh, nameBuf, deflated);

        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0);
        ch.writeUInt16LE(20, 4);
        ch.writeUInt16LE(20, 6);
        ch.writeUInt16LE(0, 8);
        ch.writeUInt16LE(8, 10);
        ch.writeUInt16LE(0, 12);
        ch.writeUInt16LE(0x0021, 14);
        ch.writeUInt32LE(crc, 16);
        ch.writeUInt32LE(deflated.length, 20);
        ch.writeUInt32LE(raw.length, 24);
        ch.writeUInt16LE(nameBuf.length, 28);
        ch.writeUInt32LE(offset, 42);
        central.push(ch, nameBuf);

        offset += lh.length + nameBuf.length + deflated.length;
    }
    const cdBuf = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(names.length, 8);
    eocd.writeUInt16LE(names.length, 10);
    eocd.writeUInt32LE(cdBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    fs.writeFileSync(zipPath, Buffer.concat([...locals, cdBuf, eocd]));
}

/* ---------------------------------------------------------------------------
 * Electrical self-check
 *
 * Reads the board back out of the file that was just written and diffs every
 * switch, diode, encoder, power and controller pad against the electrical truth
 * taken from the ZMK overlays (which pro_micro pin carries which row/column) and
 * the dtsi matrix map. A routing or mapping regression cannot ship silently.
 * ------------------------------------------------------------------------- */
function verifyNetlist(cfg) {
    const { file, side, cols, colOffset, activeKeys, PROMICRO_PAD_SIGNALS, podSignals } = cfg;
    const shieldDir = path.join(__dirname, '..', 'config', 'boards', 'shields', 'interlock_ergo');
    const overlay = fs.readFileSync(path.join(shieldDir, `interlock_ergo_${side}.overlay`), 'utf8');
    const dtsi = fs.readFileSync(path.join(shieldDir, 'interlock_ergo.dtsi'), 'utf8');

    const gpioList = (key) => {
        const m = overlay.match(new RegExp(`${key}\\s*=([\\s\\S]*?);`));
        if (!m) throw new Error(`netlist check: no ${key} in the ${side} overlay`);
        return [...m[1].matchAll(/&pro_micro\s+(\d+)/g)].map((x) => parseInt(x[1], 10));
    };
    // `&pro_micro N` in ZMK is Arduino D-number N, not a physical pad index; the
    // PCB's PROMICRO_PAD_SIGNALS table is what maps a physical pad to that signal.
    const dNet = (d) => {
        if (!PROMICRO_PAD_SIGNALS.includes(`D${d}`)) {
            throw new Error(`netlist check: controller has no D${d} pad`);
        }
        return podSignals[`D${d}`] || '';
    };
    const padNet = (pad) => podSignals[PROMICRO_PAD_SIGNALS[pad - 1]] || '';

    // 1. The overlay's gpio lists must be exactly the rows/columns this PCB carries.
    const rowPins = gpioList('row-gpios');
    const colPins = gpioList('col-gpios');
    if (colPins.length !== cols) {
        throw new Error(`netlist check: ${side} overlay has ${colPins.length} col-gpios, board has ${cols} columns`);
    }
    rowPins.forEach((pin, r) => {
        if (dNet(pin) !== `ROW${r}`) {
            throw new Error(`netlist check: overlay puts ROW${r} on pro_micro ${pin} (D${pin}), the PCB maps that signal to "${dNet(pin)}"`);
        }
    });
    colPins.forEach((pin, i) => {
        const want = `COL${colOffset + i}`;
        if (dNet(pin) !== want) {
            throw new Error(`netlist check: overlay puts ${want} on pro_micro ${pin} (D${pin}), the PCB maps that signal to "${dNet(pin)}"`);
        }
    });

    // 2. The dtsi matrix map must be the same set of RC() positions as the placed keys.
    const dtsiKeys = [...dtsi.matchAll(/RC\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)]
        .map((m) => ({ r: parseInt(m[1], 10), c: parseInt(m[2], 10) }))
        .filter((k) => k.c >= colOffset && k.c < colOffset + cols);
    // activeKeys use board-local column indices; the dtsi map uses absolute ones
    const want = new Set(activeKeys.map((k) => `${k.r},${colOffset + k.c}`));
    const got = new Set(dtsiKeys.map((k) => `${k.r},${k.c}`));
    if (want.size !== got.size || [...want].some((k) => !got.has(k))) {
        throw new Error(
            `netlist check: ${side} PCB places ${want.size} keys but the dtsi map has ${got.size}` +
            ` (missing ${[...want].filter((k) => !got.has(k))}, extra ${[...got].filter((k) => !want.has(k))})`
        );
    }

    // 3. Every pad's net must match the intent.
    const expected = new Map();
    for (let p = 1; p <= 24; p++) expected.set(`U1|${p}`, padNet(p));
    activeKeys.forEach((k, i) => {
        const n = i + 1;
        const isEncPos = side === 'left' && k.r === 0 && k.c === 0;
        if (!isEncPos) {
            expected.set(`SW${n}|1`, `COL${colOffset + k.c}`);
            expected.set(`SW${n}|2`, `SW_D_R${k.r}_C${k.c}`);
        }
        expected.set(`D${n}|1`, `ROW${k.r}`);
        expected.set(`D${n}|2`, `SW_D_R${k.r}_C${k.c}`);
    });
    let encPins = [];
    if (side === 'left') {
        const single = (key) => {
            const m = overlay.match(new RegExp(`${key}\\s*=\\s*<&pro_micro\\s+(\\d+)`));
            if (!m) throw new Error(`netlist check: no ${key} in the ${side} overlay`);
            return parseInt(m[1], 10);
        };
        const aPin = single('a-gpios'), bPin = single('b-gpios');
        if (dNet(aPin) !== 'ENC_A') throw new Error('netlist check: overlay encoder A is not on the ENC_A pad');
        if (dNet(bPin) !== 'ENC_B') throw new Error('netlist check: overlay encoder B is not on the ENC_B pad');
        encPins = [`ENC_A=D${aPin}`, `ENC_B=D${bPin}`];
        expected.set('ENC1|A', 'ENC_A');
        expected.set('ENC1|B', 'ENC_B');
        expected.set('ENC1|C', 'GND');
        expected.set('ENC1|S1', 'COL0');
        expected.set('ENC1|S2', 'SW_D_R0_C0');
    }
    expected.set('SW_PWR|1', 'BAT_PLUS');
    expected.set('SW_PWR|2', 'RAW');
    expected.set('SW_PWR|3', '');
    expected.set('J_BAT|1', 'BAT_PLUS');
    expected.set('J_BAT|2', 'GND');

    const text = fs.readFileSync(file, 'utf8');
    const actual = new Map();
    let ref = null;
    for (const line of text.split('\n')) {
        if (/^\s*\(footprint\s+"/.test(line)) { ref = null; continue; }
        const tr = line.match(/\(fp_text reference "([^"]+)"/);
        if (tr) { ref = tr[1]; continue; }
        const pd = line.match(/^\s*\(pad "([^"]*)"[^\n]*?\(net \d+ "([^"]*)"\)/);
        if (pd && ref) actual.set(`${ref}|${pd[1]}`, pd[2]);
    }

    const problems = [];
    for (const [k, v] of expected) {
        const a = actual.has(k) ? actual.get(k) : undefined;
        if (v === '') {
            if (a !== undefined && a !== '') problems.push(`${k}: expected no net, got "${a}"`);
        } else if (a === undefined) {
            problems.push(`${k}: missing (want ${v})`);
        } else if (a !== v) {
            problems.push(`${k}: got "${a}", want "${v}"`);
        }
    }
    for (const [k, v] of actual) {
        if (!expected.has(k) && v !== '') problems.push(`${k}: unexpected net "${v}"`);
    }
    if (problems.length) {
        throw new Error(`netlist verification FAILED for ${path.basename(file)}:\n  ` + problems.join('\n  '));
    }
    console.log(
        `  netlist verified: 24 controller pads, ${rowPins.length} rows, ${colPins.length} cols,` +
        ` ${activeKeys.length} switches+diodes${side === 'left' ? ', encoder' : ''}, power tree - all match the ZMK overlay.`
    );
    console.log(
        '    pin map: ' +
        [
            ...rowPins.map((p, r) => `ROW${r}=D${p}`),
            ...colPins.map((p, i) => `COL${colOffset + i}=D${p}`),
            ...encPins
        ].join(' ')
    );
}

/* ---------------------------------------------------------------------------
 * Deterministic two-layer grid maze router
 *
 * The board is rasterised onto a 0.4 mm grid.  Each pad paints its copper as
 * "owned by its own net" plus a halo that only that net may enter; NPTH holes
 * and the board edge are hard blocked.  Nets are then routed in order with A*,
 * using vias wherever a net has to change copper side.  Occupancy is per layer
 * and carries a net owner, so a net may reuse its own cells but never another
 * net's - which is exactly the DRC clearance model, so a routed board is
 * clearance-clean by construction rather than by post-hoc patching.
 * ------------------------------------------------------------------------- */
const R_CELL = 0.4;          // routing grid pitch (mm)
const R_TRACK_W = 0.25;      // track width (mm)
const R_VIA_SIZE = 0.6;      // via pad diameter (mm)
const R_VIA_DRILL = 0.3;     // via drill (mm)
const R_PAD_MARGIN = 0.65;   // centreline clearance from pad copper (covers track + via)
const R_HOLE_MARGIN = 0.8;   // centreline clearance outside an NPTH hole radius
const R_EDGE_MARGIN = 0.9;   // centreline clearance inside the board edge
const R_FREE = 0;
const R_BLOCK = -1;

// Distance from a point to a pad's copper (0 when inside).
function padDistance(px, py, p) {
    const dx = Math.abs(px - p.x);
    const dy = Math.abs(py - p.y);
    if (p.kind === 'circle') return Math.max(0, Math.hypot(dx, dy) - p.hw);
    if (p.kind === 'stadium') {
        const r = Math.min(p.hw, p.hh);
        const ex = Math.max(0, dx - (p.hw - r));
        const ey = Math.max(0, dy - (p.hh - r));
        return Math.max(0, Math.hypot(ex, ey) - r);
    }
    const ex = Math.max(0, dx - p.hw);
    const ey = Math.max(0, dy - p.hh);
    return Math.hypot(ex, ey);
}

// Binary min-heap keyed by an f-score, holding state indices.
function MinHeap(cap) {
    this.f = new Float64Array(cap);
    this.s = new Int32Array(cap);
    this.n = 0;
    this.topS = 0;
}
MinHeap.prototype.clear = function () { this.n = 0; };
MinHeap.prototype.push = function (f, s) {
    if (this.n === this.f.length) {
        const nf = new Float64Array(this.f.length * 2);
        nf.set(this.f);
        this.f = nf;
        const ns = new Int32Array(this.s.length * 2);
        ns.set(this.s);
        this.s = ns;
    }
    let i = this.n++;
    this.f[i] = f;
    this.s[i] = s;
    while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.f[p] <= this.f[i]) break;
        const tf = this.f[p]; this.f[p] = this.f[i]; this.f[i] = tf;
        const ts = this.s[p]; this.s[p] = this.s[i]; this.s[i] = ts;
        i = p;
    }
};
MinHeap.prototype.pop = function () {
    this.topS = this.s[0];
    this.n--;
    if (this.n > 0) {
        this.f[0] = this.f[this.n];
        this.s[0] = this.s[this.n];
        let i = 0;
        for (;;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < this.n && this.f[l] < this.f[m]) m = l;
            if (r < this.n && this.f[r] < this.f[m]) m = r;
            if (m === i) break;
            const tf = this.f[m]; this.f[m] = this.f[i]; this.f[i] = tf;
            const ts = this.s[m]; this.s[m] = this.s[i]; this.s[i] = ts;
            i = m;
        }
    }
    return this.topS;
};

const R_NBX = [1, -1, 0, 0];
const R_NBY = [0, 0, 1, -1];

function routeBoard(cfg) {
    const { boardW, boardH, pads, holes, netOrder, netNames, layerCost, viaCost } = cfg;
    const CELL = R_CELL;
    const nx = Math.ceil(boardW / CELL) + 2;
    const ny = Math.ceil(boardH / CELL) + 2;
    const NC = nx * ny;
    const NS = NC * 2;
    const occ = [new Int32Array(NC), new Int32Array(NC)];
    // Cells actually occupied by routed copper (tracks/vias). Two tracks of
    // different nets may not sit in orthogonally adjacent cells: 0.4 mm of
    // centrelines minus a 0.25 mm track leaves only 0.15 mm of copper gap, which
    // is below the 0.2 mm rule.  Diagonal neighbours are 0.566 mm apart and are
    // therefore fine, so only the 4 orthogonal neighbours need guarding.
    const trackOcc = [new Int32Array(NC), new Int32Array(NC)];
    const warnings = [];
    const cellX = (c) => (c % nx) * CELL;
    const cellY = (c) => Math.floor(c / nx) * CELL;

    /* --- board edge keep-out ------------------------------------------- */
    for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
            const px = x * CELL, py = y * CELL;
            if (px < R_EDGE_MARGIN || py < R_EDGE_MARGIN ||
                px > boardW - R_EDGE_MARGIN || py > boardH - R_EDGE_MARGIN) {
                occ[0][y * nx + x] = R_BLOCK;
                occ[1][y * nx + x] = R_BLOCK;
            }
        }
    }

    /* --- NPTH holes ---------------------------------------------------- */
    function blockCircle(ox, oy, r) {
        const x0 = Math.max(0, Math.floor((ox - r) / CELL));
        const x1 = Math.min(nx - 1, Math.ceil((ox + r) / CELL));
        const y0 = Math.max(0, Math.floor((oy - r) / CELL));
        const y1 = Math.min(ny - 1, Math.ceil((oy + r) / CELL));
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const dx = x * CELL - ox, dy = y * CELL - oy;
                if (dx * dx + dy * dy > r * r) continue;
                occ[0][y * nx + x] = R_BLOCK;
                occ[1][y * nx + x] = R_BLOCK;
            }
        }
    }
    for (const h of holes) blockCircle(h.x, h.y, h.r + R_HOLE_MARGIN);

    /* --- pads ---------------------------------------------------------- */
    function paintPad(p, margin, isCopper) {
        const x0 = Math.max(0, Math.floor((p.x - p.hw - margin) / CELL));
        const x1 = Math.min(nx - 1, Math.ceil((p.x + p.hw + margin) / CELL));
        const y0 = Math.max(0, Math.floor((p.y - p.hh - margin) / CELL));
        const y1 = Math.min(ny - 1, Math.ceil((p.y + p.hh + margin) / CELL));
        const owner = p.net + 1;
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                if (padDistance(x * CELL, y * CELL, p) > margin) continue;
                for (const l of p.layers) {
                    const i = y * nx + x;
                    const cur = occ[l][i];
                    if (isCopper) {
                        if (cur === R_FREE || cur === owner) occ[l][i] = owner;
                        else if (owner === R_BLOCK) { /* keep */ }
                        else if (cur > 0) {
                            warnings.push(`overlapping pad copper near ${(x * CELL).toFixed(1)},${(y * CELL).toFixed(1)}`);
                            occ[l][i] = R_BLOCK;
                        }
                    } else if (cur === R_FREE || cur === owner) {
                        occ[l][i] = owner;
                    }
                }
            }
        }
    }
    for (const p of pads) {
        if (p.net) paintPad(p, 0, true);
    }
    for (const p of pads) {
        if (p.net) paintPad(p, R_PAD_MARGIN, false);
        // net 0 pads are dead copper: block them (free cells only, so a real
        // pad's copper or halo is never clobbered)
        else paintPad({ ...p, net: -2, layers: [0, 1] }, R_PAD_MARGIN, true);
    }

    /* --- terminal cells (nearest grid cell to the pad centre, always
           inside the pad copper so KiCad sees a connected track) -------- */
    const terminalState = new Map();
    for (const p of pads) {
        if (!p.net) continue;
        const cx = Math.round(p.x / CELL);
        const cy = Math.round(p.y / CELL);
        if (Math.abs(cx * CELL - p.x) > p.hw || Math.abs(cy * CELL - p.y) > p.hh) {
            warnings.push(`pad ${p.ref}.${p.num} centre is not on grid`);
        }
        const cell = cy * nx + cx;
        const states = [];
        for (const l of p.layers) {
            const v = occ[l][cell];
            if (v === R_FREE || v === p.net + 1) states.push(l * NC + cell);
        }
        if (!states.length) warnings.push(`pad ${p.ref}.${p.num} has no routable cell`);
        terminalState.set(p, states);
    }

    /* --- A* ------------------------------------------------------------ */
    const gScore = new Float64Array(NS);
    const seen = new Int32Array(NS);
    const closed = new Int32Array(NS);
    const parent = new Int32Array(NS);
    const dstMark = new Int32Array(NS);
    const heap = new MinHeap(1 << 13);
    let searchGen = 0;
    let curNet = 0;
    let dstPts = [];

    function hOf(s) {
        const cell = s % NC;
        const px = cellX(cell), py = cellY(cell);
        let best = Infinity;
        for (let k = 0; k < dstPts.length; k++) {
            const dx = px - dstPts[k][0], dy = py - dstPts[k][1];
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < best) best = d;
        }
        return best / CELL;
    }

    // A via is a 0.6 mm pad, so it needs 0.3 mm + 0.2 mm clearance from every
    // other net's copper.  Keeping the 3x3 neighbourhood on both layers clear
    // guarantees that (the nearest an alien 4-connected track can then get to
    // the via centre is one full cell = 0.8 mm).
    function viaOk(x, y) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) return false;
                const i = yy * nx + xx;
                for (let l = 0; l < 2; l++) {
                    const v = occ[l][i];
                    if (v !== R_FREE && v !== curNet + 1) return false;
                }
            }
        }
        return true;
    }

    // A cell may host this net's copper only if it is free/own and no
    // orthogonally adjacent cell already carries another net's routed copper.
    function canOcc(layer, i, netId) {
        const own = netId + 1;
        const v = occ[layer][i];
        if (v !== R_FREE && v !== own) return false;
        const y = Math.floor(i / nx);
        const x = i - y * nx;
        const t = trackOcc[layer];
        if (x > 0) { const w = t[i - 1]; if (w !== R_FREE && w !== own) return false; }
        if (x < nx - 1) { const w = t[i + 1]; if (w !== R_FREE && w !== own) return false; }
        if (y > 0) { const w = t[i - nx]; if (w !== R_FREE && w !== own) return false; }
        if (y < ny - 1) { const w = t[i + nx]; if (w !== R_FREE && w !== own) return false; }
        return true;
    }

    function findPath(srcStates, dstStates) {
        searchGen++;
        heap.clear();
        dstPts = dstStates.map((s) => {
            const cell = s % NC;
            return [cellX(cell), cellY(cell)];
        });
        for (const s of srcStates) {
            gScore[s] = 0;
            seen[s] = searchGen;
            parent[s] = -1;
            heap.push(hOf(s), s);
        }
        for (const s of dstStates) dstMark[s] = searchGen;
        while (heap.n > 0) {
            const s = heap.pop();
            if (closed[s] === searchGen) continue;
            closed[s] = searchGen;
            if (dstMark[s] === searchGen) {
                const path = [];
                let cur = s;
                while (cur !== -1) {
                    path.push(cur);
                    cur = parent[cur];
                }
                path.reverse();
                return path;
            }
            const cell = s % NC;
            const layer = s < NC ? 0 : 1;
            const x = cell % nx, y = Math.floor(cell / nx);
            const step = layer === 0 ? layerCost : 1.0;
            const base = gScore[s];
            for (let k = 0; k < 4; k++) {
                const xx = x + R_NBX[k], yy = y + R_NBY[k];
                if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
                const nc = yy * nx + xx;
                if (!canOcc(layer, nc, curNet)) continue;
                const ns = layer * NC + nc;
                const ng = base + step;
                if (seen[ns] !== searchGen || ng < gScore[ns]) {
                    seen[ns] = searchGen;
                    gScore[ns] = ng;
                    parent[ns] = s;
                    heap.push(ng + hOf(ns), ns);
                }
            }
            if (viaOk(x, y)) {
                const ns = (1 - layer) * NC + cell;
                const ng = base + viaCost;
                if (seen[ns] !== searchGen || ng < gScore[ns]) {
                    seen[ns] = searchGen;
                    gScore[ns] = ng;
                    parent[ns] = s;
                    heap.push(ng + hOf(ns), ns);
                }
            }
        }
        return null;
    }

    function markVia(x, y, netId) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx, yy = y + dy;
                if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
                for (let l = 0; l < 2; l++) {
                    const i = yy * nx + xx;
                    if (occ[l][i] === R_FREE) occ[l][i] = netId + 1;
                    if (trackOcc[l][i] === R_FREE) trackOcc[l][i] = netId + 1;
                }
            }
        }
    }

    /* --- net-by-net routing ------------------------------------------- */
    const segments = [];
    const vias = [];
    const failed = [];
    const treeStates = [];
    const junction = new Set();

    function emitNet(netId, paths) {
        for (const path of paths) {
            const vs = [];
            for (const s of path) {
                const cell = s % NC;
                vs.push({ x: cell % nx, y: Math.floor(cell / nx), l: s < NC ? 0 : 1 });
            }
            const out = [vs[0]];
            for (let i = 1; i < vs.length; i++) {
                const v = vs[i];
                const prev = out[out.length - 1];
                if (v.x === prev.x && v.y === prev.y) { out.push(v); continue; }
                if (out.length >= 2) {
                    const a = out[out.length - 2];
                    const straight = (prev.x - a.x === v.x - prev.x) && (prev.y - a.y === v.y - prev.y);
                    const prevState = prev.l * NC + prev.y * nx + prev.x;
                    if (straight && a.l === prev.l && prev.l === v.l && !junction.has(prevState)) {
                        out[out.length - 1] = v;
                        continue;
                    }
                }
                out.push(v);
            }
            for (let i = 1; i < out.length; i++) {
                const a = out[i - 1], b = out[i];
                if (a.x === b.x && a.y === b.y) {
                    vias.push({ x: a.x * CELL, y: a.y * CELL, net: netId });
                } else {
                    segments.push({
                        x1: a.x * CELL,
                        y1: a.y * CELL,
                        x2: b.x * CELL,
                        y2: b.y * CELL,
                        layer: a.l === 0 ? 'F.Cu' : 'B.Cu',
                        net: netId
                    });
                }
            }
        }
    }

    for (const netId of netOrder) {
        const padsOfNet = pads.filter((p) => p.net === netId);
        if (padsOfNet.length < 2) continue;
        curNet = netId;
        treeStates.length = 0;
        junction.clear();
        const paths = [];

        // Grow the tree from the terminal nearest the controller bay so the long
        // haul to the key field is routed once and the rest taps into it.
        const tlist = padsOfNet
            .map((p) => ({ p, st: terminalState.get(p) || [] }))
            .filter((t) => t.st.length)
            .sort((a, b) => (a.p.y - b.p.y) || (a.p.x - b.p.x));
        for (const s of tlist[0].st) treeStates.push(s);

        for (let i = 1; i < tlist.length; i++) {
            const path = findPath(treeStates, tlist[i].st);
            if (!path) {
                failed.push(netNames[netId] || String(netId));
                break;
            }
            for (const s of path) treeStates.push(s);
            junction.add(path[0]);
            paths.push(path);
            for (const s of path) {
                const cell = s % NC, layer = s < NC ? 0 : 1;
                if (occ[layer][cell] === R_FREE) occ[layer][cell] = netId + 1;
                if (trackOcc[layer][cell] === R_FREE) trackOcc[layer][cell] = netId + 1;
            }
            for (let k = 1; k < path.length; k++) {
                const cell = path[k] % NC;
                if (cell === path[k - 1] % NC) markVia(cell % nx, Math.floor(cell / nx), netId);
            }
        }
        emitNet(netId, paths);
    }

    return { segments, vias, failed, warnings };
}

function generateKiCadPCB(opts) {
    const { variant, side, cols, rows, pitchX, pitchY, isChoc } = opts;
    
    // Board geometry: Add 28mm top controller bay for Nice!Nano + Battery + Power Switch
    const topBayHeight = 28.0;
    const marginX = 8.0;
    const marginY = 8.0;
    const boardW = cols * pitchX + marginX * 2 + STAGGER_MAX_U * pitchX;
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
    (34 "B.Paste" user)
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

    // Geometry handed to the router. `rec` records copper pads, `hole` records
    // drilled mechanical holes; the router derives its own clearance model,
    // so DRC clearance is a property of the routing, not of a post-fix pass.
    const routerPads = [];
    const routerHoles = [];
    const rec = (p) => { routerPads.push(p); };
    const hole = (x, y, r) => { routerHoles.push({ x, y, r }); };

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
        hole(h[0], h[1], 1.1);
    }

    // Silkscreen metadata
    pcbContent += `  (gr_text "Interlock Ergo (${side.toUpperCase()} - ${variant.toUpperCase()})" (at ${(boardW * 0.5).toFixed(2)} 4.0) (layer "F.SilkS") (effects (font (size 1.5 1.5) (thickness 0.25))))\n`;
    pcbContent += `  (gr_text "ZMK 2.4GHz Wireless Split" (at ${(boardW * 0.5).toFixed(2)} 7.0) (layer "F.SilkS") (effects (font (size 1.2 1.2) (thickness 0.2))))\n`;
    if (side === 'right') {
        pcbContent += `  (gr_text "6-Y-H-N ON RIGHT HALF" (at ${(boardW * 0.5).toFixed(2)} 10.0) (layer "F.SilkS") (effects (font (size 1.3 1.3) (thickness 0.25))))\n`;
    }

    // Dimensions for MCU, Power Switch, and Battery in Top Controller Bay
    const mcuX = (boardW * 0.5).toFixed(2);
    // Pads span +/-13.97mm around the origin; 16.0 leaves ~1.2mm of copper inside Edge.Cuts.
    // 17.0, not 16.0: a nice!nano is 33.02mm long about its pad grid centre, so at
    // 16 the module would overhang the board edge into the case wall. At 17 its front
    // edge is 0.49mm inside the board and its far edge clears the controller bay.
    const mcuY = 17.0;
    // Power switch lives in the controller bay on the OUTER edge of each board so
    // the case's through-slot can reach its actuator (0.3 mm clear of the cavity wall).
    const swX = (side === 'left' ? 2.05 : boardW - 2.05).toFixed(2);
    const swY = 12.0;
    const batX = (boardW - 24.0).toFixed(2);
    const batY = 14.0;

    /*
     * Physical pad order on a Pro Micro / nice!nano, USB socket at the top of the
     * board: pads 1-12 are the left column top->bottom, pads 13-24 the right column
     * top->bottom. These are POSITIONS, not Arduino D-numbers - so the D-number ->
     * net map below is the single place where a pad decides what it is connected to.
     */
    const PROMICRO_PAD_SIGNALS = [
        'D1', 'D0', 'GND', 'GND', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9',
        'RAW', 'GND', 'RST', 'VCC', 'D21', 'D20', 'D19', 'D18', 'D15', 'D14', 'D16', 'D10'
    ];
    // Mirrors the &pro_micro D-numbers in interlock_ergo_{left,right}.overlay:
    // rows = pro_micro 4..8, battery on RAW, encoder on pro_micro 21/20 (left only).
    const podSignals = side === 'left'
        ? {
            D0: 'COL6', D1: 'COL5', D4: 'ROW0', D5: 'ROW1', D6: 'ROW2', D7: 'ROW3', D8: 'ROW4',
            D18: 'COL0', D15: 'COL1', D14: 'COL2', D16: 'COL3', D10: 'COL4',
            D21: 'ENC_A', D20: 'ENC_B', RAW: 'RAW', GND: 'GND'
        }
        : {
            D0: 'COL13', D1: 'COL12', D2: 'COL14', D3: 'COL15', D4: 'ROW0', D5: 'ROW1',
            D6: 'ROW2', D7: 'ROW3', D8: 'ROW4', D18: 'COL7', D15: 'COL8', D14: 'COL9',
            D16: 'COL10', D10: 'COL11', RAW: 'RAW', GND: 'GND'
        };
    const mcuPadNets = PROMICRO_PAD_SIGNALS.map((d) => {
        const name = podSignals[d];
        if (!name) return { id: 0, name: '' };
        const net = nets.find((n) => n.name === name);
        if (!net) throw new Error(`No net "${name}" for controller signal ${d} (${side})`);
        return net;
    });
    const cplRows = [];
    let switchIndex = 1;

    for (const k of activeKeys) {
        const { r, c, diodeNet } = k;
        
        // Skip switch footprint on Left Half at (0,0) if encoder is placed there
        const isEncoderPos = (side === 'left' && r === 0 && c === 0);

        const rowNet = nets.find(n => n.name === `ROW${r}`);
        const colNet = nets.find(n => n.name === `COL${colOffset + c}`);
        const x = (offsetX + (ROW_STAGGER_U[r] + c) * pitchX).toFixed(2);
        const y = (offsetY + r * pitchY).toFixed(2);
        const swRef = `SW${switchIndex}`;
        const dRef = `D${switchIndex}`;
        switchIndex++;

        let pad1X, pad1Y, pad2X, pad2Y;

        if (!isEncoderPos) {
            // Switch + Kailh hotswap socket.
            //
            // Geometry verified against marbastlib's SW_choc_v1_HS_CPG135001S30_1u
            // and SW_MX_HS_CPG151101S11, and ergogen's choc.js / mx.js. Both agree:
            //   - the switch pins get a 3.0mm clearance hole for the socket body,
            //     NOT a solder pad; the socket grips the pin through that hole
            //   - the socket's two solder pads sit 3.25-3.55mm OUTBOARD of the pins
            //
            // The previous footprint put the SMD pads directly on the pin positions
            // with no clearance holes, which no hotswap socket can be soldered to.
            // This is hotswap-only: the pin holes are unplated, so a switch cannot be
            // soldered in directly, which matches what this kit ships with.
            const sw = { x: parseFloat(x), y: parseFloat(y) };

            // Socket solder pads, outboard of each pin. Pin 1 is the column side,
            // pin 2 goes through that key's diode; which physical pin is which does
            // not matter electrically, only that each pad is outboard of its pin.
            const pads = isChoc
                ? {
                    // marbastlib and keebio agree on 3.245mm / 2.65x2.6 (both trace
                    // to Kailh's drawing); ergogen uses 3.275 / 2.6x2.6. Take the
                    // two-library consensus.
                    pinA: { x: 0, y: -5.95 }, pinB: { x: 5, y: -3.75 },
                    padA: { x: -3.245, y: -5.95, w: 2.65, h: 2.6 },
                    padB: { x: 8.245, y: -3.75, w: 2.65, h: 2.6 },
                    centre: 3.429, peg: 1.7018, pegX: 5.5, pinHole: 3.0,
                    name: 'Kailh_Choc_V1_CPG135001S30', refY: 3.0
                }
                : {
                    pinA: { x: -3.81, y: -2.54 }, pinB: { x: 2.54, y: -5.08 },
                    padA: { x: -7.085, y: -2.54, w: 2.55, h: 2.5 },
                    padB: { x: 5.842, y: -5.08, w: 2.55, h: 2.5 },
                    centre: 3.9878, peg: 1.75, pegX: 5.08, pinHole: 3.0,
                    name: 'Kailh_MX_CPG151101S11', refY: 3.5
                };

            pad1X = sw.x + pads.padA.x;
            pad1Y = sw.y + pads.padA.y;
            pad2X = sw.x + pads.padB.x;
            pad2Y = sw.y + pads.padB.y;

            const f = (n) => n.toFixed(3);
            pcbContent += `  (footprint "${pads.name}" (layer "B.Cu")
    (at ${x} ${y})
    (fp_text reference "${swRef}" (at 0 ${pads.refY}) (layer "B.SilkS"))
    (pad "" np_thru_hole circle (at 0 0) (size ${f(pads.centre)} ${f(pads.centre)}) (drill ${f(pads.centre)}) (layers *.Cu *.Mask))
    (pad "" np_thru_hole circle (at ${-pads.pegX} 0) (size ${f(pads.peg)} ${f(pads.peg)}) (drill ${f(pads.peg)}) (layers *.Cu *.Mask))
    (pad "" np_thru_hole circle (at ${pads.pegX} 0) (size ${f(pads.peg)} ${f(pads.peg)}) (drill ${f(pads.peg)}) (layers *.Cu *.Mask))
    (pad "" np_thru_hole circle (at ${f(pads.pinA.x)} ${f(pads.pinA.y)}) (size ${f(pads.pinHole)} ${f(pads.pinHole)}) (drill ${f(pads.pinHole)}) (layers *.Cu *.Mask))
    (pad "" np_thru_hole circle (at ${f(pads.pinB.x)} ${f(pads.pinB.y)}) (size ${f(pads.pinHole)} ${f(pads.pinHole)}) (drill ${f(pads.pinHole)}) (layers *.Cu *.Mask))
    (pad "1" smd roundrect (at ${f(pads.padA.x)} ${f(pads.padA.y)}) (size ${pads.padA.w} ${pads.padA.h}) (layers "B.Cu" "B.Paste" "B.Mask") (roundrect_rratio 0.1) (net ${colNet.id} "${colNet.name}"))
    (pad "2" smd roundrect (at ${f(pads.padB.x)} ${f(pads.padB.y)}) (size ${pads.padB.w} ${pads.padB.h}) (layers "B.Cu" "B.Paste" "B.Mask") (roundrect_rratio 0.1) (net ${diodeNet.id} "${diodeNet.name}"))
  )\n`;

            rec({ ref: swRef, num: '1', x: pad1X, y: pad1Y, net: colNet.id, kind: 'rect', hw: pads.padA.w / 2, hh: pads.padA.h / 2, layers: [1] });
            rec({ ref: swRef, num: '2', x: pad2X, y: pad2Y, net: diodeNet.id, kind: 'rect', hw: pads.padB.w / 2, hh: pads.padB.h / 2, layers: [1] });
            hole(sw.x, sw.y, pads.centre / 2);
            hole(sw.x - pads.pegX, sw.y, pads.peg / 2);
            hole(sw.x + pads.pegX, sw.y, pads.peg / 2);
            hole(sw.x + pads.pinA.x, sw.y + pads.pinA.y, pads.pinHole / 2);
            hole(sw.x + pads.pinB.x, sw.y + pads.pinB.y, pads.pinHole / 2);

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
            rec({ ref: dRef, num: '1', x: parseFloat(dx) - 1.65, y: parseFloat(dy), net: rowNet.id, kind: 'rect', hw: 0.45, hh: 0.6, layers: [1] });
            rec({ ref: dRef, num: '2', x: parseFloat(dx) + 1.65, y: parseFloat(dy), net: diodeNet.id, kind: 'rect', hw: 0.45, hh: 0.6, layers: [1] });
        } else {
            // The encoder push switch occupies RC(0,0) and needs a series diode too,
            // otherwise it shorts COL0 straight to ROW0 and ghosts column 0.
            const dx = (parseFloat(x) - 4.5).toFixed(2);
            const dy = (parseFloat(y) + 4.0).toFixed(2);
            pcbContent += `  (footprint "Diode_SMD:D_SOD-123" (layer "B.Cu")
    (at ${dx} ${dy})
    (fp_text reference "${dRef}" (at 0 1.2) (layer "B.SilkS"))
    (pad "1" smd rect (at -1.65 0) (size 0.9 1.2) (layers "B.Cu" "B.Paste" "B.Mask") (net ${rowNet.id} "${rowNet.name}"))
    (pad "2" smd rect (at 1.65 0) (size 0.9 1.2) (layers "B.Cu" "B.Paste" "B.Mask") (net ${diodeNet.id} "${diodeNet.name}"))
  )\n`;

            cplRows.push({ designator: dRef, midX: dx, midY: dy, layer: 'bottom', rotation: 0 });

            // Encoder pad S2 (-2.5,-7.0 relative) -> diode anode
            rec({ ref: dRef, num: '1', x: parseFloat(dx) - 1.65, y: parseFloat(dy), net: rowNet.id, kind: 'rect', hw: 0.45, hh: 0.6, layers: [1] });
            rec({ ref: dRef, num: '2', x: parseFloat(dx) + 1.65, y: parseFloat(dy), net: diodeNet.id, kind: 'rect', hw: 0.45, hh: 0.6, layers: [1] });
        }
    }

    // Routing happens once every footprint is placed, so the maze router sees the
    // real obstacle field (pads, holes, edge) instead of guessing bus geometry.

    // Place Nice!Nano / Pro Micro MCU Footprint in Top Controller Bay (Clear of all switches!)
    pcbContent += `  (footprint "NiceNano_v2_ProMicro" (layer "F.Cu")
    (at ${mcuX} ${mcuY})
    (fp_text reference "U1" (at 0 -10) (layer "F.SilkS"))
    (fp_line (start -9 -14) (end 9 -14) (layer "F.SilkS") (width 0.15))
    (fp_line (start 9 -14) (end 9 14) (layer "F.SilkS") (width 0.15))
    (fp_line (start 9 14) (end -9 14) (layer "F.SilkS") (width 0.15))
    (fp_line (start -9 14) (end -9 -14) (layer "F.SilkS") (width 0.15))
`;

    // Emit all 24 pads from the same table the routing used, so the two cannot disagree.
    for (let p = 0; p < 12; p++) {
        const py = (-13.97 + p * 2.54).toFixed(2);
        const lNet = mcuPadNets[p];
        const rNet = mcuPadNets[p + 12];
        pcbContent += `    (pad "${p + 1}" thru_hole circle (at -7.62 ${py}) (size 1.7 1.7) (drill 1.0) (layers *.Cu *.Mask) (net ${lNet.id} "${lNet.name}"))\n`;
        pcbContent += `    (pad "${p + 13}" thru_hole circle (at 7.62 ${py}) (size 1.7 1.7) (drill 1.0) (layers *.Cu *.Mask) (net ${rNet.id} "${rNet.name}"))\n`;
        rec({ ref: 'U1', num: String(p + 1), x: parseFloat(mcuX) - 7.62, y: mcuY - 13.97 + p * 2.54, net: lNet.id, kind: 'circle', hw: 0.85, hh: 0.85, layers: [0, 1] });
        rec({ ref: 'U1', num: String(p + 13), x: parseFloat(mcuX) + 7.62, y: mcuY - 13.97 + p * 2.54, net: rNet.id, kind: 'circle', hw: 0.85, hh: 0.85, layers: [0, 1] });
    }
    pcbContent += `  )\n`;

    // Rotary Encoder on Left Half - Alps EC11E with push switch.
    // Pad geometry from marbastlib's ROT_Alps_EC11E-Switch: A/B/C at y=+7.5 on
    // 2.5mm pitch, the push switch at y=-7, and two 2.8 x 1.5mm slotted mounting
    // posts at x=+/-5.6. The mounting posts are structural - without them the
    // encoder body stands on its own legs and never seats on the board.
    if (side === 'left') {
        const encX = offsetX.toFixed(2);
        const encY = offsetY.toFixed(2);
        const col0Net = nets.find(n => n.name === 'COL0');
        const encKeyNet = activeKeys.find(k => k.r === 0 && k.c === 0).diodeNet;
        pcbContent += `  (footprint "RotaryEncoder_Alps_EC11" (layer "F.Cu")
    (at ${encX} ${encY})
    (fp_text reference "ENC1" (at 0 -8) (layer "F.SilkS"))
    (pad "A" thru_hole circle (at -2.5 7.5) (size 2 2) (drill 1.0) (layers *.Cu *.Mask) (net ${netEncA.id} "${netEncA.name}"))
    (pad "C" thru_hole circle (at 0 7.5) (size 2 2) (drill 1.0) (layers *.Cu *.Mask) (net 1 "GND"))
    (pad "B" thru_hole circle (at 2.5 7.5) (size 2 2) (drill 1.0) (layers *.Cu *.Mask) (net ${netEncB.id} "${netEncB.name}"))
    (pad "" np_thru_hole oval (at -5.6 0) (size 2.8 1.5) (drill oval 2.8 1.5) (layers *.Cu *.Mask))
    (pad "" np_thru_hole oval (at 5.6 0) (size 2.8 1.5) (drill oval 2.8 1.5) (layers *.Cu *.Mask))
    (pad "S1" thru_hole circle (at -2.5 -7.0) (size 2 2) (drill 1.0) (layers *.Cu *.Mask) (net ${col0Net.id} "${col0Net.name}"))
    (pad "S2" thru_hole circle (at 2.5 -7.0) (size 2 2) (drill 1.0) (layers *.Cu *.Mask) (net ${encKeyNet.id} "${encKeyNet.name}"))
  )\n`;
        const efx = parseFloat(encX), efy = parseFloat(encY);
        rec({ ref: 'ENC1', num: 'A', x: efx - 2.5, y: efy + 7.5, net: netEncA.id, kind: 'circle', hw: 1.0, hh: 1.0, layers: [0, 1] });
        rec({ ref: 'ENC1', num: 'C', x: efx, y: efy + 7.5, net: 1, kind: 'circle', hw: 1.0, hh: 1.0, layers: [0, 1] });
        rec({ ref: 'ENC1', num: 'B', x: efx + 2.5, y: efy + 7.5, net: netEncB.id, kind: 'circle', hw: 1.0, hh: 1.0, layers: [0, 1] });
        rec({ ref: 'ENC1', num: 'S1', x: efx - 2.5, y: efy - 7.0, net: col0Net.id, kind: 'circle', hw: 1.0, hh: 1.0, layers: [0, 1] });
        rec({ ref: 'ENC1', num: 'S2', x: efx + 2.5, y: efy - 7.0, net: encKeyNet.id, kind: 'circle', hw: 1.0, hh: 1.0, layers: [0, 1] });
        // Mounting posts: blocked on both layers, radius taken from the slot's long axis.
        hole(efx - 5.6, efy, 1.4);
        hole(efx + 5.6, efy, 1.4);
    }

    // Power Switch (MSK-12D19) in the top bay, on the outer edge of the board
    pcbContent += `  (footprint "SlideSwitch_MSK12D19" (layer "F.Cu")
    (at ${swX} ${swY})
    (fp_text reference "SW_PWR" (at 0 -4) (layer "F.SilkS"))
    (pad "1" thru_hole circle (at 0 -2.0) (size 1.6 1.6) (drill 0.9) (layers *.Cu *.Mask) (net 9 "BAT_PLUS"))
    (pad "2" thru_hole circle (at 0 0) (size 1.6 1.6) (drill 0.9) (layers *.Cu *.Mask) (net 3 "RAW"))
    (pad "3" thru_hole circle (at 0 2.0) (size 1.6 1.6) (drill 0.9) (layers *.Cu *.Mask))
  )\n`;
    rec({ ref: 'SW_PWR', num: '1', x: parseFloat(swX), y: swY - 2.0, net: 9, kind: 'circle', hw: 0.8, hh: 0.8, layers: [0, 1] });
    rec({ ref: 'SW_PWR', num: '2', x: parseFloat(swX), y: swY, net: 3, kind: 'circle', hw: 0.8, hh: 0.8, layers: [0, 1] });
    rec({ ref: 'SW_PWR', num: '3', x: parseFloat(swX), y: swY + 2.0, net: 0, kind: 'circle', hw: 0.8, hh: 0.8, layers: [0, 1] });

    // Battery Connector (JST-PH 2-Pin) in top bay
    pcbContent += `  (footprint "Connector_JST:JST_PH_S2B-PH-K_1x02" (layer "F.Cu")
    (at ${batX} ${batY})
    (fp_text reference "J_BAT" (at 0 -3) (layer "F.SilkS"))
    (pad "1" thru_hole roundrect (at -1.0 0) (size 1.5 2.0) (drill 0.8) (layers *.Cu *.Mask) (net 9 "BAT_PLUS"))
    (pad "2" thru_hole oval (at 1.0 0) (size 1.5 2.0) (drill 0.8) (layers *.Cu *.Mask) (net 1 "GND"))
  )\n`;
    rec({ ref: 'J_BAT', num: '1', x: parseFloat(batX) - 1.0, y: parseFloat(batY), net: 9, kind: 'rect', hw: 0.75, hh: 1.0, layers: [0, 1] });
    rec({ ref: 'J_BAT', num: '2', x: parseFloat(batX) + 1.0, y: parseFloat(batY), net: 1, kind: 'stadium', hw: 0.75, hh: 1.0, layers: [0, 1] });

    // ---------------------------------------------------------------------
    // Route. Order: local switch->diode links, row busses, column busses,
    // encoder, then power. Retry with different layer bias if a net fails.
    // ---------------------------------------------------------------------
    const netNames = {};
    for (const n of nets) netNames[n.id] = n.name;
    const netOrder = [];
    for (const k of activeKeys) netOrder.push(k.diodeNet.id);
    for (let r = 0; r < rows; r++) netOrder.push(nets.find(n => n.name === `ROW${r}`).id);
    for (let c = 0; c < cols; c++) netOrder.push(nets.find(n => n.name === `COL${colOffset + c}`).id);
    if (netEncA) netOrder.push(netEncA.id);
    if (netEncB) netOrder.push(netEncB.id);
    netOrder.push(9, 3, 1); // BAT_PLUS, RAW, GND

    const ROUTE_ATTEMPTS = [
        { f: 1.20, via: 12 },
        { f: 1.50, via: 12 },
        { f: 1.02, via: 24 },
        { f: 1.00, via: 8 }
    ];
    let routed = null;
    const t0 = Date.now();
    for (let a = 0; a < ROUTE_ATTEMPTS.length; a++) {
        routed = routeBoard({
            boardW, boardH,
            pads: routerPads,
            holes: routerHoles,
            netOrder,
            netNames,
            layerCost: ROUTE_ATTEMPTS[a].f,
            viaCost: ROUTE_ATTEMPTS[a].via
        });
        if (routed.warnings.length) console.log(`  router notes: ${[...new Set(routed.warnings)].slice(0, 6).join('; ')}`);
        if (!routed.failed.length) break;
        console.log(`  route attempt ${a + 1}: unreachable ${routed.failed.join(', ')} - retrying with different layer bias`);
    }
    const routeMs = Date.now() - t0;
    if (routed.failed.length) {
        console.error(`  !! could not route: ${routed.failed.join(', ')}`);
    }

    for (const seg of routed.segments) {
        pcbContent += `  (segment (start ${seg.x1.toFixed(2)} ${seg.y1.toFixed(2)}) (end ${seg.x2.toFixed(2)} ${seg.y2.toFixed(2)}) (width ${R_TRACK_W}) (layer "${seg.layer}") (net ${seg.net}))\n`;
    }
    for (const v of routed.vias) {
        pcbContent += `  (via (at ${v.x.toFixed(2)} ${v.y.toFixed(2)}) (size ${R_VIA_SIZE}) (drill ${R_VIA_DRILL}) (layers "F.Cu" "B.Cu") (net ${v.net}))\n`;
    }

    pcbContent += `)\n`;

    const outPcbFile = path.join(pcbDir, `interlock_ergo_${side}_${variant}.kicad_pcb`);
    fs.writeFileSync(outPcbFile, pcbContent, 'utf8');
    console.log(`Generated: ${path.basename(outPcbFile)} (${activeKeys.length} keys, ${routed.segments.length} segments, ${routed.vias.length} vias, ${routeMs} ms).`);

    const gerberSubdir = path.join(distDir, `gerbers_${side}_${variant}`);
    const zipName = `interlock_ergo_${side}_${variant}_gerbers.zip`;
    const zipPath = path.join(distDir, zipName);
    const bomFile = path.join(distDir, `bom_${side}_${variant}.csv`);
    const cplFile = path.join(distDir, `cpl_${side}_${variant}.csv`);

    // Withdraw anything published for this board *before* verifying it, so a
    // failed check (or a crash) can never leave orderable files behind.
    const drcDir = path.join(distDir, 'drc');
    fs.mkdirSync(drcDir, { recursive: true });
    const drcReport = path.join(drcDir, `interlock_ergo_${side}_${variant}.rpt`);
    if (fs.existsSync(gerberSubdir)) execSync(`rm -rf "${gerberSubdir}"`);
    for (const f of [zipPath, bomFile, cplFile, drcReport]) {
        if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    verifyNetlist({ file: outPcbFile, side, cols, colOffset, activeKeys, PROMICRO_PAD_SIGNALS, podSignals });

    // DRC gate: a board that fails DRC never gets fab artifacts, and anything it
    // published previously is withdrawn, so a dirty board cannot be ordered.
    let drcViolations = null;
    let drcUnconnected = null;
    try {
        execSync(`kicad-cli pcb drc --severity-error --exit-code-violations -o "${drcReport}" "${outPcbFile}"`, { stdio: 'pipe' });
    } catch (e) {
        // non-zero exit == the board has violations; the report has the detail
    }
    {
        const rpt = fs.existsSync(drcReport) ? fs.readFileSync(drcReport, 'utf8') : '';
        const mv = rpt.match(/\*\* Found (\d+) DRC violations \*\*/);
        const mu = rpt.match(/\*\* Found (\d+) unconnected pads \*\*/);
        drcViolations = mv ? parseInt(mv[1], 10) : -1;
        drcUnconnected = mu ? parseInt(mu[1], 10) : 0;
        if (rpt) fs.writeFileSync(drcReport, rpt.replace(/\*\* Created on [^*]+\*\*/, "** Created on 1970-01-01T00:00:00 **"));
    }

    if (drcViolations !== 0 || drcUnconnected !== 0) {
        if (fs.existsSync(gerberSubdir)) execSync(`rm -rf "${gerberSubdir}"`);
        for (const f of [zipPath, bomFile, cplFile]) {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        }
        console.error(
            `  !! DRC FAILED (${drcViolations < 0 ? 'kicad-cli could not run' : `${drcViolations} violations, ${drcUnconnected} unconnected pads`})` +
            ` - ${path.relative(pcbDir, drcReport)}. No gerbers/BOM/CPL emitted for this board.`
        );
        process.exitCode = 1;
        return;
    }

    console.log(`  DRC clean (0 violations, 0 unconnected pads) - ${path.relative(pcbDir, drcReport)}`);

    if (fs.existsSync(gerberSubdir)) execSync(`rm -rf "${gerberSubdir}"`);
    fs.mkdirSync(gerberSubdir, { recursive: true });

    // B.Paste is the stencil layer for the SOD-123 diodes: without it the BOM/CPL
    // cannot be ordered as SMT assembly. Every SMD pad on this board is on the
    // bottom, so there is no F.Paste to emit.
    execSync(`kicad-cli pcb export gerbers -l F.Cu,B.Cu,F.Mask,B.Mask,F.Silkscreen,B.Silkscreen,F.Courtyard,B.Courtyard,B.Paste,Edge.Cuts,Margin -o "${gerberSubdir}/" "${outPcbFile}"`);
    execSync(`kicad-cli pcb export drill -o "${gerberSubdir}/" "${outPcbFile}"`);

    pinTimestamps(gerberSubdir);

    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    writeZip(zipPath, gerberSubdir);
    const zipStat = fs.statSync(zipPath);
    console.log(`  -> JLCPCB Gerber Package: ${zipName} (${(zipStat.size / 1024).toFixed(1)} KB)`);

    // Individual lines for each diode in CPL and BOM (satisfies JLCPCB parser rules)
    let cplText = 'Designator,Mid X,Mid Y,Layer,Rotation\n';
    for (const row of cplRows) {
        cplText += `${row.designator},${row.midX},${row.midY},${row.layer},${row.rotation}\n`;
    }
    fs.writeFileSync(cplFile, cplText, 'utf8');

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

console.log(
    process.exitCode
        ? '✗ PCB generation finished with DRC failures. Boards are saved for inspection; no fab files were emitted.'
        : '✓ All 4 KiCad PCBs generated, mapped and DRC-clean; JLCPCB packages written to pcb/dist/.'
);
