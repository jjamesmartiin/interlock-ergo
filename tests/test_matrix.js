const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Interlock Ergo Adversarial-Grade Verification...');

const rootDir = path.join(__dirname, '..');
const shieldDir = path.join(rootDir, 'config/boards/shields/interlock_ergo');

// 1. Verify dtsi & unique RC mapping
const dtsiContent = fs.readFileSync(path.join(shieldDir, 'interlock_ergo.dtsi'), 'utf8');
const mapStart = dtsiContent.indexOf('map = <');
const mapEnd = dtsiContent.indexOf('>;', mapStart);
const mapBlock = dtsiContent.slice(mapStart, mapEnd);
const rcMatches = mapBlock.match(/RC\(\s*\d+\s*,\s*\d+\s*\)/g);
const mapRCs = [...rcMatches].map((rc) => rc.replace(/[^\d,]/g, ''));
assert(rcMatches, 'Failed to find RC entries in dtsi');
const totalMatrixKeys = rcMatches.length;

// Check for duplicate RC coordinates
const uniqueRCs = new Set(rcMatches.map(rc => rc.replace(/\s+/g, '')));
assert.strictEqual(uniqueRCs.size, rcMatches.length, `Duplicate RC coordinate found in dtsi! (${uniqueRCs.size} unique vs ${rcMatches.length} total)`);
assert.strictEqual(totalMatrixKeys, 68, `Expected exactly 68 keys in dtsi, got ${totalMatrixKeys}`);
console.log(`Found ${totalMatrixKeys} unique matrix positions in default_transform.`);

// 2. Verify Right Overlay has col-offset on &default_transform (NOT in kscan0)
const rightOverlay = fs.readFileSync(path.join(shieldDir, 'interlock_ergo_right.overlay'), 'utf8');
assert(!rightOverlay.includes('col-offset = <6>;\n        row-gpios') && !rightOverlay.match(/kscan0[\s\S]*?col-offset/),
    'CRITICAL: col-offset MUST NOT be placed inside kscan0 (it is a matrix-transform property)');
assert(rightOverlay.match(/&default_transform\s*\{[\s\S]*?col-offset\s*=\s*<6>;/),
    'CRITICAL: col-offset = <6> must be assigned to &default_transform');
console.log('✓ Verified col-offset = <6> is correctly attached to &default_transform.');

// 3. Verify Kconfig.defconfig enables CONFIG_ZMK_SPLIT
const defconfig = fs.readFileSync(path.join(shieldDir, 'Kconfig.defconfig'), 'utf8');
assert(defconfig.includes('config ZMK_SPLIT\n    default y'), 'CRITICAL: CONFIG_ZMK_SPLIT must be explicitly enabled in Kconfig.defconfig');
assert(defconfig.includes('config ZMK_SPLIT_ROLE_CENTRAL\n    default y'), 'CRITICAL: CONFIG_ZMK_SPLIT_ROLE_CENTRAL must be enabled for dongle');
console.log('✓ Verified CONFIG_ZMK_SPLIT and central roles are active in Kconfig.defconfig.');

// 4. Verify shield conf files exist and are correctly named
assert(fs.existsSync(path.join(shieldDir, 'interlock_ergo_left.conf')), 'interlock_ergo_left.conf must exist');
assert(fs.existsSync(path.join(shieldDir, 'interlock_ergo_right.conf')), 'interlock_ergo_right.conf must exist');
assert(fs.existsSync(path.join(shieldDir, 'interlock_ergo_dongle.conf')), 'interlock_ergo_dongle.conf must exist');
console.log('✓ Verified all three exact shield .conf files are present.');

// 4b. ANSI row stagger must be identical in the CAD and the PCB generator, or the
//     plate, case and PCB drill different holes for the same key.
function staggerTable(text, re, label) {
    const m = text.match(re);
    assert(m, `Could not find the row stagger table in ${label}`);
    return m[1].split(',').map(s => parseFloat(s.trim()));
}
const scadStagger = staggerTable(
    fs.readFileSync(path.join(rootDir, 'cad/interlock_params.scad'), 'utf8'),
    /row_stagger_u\s*=\s*\[([^\]]+)\]/, 'cad/interlock_params.scad');
