#!/usr/bin/env node
/* generate_schematic.js - emit KiCad schematics for the Interlock Ergo PCBs.
 *
 *   node pcb/generate_schematic.js
 *
 * The .kicad_pcb files are the single source of electrical truth: every
 * component, pad number and pad net is read back out of the board, so the
 * schematic cannot drift from the copper (audit item P0-2).  Two schematics
 * are emitted, one per half; the choc and mx boards of a half are electrically
 * identical so only the choc board is read.  Output is deterministic (no
 * timestamps, UUIDs hashed from stable identity strings) and is verified with
 * `kicad-cli sch erc` plus a pin-by-pin netlist comparison against the PCB.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const DIR = __dirname;
const OUT_DIR = path.join(DIR, 'dist', 'sch');
const LIB_NAME = 'interlock';
const BOARDS = [
    { name: 'interlock_ergo_left', src: 'interlock_ergo_left_choc.kicad_pcb', twin: 'interlock_ergo_left_mx.kicad_pcb', title: 'Interlock Ergo - Left Half' },
    { name: 'interlock_ergo_right', src: 'interlock_ergo_right_choc.kicad_pcb', twin: 'interlock_ergo_right_mx.kicad_pcb', title: 'Interlock Ergo - Right Half' },
];

/* ---------------- deterministic primitives ---------------- */

// 4 decimals is well below any KiCad geometry tolerance and keeps the text stable.
const n = (v) => {
    const s = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
};
const q = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const T = (text, depth = 1) => text.split('\n').map((l) => '\t'.repeat(depth) + l).join('\n');

// Stable UUID: hash a semantic path so a re-run is byte-identical.
function uuid(key) {
    const h = crypto.createHash('sha1').update('interlock-ergo/sch/' + key).digest();
    h[6] = (h[6] & 0x0f) | 0x40;
    h[8] = (h[8] & 0x3f) | 0x80;
    const x = h.toString('hex');
    return [x.slice(0, 8), x.slice(8, 12), x.slice(12, 16), x.slice(16, 20), x.slice(20, 32)].join('-');
}

/* ---------------- s-expression parsing (for kicad-cli netlists) ---------------- */

function parseSexpr(text) {
    let i = 0;
    const skip = () => { while (i < text.length && /\s/.test(text[i])) i++; };
    const value = () => {
        skip();
        if (text[i] === '(') {
            i++;
            const list = [];
            for (;;) {
                skip();
                if (i >= text.length) throw new Error('unbalanced s-expression');
                if (text[i] === ')') { i++; return list; }
                list.push(value());
            }
        }
        if (text[i] === '"') {
            i++;
            let s = '';
            while (text[i] !== '"') {
                if (i >= text.length) throw new Error('unterminated string');
                if (text[i] === '\\') i++;
                s += text[i++];
            }
            i++;
            return s;
        }
        let atom = '';
        while (i < text.length && !/[\s()]/.test(text[i])) atom += text[i++];
        return atom;
    };
    return value();
}
const kids = (node, head) => node.filter((c) => Array.isArray(c) && c[0] === head);
const kid = (node, head) => kids(node, head)[0];

/* ---------------- 1. read the boards ---------------- */

function readBoard(file) {
    const comps = [];
    let cur = null;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const head = line.match(/^  \(footprint "([^"]+)"/);
        if (head) {
            cur = { ref: null, footprint: head[1], at: [0, 0], pads: [] };
            comps.push(cur);
            continue;
        }
        if (!cur) continue;
        const at = line.match(/^    \(at ([-\d.]+) ([-\d.]+)\)/);
        if (at) { cur.at = [Number(at[1]), Number(at[2])]; continue; }
        const ref = line.match(/^\s*\(fp_text reference "([^"]+)"/);
        if (ref) { cur.ref = ref[1]; continue; }
        const pad = line.match(/^\s*\(pad "([^"]*)"/);
        if (pad) {
            // pads may carry no (net ...) at all (e.g. SW_PWR pin 3 stays unconnected)
            const net = line.match(/\(net \d+ "([^"]*)"\)/);
            cur.pads.push({ num: pad[1], net: net ? net[1] : '' });
        }
    }
    // Fiducials and mounting holes have no numbered pads and carry no connectivity.
    return comps.filter((c) => c.ref && c.pads.some((p) => p.num));
}

const PRIVATE = /^SW_D_R(\d+)_C(\d+)$/;