const pcbStagger = staggerTable(
    fs.readFileSync(path.join(rootDir, 'pcb/generate_pcb.js'), 'utf8'),
    /ROW_STAGGER_U\s*=\s*\[([^\]]+)\]/, 'pcb/generate_pcb.js');
assert.strictEqual(scadStagger.length, 5, `Row stagger must have 5 entries, got ${scadStagger.length}`);
assert.deepStrictEqual(pcbStagger, scadStagger,
    `Row stagger differs: CAD [${scadStagger}] vs PCB [${pcbStagger}]`);
assert.strictEqual(scadStagger[0], 0, 'Number row must not be staggered');
assert(Math.max(...scadStagger) > 0, 'Row stagger is all zeros - the board is a plain grid');
console.log(`✓ Row stagger ${scadStagger.join('/')} u identical in CAD and PCB.`);

// 5. Verify Keymap Layers
const keymapContent = fs.readFileSync(path.join(shieldDir, 'interlock_ergo.keymap'), 'utf8');
const layerRegex = /(\w+_layer)\s*\{[\s\S]*?bindings\s*=\s*<([\s\S]*?)>;/g;
let match;
let layerCount = 0;

while ((match = layerRegex.exec(keymapContent)) !== null) {
    layerCount++;
    const layerName = match[1];
    const rawBindings = match[2];
    const tokens = rawBindings.match(/&[a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*/g) || [];
    
    assert.strictEqual(tokens.length, totalMatrixKeys, 
        `Layer ${layerName} has ${tokens.length} keys, expected ${totalMatrixKeys}`);

    if (layerName === 'default_layer') {
        // Indices come from the transform, not from a hand-counted constant: the
        // bindings are in map order, so the Nth RC(r,c) is the Nth token. Hardcoding
        // these went stale the moment a column moved.
        const idx = (r, c) => mapRCs.indexOf(`${r},${c}`);
        const at = (r, c) => tokens[idx(r, c)];
        const seam = 5;   // last column of the left half; 6 is the first of the right

        // The 6/Y/H/N column must be on the right half, and the left half must end
        // at 5/T/G/B - that split is ANSI's, not an accident of the wiring.
        assert(at(0, seam + 1).includes('N6'), `Expected &kp N6 at the first right column, got ${at(0, seam + 1)}`);
        assert(at(1, seam + 1).includes('Y'), `Expected &kp Y at the first right column, got ${at(1, seam + 1)}`);
        assert(at(2, seam + 1).includes('H'), `Expected &kp H at the first right column, got ${at(2, seam + 1)}`);
        assert(at(3, seam + 1).includes('N'), `Expected &kp N at the first right column, got ${at(3, seam + 1)}`);

        assert(at(0, seam).includes('N5'), `Expected &kp N5 at the last left column, got ${at(0, seam)}`);
        assert(at(1, seam).includes('T'), `Expected &kp T at the last left column, got ${at(1, seam)}`);
        assert(at(2, seam).includes('G'), `Expected &kp G at the last left column, got ${at(2, seam)}`);
        assert(at(3, seam).includes('B'), `Expected &kp B at the last left column, got ${at(3, seam)}`);

        // Assert arrow cluster geometry: Up sits directly above Down in an inverted-T
        const colOffset = 6;
        const keyX = (r, c) => (c - colOffset) + scadStagger[r];
        const findKeyRC = (keyName) => {
            for (let i = 0; i < tokens.length; i++) {
                if (tokens[i] === keyName) {
                    const [r, c] = mapRCs[i].split(',').map(Number);
                    return { r, c, x: keyX(r, c) };
                }
            }
            throw new Error(`Key ${keyName} not found in default layer`);
        };
        const up = findKeyRC('&kp UP');
        const down = findKeyRC('&kp DOWN');
        const left = findKeyRC('&kp LEFT');
        const right = findKeyRC('&kp RIGHT');

        assert(Math.abs(up.x - down.x) < 1e-6,
            `Arrow cluster error: UP (x=${up.x}u) is not directly above DOWN (x=${down.x}u)`);
        assert(Math.abs(down.x - left.x - 1.0) < 1e-6,
            `Arrow cluster error: LEFT (x=${left.x}u) is not 1u left of DOWN (x=${down.x}u)`);
        assert(Math.abs(right.x - down.x - 1.0) < 1e-6,
            `Arrow cluster error: RIGHT (x=${right.x}u) is not 1u right of DOWN (x=${down.x}u)`);
        console.log(`✓ Arrow cluster forms exact inverted-T: Up/Down aligned at x=${up.x}u, Left at ${left.x}u, Right at ${right.x}u.`);
    }
}
assert(layerCount >= 3, 'Expected at least 3 layers in keymap');

// 6. Fab artifacts may only exist for boards that passed DRC.
//    pcb/generate_pcb.js refuses to emit gerbers/BOM/CPL for a board with DRC
//    violations and withdraws anything it published earlier, so the only way a
//    package can be present is if its board is clean.
const distDir = path.join(rootDir, 'pcb/dist');
for (const b of ['left_choc', 'right_choc', 'left_mx', 'right_mx']) {
    assert(fs.existsSync(path.join(rootDir, `pcb/interlock_ergo_${b}.kicad_pcb`)),
        `Missing board source pcb/interlock_ergo_${b}.kicad_pcb`);
    const zipPath = path.join(distDir, `interlock_ergo_${b}_gerbers.zip`);
    if (!fs.existsSync(zipPath)) continue; // no fab package published for this board
    const rptPath = path.join(distDir, 'drc', `interlock_ergo_${b}.rpt`);
    assert(fs.existsSync(rptPath), `Published ${b} gerbers without a DRC report`);
    assert(/\*\* Found 0 DRC violations/.test(fs.readFileSync(rptPath, 'utf8')),
        `Published ${b} gerbers whose DRC report shows violations - do not order`);
    assert(fs.statSync(zipPath).size > 20000, `Gerber zip ${b} is suspiciously small`);
}
console.log('✓ No fab package is published for a board that fails DRC.');

// 7. Verify 3D STL models
// The exported STLs are covered by tests/test_models.js (single watertight shell,
// dimensions against the stackup). Keeping an existence check here as well only
// made this suite depend on cad/dist/ existing, which it does not on a fresh clone.

// 8. Verify ZMK West Manifest Pins Stable Revision
const westYml = fs.readFileSync(path.join(rootDir, 'config/west.yml'), 'utf8');
assert(westYml.includes('revision: v0.2'), 'west.yml should pin stable revision v0.2 for reproducible builds');
console.log('✓ Verified west.yml pins stable release v0.2.');

// 9. ZMK_KEYBOARD_NAME becomes the BLE device name, and Zephyr asserts it fits
//    in BT_DEVICE_NAME_MAX (16 bytes including the NUL). "Interlock Ergo Dongle"
//    was 21 and failed the dongle build with a static assertion. The shift
//    register / adc-gain names are not checked here; only the length matters.
const nameMatches = [...defconfig.matchAll(/config ZMK_KEYBOARD_NAME\s*(?:#[^\n]*\n\s*)*default\s+"([^"]*)"/g)];
assert(nameMatches.length >= 2, `Expected a ZMK_KEYBOARD_NAME default per shield block, found ${nameMatches.length}`);
for (const [, name] of nameMatches) {
    assert(name.length <= 15,
        `ZMK_KEYBOARD_NAME "${name}" is ${name.length} chars; Zephyr's BT_DEVICE_NAME_MAX is 16 including the NUL, so the shield will not compile`);
}
console.log(`✓ Keyboard names fit BT_DEVICE_NAME_MAX (16 incl. NUL): ${nameMatches.map((m) => `"${m[1]}"`).join(', ')}.`);

console.log('✓ ALL FIRMWARE / MATRIX / FAB-GATE CHECKS PASSED SUCCESSFULLY!');