/* ---------------- 2. embedded symbol library ---------------- */

// pin: [number, name, local x, local y, orientation, length]
// Local +y is up; the instance transform is global = (x + lx, y - ly).
const poly = (pts, w = 0) => `(polyline\n\t(pts\n${pts.map((p) => `\t\t(xy ${n(p[0])} ${n(p[1])})`).join('\n')}\n\t)\n\t(stroke\n\t\t(width ${n(w)})\n\t\t(type default)\n\t)\n\t(fill\n\t\t(type none)\n\t)\n)`;
const circle = (cx, cy, r) => `(circle\n\t(center ${n(cx)} ${n(cy)})\n\t(radius ${n(r)})\n\t(stroke\n\t\t(width 0)\n\t\t(type default)\n\t)\n\t(fill\n\t\t(type none)\n\t)\n)`;
const rect = (x1, y1, x2, y2) => `(rectangle\n\t(start ${n(x1)} ${n(y1)})\n\t(end ${n(x2)} ${n(y2)})\n\t(stroke\n\t\t(width 0.254)\n\t\t(type default)\n\t)\n\t(fill\n\t\t(type none)\n\t)\n)`;

const LIB = {
    SW_SOCKET: {
        ref: 'SW', value: 'Hotswap socket', desc: 'Kailh Choc hotswap socket (2 pins)',
        hideNumbers: true, hideNames: true, refAt: [0, -5.08],
        graphics: [
            circle(-2.032, 0, 0.508), circle(2.032, 0, 0.508),
            poly([[-1.524, 0.508], [1.524, 2.032]]),
        ],
        pins: [['1', '~', -5.08, 0, 0, 2.54], ['2', '~', 5.08, 0, 180, 2.54]],
    },
    D_SOD123: {
        ref: 'D', value: 'D_SOD-123', desc: 'Diode, SOD-123: pin 1 = cathode, pin 2 = anode',
        hideNumbers: true, hideNames: true, refAt: [0, -3.81],
        graphics: [
            poly([[1.27, 1.27], [1.27, -1.27]], 0.254),
            poly([[-1.27, 1.27], [-1.27, -1.27], [1.27, 0], [-1.27, 1.27]], 0.254),
        ],
        pins: [['1', 'K', 3.81, 0, 180, 2.54], ['2', 'A', -3.81, 0, 0, 2.54]],
    },
    NICE_NANO: {
        ref: 'U', value: 'nice!nano v2', desc: 'Pro Micro / nice!nano controller, 24 pads',
        hideNumbers: false, hideNames: true, refAt: [0, -19.05],
        graphics: [rect(-8.89, 16.51, 8.89, -16.51)],
        pins: [
            ...Array.from({ length: 12 }, (_, i) => [String(i + 1), '~', -12.7, 13.97 - i * 2.54, 0, 3.81]),
            ...Array.from({ length: 12 }, (_, i) => [String(i + 13), '~', 12.7, 13.97 - i * 2.54, 180, 3.81]),
        ],
    },
    SW_SLIDE: {
        ref: 'SW', value: 'MSK12D19', desc: 'SPDT slide switch, pin 1 = battery, pin 2 = RAW, pin 3 = unused',
        hideNumbers: false, hideNames: true, refAt: [0, -6.35],
        graphics: [rect(-2.54, 5.08, 2.54, -5.08), poly([[-1.27, 2.54], [1.27, 0.508]])],
        pins: [['1', '~', -6.35, 2.54, 0, 3.81], ['2', '~', -6.35, 0, 0, 3.81], ['3', '~', -6.35, -2.54, 0, 3.81]],
    },
    CONN_BAT: {
        ref: 'J', value: 'JST PH 2-pin', desc: 'Battery connector, pin 1 = BAT_PLUS, pin 2 = GND',
        hideNumbers: false, hideNames: true, refAt: [0, -4.445],
        graphics: [rect(-2.54, 2.54, 2.54, -2.54)],
        pins: [['1', '~', -5.08, 1.27, 0, 2.54], ['2', '~', -5.08, -1.27, 0, 2.54]],
    },
    EC11: {
        ref: 'ENC', value: 'EC11 rotary encoder', desc: 'EC11 encoder: A/B quadrature, C common, S1/S2 push switch',
        hideNumbers: true, hideNames: false, refAt: [0, -8.255],
        graphics: [rect(-7.62, 5.08, 7.62, -5.08)],
        pins: [
            ['A', 'A', -12.7, 2.54, 0, 5.08], ['C', 'C', -12.7, 0, 0, 5.08], ['B', 'B', -12.7, -2.54, 0, 5.08],
            ['S1', 'S1', 12.7, 2.54, 180, 5.08], ['S2', 'S2', 12.7, -2.54, 180, 5.08],
        ],
    },
};

function property(name, value, x, y, rot, hidden) {
    return `(property ${q(name)} ${q(value)}\n\t(at ${n(x)} ${n(y)} ${rot})\n\t(effects\n\t\t(font\n\t\t\t(size 1.27 1.27)\n\t\t)\n${hidden ? '\t\t(hide yes)\n' : ''}\t)\n)`;
}

function libPin(p) {
    const [num, name, x, y, rot, len] = p;
    const fx = '\t\t(effects\n\t\t\t(font\n\t\t\t\t(size 1.27 1.27)\n\t\t\t)\n\t\t)\n\t)';
    return `(pin passive line\n\t(at ${n(x)} ${n(y)} ${rot})\n\t(length ${n(len)})\n\t(name ${q(name)}\n${fx}\n\t(number ${q(num)}\n${fx}\n)`;
}

function libSymbol(kind) {
    const s = LIB[kind];
    const parts = [];
    parts.push(`(symbol ${q(LIB_NAME + ':' + kind)}`);
    parts.push('\t(pin_numbers' + (s.hideNumbers ? '\n\t\t(hide yes)\n\t' : '') + ')');
    parts.push('\t(pin_names\n\t\t(offset 1.016)' + (s.hideNames ? '\n\t\t(hide yes)' : '') + '\n\t)');
    parts.push('\t(exclude_from_sim no)\n\t(in_bom yes)\n\t(on_board yes)');
    parts.push(T(property('Reference', s.ref, 0, s.refAt[1], 0, false)));
    parts.push(T(property('Value', s.value, 0, -s.refAt[1], 0, false)));
    parts.push(T(property('Footprint', '', 0, 0, 0, true)));
    parts.push(T(property('Datasheet', '~', 0, 0, 0, true)));
    parts.push(T(property('Description', s.desc, 0, 0, 0, true)));
    parts.push(T(`(symbol ${q(kind + '_0_1')}\n${s.graphics.map((g) => T(g)).join('\n')}\n)`));
    parts.push(T(`(symbol ${q(kind + '_1_1')}\n${s.pins.map((p) => T(libPin(p))).join('\n')}\n)`));
    parts.push('\t(embedded_fonts no)');
    parts.push(')');
    return parts.join('\n');
}

/* ---------------- 3. schematic items ---------------- */

const wire = (a, b, key) =>
    `(wire\n\t(pts\n\t\t(xy ${n(a[0])} ${n(a[1])}) (xy ${n(b[0])} ${n(b[1])})\n\t)\n\t(stroke\n\t\t(width 0)\n\t\t(type default)\n\t)\n\t(uuid ${q(uuid(key))})\n)`;

const noConnect = (p, key) => `(no_connect\n\t(at ${n(p[0])} ${n(p[1])})\n\t(uuid ${q(uuid(key))})\n)`;

const note = (text, p, key) => `(text ${q(text)}\n\t(exclude_from_sim no)\n\t(at ${n(p[0])} ${n(p[1])} 0)\n\t(effects\n\t\t(font\n\t\t\t(size 1.27 1.27)\n\t\t)\n\t\t(justify left bottom)\n\t)\n\t(uuid ${q(uuid(key))})\n)`;

// Local label for the per-key nets, global label for everything shared.
function label(net, p, rot, key) {
    const justify = rot === 90 || rot === 0 || rot === 270 ? 'left' : 'right';
    const effects = `(effects\n\t\t(font\n\t\t\t(size 1.27 1.27)\n\t\t)\n\t\t(justify ${justify}${rot === 90 ? ' bottom' : ''})\n\t)`;
    if (PRIVATE.test(net)) {
        return `(label ${q(net)}\n\t(at ${n(p[0])} ${n(p[1])} ${rot})\n\t${effects}\n\t(uuid ${q(uuid(key))})\n)`;
    }
    return `(global_label ${q(net)}\n\t(shape passive)\n\t(at ${n(p[0])} ${n(p[1])} ${rot})\n\t(fields_autoplaced yes)\n\t${effects}\n\t(uuid ${q(uuid(key))})\n\t(property "Intersheetrefs" "\${INTERSHEET_REFS}"\n\t\t(at ${n(p[0])} ${n(p[1])} 0)\n\t\t(effects\n\t\t\t(font\n\t\t\t\t(size 1.27 1.27)\n\t\t\t)\n\t\t\t(hide yes)\n\t\t)\n\t)\n)`;
}

function symbolInstance(kind, ref, footprint, at, root, project, hideValue = true) {
    const s = LIB[kind];
    const [x, y] = at;
    const L = [];
    L.push('(symbol');
    L.push(`\t(lib_id ${q(LIB_NAME + ':' + kind)})`);
    L.push(`\t(at ${n(x)} ${n(y)} 0)\n\t(unit 1)\n\t(exclude_from_sim no)\n\t(in_bom yes)\n\t(on_board yes)\n\t(dnp no)`);
    L.push(`\t(uuid ${q(uuid(ref + '/symbol'))})`);
    L.push(T(property('Reference', ref, x + s.refAt[0], y + s.refAt[1], 0, false)));
    L.push(T(property('Value', s.value, x, y - s.refAt[1], 0, hideValue)));
    L.push(T(property('Footprint', footprint, x, y, 0, true)));
    L.push(T(property('Datasheet', '~', x, y, 0, true)));
    L.push(T(property('Description', '', x, y, 0, true)));
    for (const p of s.pins) L.push(T(`(pin ${q(p[0])}\n\t(uuid ${q(uuid(ref + '/pin/' + p[0]))})\n)`));
    L.push(T(`(instances\n\t(project ${q(project)}\n\t\t(path ${q('/' + root)}\n\t\t\t(reference ${q(ref)})\n\t\t\t(unit 1)\n\t\t)\n\t)\n)`));
    L.push(')');
    return L.join('\n');
}

/* ---------------- 4. layout ---------------- */

const CELL = { w: 45.72, h: 25.4 };      // 18 x 10 grid units per key
const ORIGIN = { x: 38.1, y: 33.02 };   // both multiples of 1.27 = the connection grid;
                                         // x keeps the longest left-hand label off the frame
const STUB = 5.08;                        // wire + label stub length
const DIODE_DX = 10.16;                   // diode centre, relative to the socket

function buildBoard(board) {
    const comps = readBoard(path.join(DIR, board.src));
    const root = uuid(board.name + '/root');
    const project = board.name;
    const items = [];

    // Group the key cells by their private switch<->diode net.  A cell may hold
    // a socket, a diode, or (left half, row 0 col 0) only a diode because the
    // encoder's own switch sits in that key position.
    const cells = new Map();
    const cellFor = (net) => {
        const m = net.match(PRIVATE);
        if (!m) return null;
        if (!cells.has(net)) cells.set(net, { net, row: Number(m[1]), col: Number(m[2]), sw: null, diode: null });
        return cells.get(net);
    };
    const other = [];
    for (const c of comps) {
        if (c.footprint.startsWith('Kailh')) {
            const cell = cellFor(padNet(c, '2'));
            if (!cell) throw new Error(`${board.name}: ${c.ref} pin 2 is not on a SW_D_R*_C* net`);
            if (cell.sw) throw new Error(`${board.name}: two sockets on ${cell.net}`);
            cell.sw = c;
        } else if (c.footprint.startsWith('Diode_SMD')) {
            const cell = cellFor(padNet(c, '2'));
            if (!cell) throw new Error(`${board.name}: ${c.ref} pin 2 is not on a SW_D_R*_C* net`);
            if (cell.diode) throw new Error(`${board.name}: two diodes on ${cell.net}`);
            cell.diode = c;
        } else {
            other.push(c);
        }
    }

    const ordered = [...cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
    checkBoardOrder(board, ordered);
    for (const cell of ordered) {
        const key = `${board.name}/${cell.net}`;
        const cx = ORIGIN.x + cell.col * CELL.w;
        const cy = ORIGIN.y + cell.row * CELL.h;
        const dx = cx + DIODE_DX;
        if (!cell.diode) throw new Error(`${board.name}: ${cell.net} has a socket but no diode`);
        // The cell is the socket and its diode on the shared private net.
        if (cell.sw) {
            items.push(wire([cx + 5.08, cy], [dx - 3.81, cy], key + '/sw-anode'));
            items.push(symbolInstance('SW_SOCKET', cell.sw.ref, cell.sw.footprint, [cx, cy], root, project));
            // column label off socket pin 1
            items.push(wire([cx - 5.08, cy], [cx - 5.08 - STUB, cy], key + '/col'));
            items.push(label(padNet(cell.sw, '1'), [cx - 5.08 - STUB, cy], 180, key + '/collab'));
        } else {
            // encoder key position: no socket, so the diode anode is label-only
            items.push(wire([dx - 3.81, cy], [dx - 3.81 - 2.54, cy], key + '/anode'));
            items.push(note('encoder switch (S1/S2)', [cx - 5.08, cy + 6.35], key + '/note'));
        }
        const anodeLab = cell.sw ? [dx - 3.81, cy] : [dx - 3.81 - 2.54, cy];
        items.push(label(cell.net, anodeLab, 90, key + '/netlab'));
        items.push(symbolInstance('D_SOD123', cell.diode.ref, cell.diode.footprint, [dx, cy], root, project));
        items.push(wire([dx + 3.81, cy], [dx + 3.81 + STUB, cy], key + '/row'));
        items.push(label(padNet(cell.diode, '1'), [dx + 3.81 + STUB, cy], 0, key + '/rowlab'));
    }
    return { comps, other, cells: ordered, items, root, project };
}

function padNet(comp, num) {
    const pad = comp.pads.find((p) => p.num === num);
    if (!pad) throw new Error(`${comp.ref} has no pad ${num}`);
    return pad.net;
}

// The matrix truth is the private net name; the copper must agree with it: one
// row sits on one board y, and col order runs left to right across the board.
function checkBoardOrder(board, cells) {
    const rows = new Map();
    for (const c of cells) {
        if (!c.sw) continue;
        if (!rows.has(c.row)) rows.set(c.row, []);
        rows.get(c.row).push(c);
    }
    for (const [row, list] of rows) {
        const y0 = list[0].sw.at[1];
        for (const c of list) {
            if (Math.abs(c.sw.at[1] - y0) > 0.01) throw new Error(`${board.name}: ROW${row} keys are not on one board y (${c.sw.ref})`);
        }
        const byX = [...list].sort((a, b) => a.sw.at[0] - b.sw.at[0]);
        for (let i = 1; i < byX.length; i++) {
            if (byX[i].col <= byX[i - 1].col) throw new Error(`${board.name}: column order disagrees with board x at ${byX[i].sw.ref}`);
        }
    }
}

// Power / controller section: one row of parts, each pin labelled or NC'd.
function powerSection(board, built) {
    const out = [];
    const maxRow = built.cells.reduce((m, c) => Math.max(m, c.row), 0);
    const y = ORIGIN.y + (maxRow + 1) * CELL.h + 12.7;
    const layout = [
        { kind: 'CONN_BAT', x: ORIGIN.x, y, ref: 'J_BAT' },
        { kind: 'SW_SLIDE', x: ORIGIN.x + 33.02, y, ref: 'SW_PWR' },
        { kind: 'NICE_NANO', x: ORIGIN.x + 114.3, y: y + 5.08, ref: 'U1' },
    ];
    const enc = built.other.find((c) => c.footprint.startsWith('RotaryEncoder'));
    if (enc) layout.push({ kind: 'EC11', x: ORIGIN.x + 175.26, y: y + 5.08, ref: enc.ref });

    for (const part of layout) {
        const comp = built.comps.find((c) => c.ref === part.ref);
        if (!comp) throw new Error(`${board.name}: ${part.ref} missing from the board`);
        const key = `${board.name}/${part.ref}`;
        const pins = LIB[part.kind].pins;
        for (const pad of comp.pads) {
            if (!pad.num) continue;
            const pin = pins.find((p) => p[0] === pad.num);
            if (!pin) throw new Error(`${board.name}: ${part.ref} pad ${pad.num} has no schematic pin`);
            const px = part.x + pin[2];
            const py = part.y - pin[3];
            if (!pad.net) {
                out.push(noConnect([px, py], key + '/nc/' + pad.num));
                continue;
            }
            const side = pin[2] < 0 ? -1 : 1;
            const end = [px + side * STUB, py];
            out.push(wire([px, py], end, key + '/pin/' + pad.num));
            out.push(label(pad.net, end, side < 0 ? 180 : 0, key + '/lab/' + pad.num));
        }
        out.push(symbolInstance(part.kind, part.ref, comp.footprint, [part.x, part.y], built.root, built.project, part.kind === 'NICE_NANO' || part.kind === 'EC11'));
    }
    return out;
}

/* ---------------- 5. assemble the document ---------------- */

function emit(board) {
    const built = buildBoard(board);
    const items = [...built.items, ...powerSection(board, built)];
    const parts = [];
    parts.push('(kicad_sch');
    parts.push(`\t(version 20241209)\n\t(generator "eeschema")\n\t(generator_version "9.0")`);
    parts.push(`\t(uuid ${q(built.root)})`);
    // A3 holds the 7-column left half; the 9-column right half needs A2.
    const maxCol = built.cells.reduce((m, c) => Math.max(m, c.col), 0);
    const width = ORIGIN.x + maxCol * CELL.w + DIODE_DX + 3.81 + STUB + 12;  // + "ROWnn" text
    parts.push(`\t(paper ${q(width <= 400 ? 'A3' : 'A2')})`);
    parts.push(T(`(title_block\n\t(title ${q(board.title)})\n\t(rev "1")\n\t(comment 1 ${q('Generated by pcb/generate_schematic.js from ' + board.src)})\n\t(comment 2 ${q('Electrical truth: the .kicad_pcb pad nets')})\n)`));
    parts.push(T(`(lib_symbols\n${Object.keys(LIB).map((k) => T(libSymbol(k))).join('\n')}\n)`));
    parts.push(items.map((i) => T(i)).join('\n'));
    parts.push('\t(sheet_instances\n\t\t(path "/"\n\t\t\t(page "1")\n\t\t)\n\t)');
    parts.push('\t(embedded_fonts no)');
    parts.push(')');
    return { text: parts.join('\n') + '\n', built };
}

/* ---------------- 6. verification ---------------- */

const ERC_EXPLAINED = {
    /* ERC warnings that survive, and why they are harmless:
     *   lib_symbol_issues     - "library 'interlock' is not in the configuration":
     *                           the symbols are embedded in lib_symbols, the CLI
     *                           has no project sym-lib-table to resolve the nickname.
     *   footprint_link_issues - same for footprint nicknames (custom + stock libs).
     * Any other class is a real problem and fails the run. */
    lib_symbol_issues: 'symbol library nickname is not in the project table; symbols are embedded in lib_symbols',
    footprint_link_issues: 'footprint library nickname is not in the project table; footprints are declared, not linked',
};

function run(cmd, args) {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function checkErc(schFile, tmp) {
    const out = path.join(tmp, path.basename(schFile, '.kicad_sch') + '.erc.json');
    try {
        run('kicad-cli', ['sch', 'erc', '--format', 'json', '-o', out, schFile]);
    } catch (e) {
        throw new Error(`kicad-cli sch erc failed for ${schFile}:\n${e.stdout || ''}${e.stderr || ''}`);
    }
    const report = JSON.parse(fs.readFileSync(out, 'utf8'));
    const counts = { error: 0, warning: 0 };
    const byType = new Map();
    const errors = [];
    for (const sheet of report.sheets || []) {
        for (const v of sheet.violations || []) {
            counts[v.severity] = (counts[v.severity] || 0) + 1;
            const type = `${v.severity}:${v.type}`;
            byType.set(type, (byType.get(type) || 0) + 1);
            const detail = [v.description, ...(v.items || []).map((i) => i.description)].join(' | ');
            if (v.severity === 'error') errors.push(`${type}: ${detail}`);
            else if (!ERC_EXPLAINED[v.type]) errors.push(`unexplained warning ${type}: ${detail}`);
        }
    }
    if (errors.length) throw new Error(`ERC rejected ${schFile} (${errors.length}):\n  ` + errors.slice(0, 12).join('\n  '));
    return { counts, byType };
}

function checkNetlist(schFile, comps, tmp) {
    const out = path.join(tmp, path.basename(schFile, '.kicad_sch') + '.net');
    const res = spawnSync('kicad-cli', ['sch', 'export', 'netlist', '--format', 'kicadsexpr', '-o', out, schFile], { encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`kicad-cli sch export netlist failed for ${schFile}:\n${res.stderr || ''}`);
    // Two stderr lines are expected and are not about this schematic:
    //   * KiCad's annotator calls `J_BAT`/`SW_PWR` unannotated (no trailing digit).
    //     Those are the board's own references and the pad comparison depends on
    //     them, so the drawing mirrors them.
    //   * A nix sandbox has no fontconfig, and kicad-cli says so on startup.
    // Anything else on stderr is a real problem.
    const noise = (res.stderr || '')
        .replace(/^Warning: schematic has annotation errors.*$/m, '')
        .replace(/^Fontconfig error: .*$/gm, '')
        .trim();
    if (noise) throw new Error(`unexpected kicad-cli diagnostics for ${schFile}:\n${noise}`);
    const root = parseSexpr(fs.readFileSync(out, 'utf8'));
    // KiCad invents a net name for every pin with a no_connect marker; on the
    // board those pads simply carry no net, so normalise both sides to "".
    const norm = (name) => (/^unconnected-/.test(name) ? '' : name);
    const got = new Map();
    for (const net of kids(kid(root, 'nets') || [], 'net')) {
        const name = norm(kid(net, 'name')[1].replace(/^\//, ''));   // local labels are sheet pathed
        for (const node of kids(net, 'node')) got.set(kid(node, 'ref')[1] + '.' + kid(node, 'pin')[1], name);
    }

    const want = [];
    for (const c of comps) {
        for (const p of c.pads) {
            if (!p.num) continue;                                  // NPTH / mechanical pads
            want.push({ key: `${c.ref}.${p.num}`, net: p.net });
        }
    }
    const known = new Set(want.map((w) => w.key));
    const bad = want.filter((w) => (got.get(w.key) || '') !== w.net);
    for (const b of bad) {
        throw new Error(`netlist mismatch at ${b.key}: PCB has ${q(b.net)}, schematic has ${q(got.get(b.key) || '')} in ${schFile}`);
    }
    const extra = [...got.keys()].filter((k) => !known.has(k));
    if (extra.length) throw new Error(`netlist has pins that are not on the PCB (${schFile}): ${extra.join(', ')}`);
    const nets = new Set([...got.values()].filter(Boolean));
    return { compared: want.length, nets };
}

/* ---------------- main ---------------- */

// The schematic is generated from the choc board alone, so the mx board of the same
// half has to be electrically identical or the drawing would misdescribe it. Compare
// every pad's net (and the reference set) rather than trusting that it is.
function checkTwin(board) {
    const mapOf = (src) => {
        const m = new Map();
        for (const c of readBoard(path.join(DIR, src))) {
            for (const p of c.pads) if (p.num) m.set(`${c.ref}.${p.num}`, p.net);
        }
        return m;
    };
    const a = mapOf(board.src);
    const b = mapOf(board.twin);
    for (const [k, net] of a) {
        if ((b.get(k) ?? '') !== (net ?? '')) {
            throw new Error(`${board.twin} is not electrically identical to ${board.src} at ${k}: ${b.get(k) || '(no net)'} vs ${net || '(no net)'}`);
        }
    }
    for (const k of b.keys()) if (!a.has(k)) throw new Error(`${board.twin} has ${k}, which ${board.src} does not`);
    return a.size;
}

function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'interlock-sch-'));
    const summary = [];
    try {
        for (const board of BOARDS) {
            const twins = checkTwin(board);
            const { text, built } = emit(board);
            const file = path.join(OUT_DIR, board.name + '.kicad_sch');
            fs.writeFileSync(file, text);
            const erc = checkErc(file, tmp);
            const net = checkNetlist(file, built.comps, tmp);
            summary.push({
                board: board.name, file, bytes: Buffer.byteLength(text),
                comps: built.comps.length, keys: built.cells.length, twins,
                erc, nets: net.nets.size, pads: net.compared,
            });
        }
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    for (const s of summary) {
        console.log(`\n${s.file}`);
        console.log(`  ${s.bytes} bytes, ${s.comps} components (${s.keys} key cells), ${s.nets} nets, ${s.pads} pads compared`);
        console.log(`  choc and mx boards of this half agree on all ${s.twins} pad nets`);
        console.log(`  ERC: ${s.erc.counts.error} errors, ${s.erc.counts.warning} warnings`);
        for (const [type, count] of [...s.erc.byType].sort()) console.log(`    ${count} x ${type} - ${ERC_EXPLAINED[type.split(':')[1]] || ''}`);
        console.log('  netlist pin->net map matches the PCB exactly');
    }
    console.log('\nSchematic generation + verification OK');
}

main();
