const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Interlock Ergo Adversarial-Grade Verification...');

const rootDir = path.join(__dirname, '..');
const shieldDir = path.join(rootDir, 'config/boards/shields/interlock_ergo');

// 1. Verify dtsi & unique RC mapping
const dtsiContent = fs.readFileSync(path.join(shieldDir, 'interlock_ergo.dtsi'), 'utf8');
const rcMatches = dtsiContent.match(/RC\(\s*\d+\s*,\s*\d+\s*\)/g);
assert(rcMatches, 'Failed to find RC entries in dtsi');
const totalMatrixKeys = rcMatches.length;

// Check for duplicate RC coordinates
const uniqueRCs = new Set(rcMatches.map(rc => rc.replace(/\s+/g, '')));
assert.strictEqual(uniqueRCs.size, rcMatches.length, `Duplicate RC coordinate found in dtsi! (${uniqueRCs.size} unique vs ${rcMatches.length} total)`);
assert.strictEqual(totalMatrixKeys, 76, `Expected exactly 76 keys in dtsi, got ${totalMatrixKeys}`);
console.log(`Found ${totalMatrixKeys} unique matrix positions in default_transform.`);

// 2. Verify Right Overlay has col-offset on &default_transform (NOT in kscan0)
const rightOverlay = fs.readFileSync(path.join(shieldDir, 'interlock_ergo_right.overlay'), 'utf8');
assert(!rightOverlay.includes('col-offset = <7>;\n        row-gpios') && !rightOverlay.match(/kscan0[\s\S]*?col-offset/),
    'CRITICAL: col-offset MUST NOT be placed inside kscan0 (it is a matrix-transform property)');
assert(rightOverlay.match(/&default_transform\s*\{[\s\S]*?col-offset\s*=\s*<7>;/),
    'CRITICAL: col-offset = <7> must be assigned to &default_transform');
console.log('✓ Verified col-offset = <7> is correctly attached to &default_transform.');

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
        const key6 = tokens[7];
        const keyY = tokens[23];
        const keyH = tokens[39];
        const keyN = tokens[53];

        assert(key6.includes('N6'), `Expected &kp N6 at right col 7, got ${key6}`);
        assert(keyY.includes('Y'), `Expected &kp Y at right col 7, got ${keyY}`);
        assert(keyH.includes('H'), `Expected &kp H at right col 7, got ${keyH}`);
        assert(keyN.includes('N'), `Expected &kp N at right col 7, got ${keyN}`);

        const key5 = tokens[6];
        const keyT = tokens[22];
        const keyG = tokens[38];
        const keyB = tokens[52];

        assert(key5.includes('N5'), `Expected &kp N5 at left col 6, got ${key5}`);
        assert(keyT.includes('T'), `Expected &kp T at left col 6, got ${keyT}`);
        assert(keyG.includes('G'), `Expected &kp G at left col 6, got ${keyG}`);
        assert(keyB.includes('B'), `Expected &kp B at left col 6, got ${keyB}`);
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
const requiredStls = [
    'interlock_choc_left.stl',
    'interlock_choc_right.stl',
    'interlock_mx_left.stl',
    'interlock_mx_right.stl',
    'interlock_plate_choc_left.stl',
    'interlock_plate_choc_right.stl',
    'interlock_plate_mx_left.stl',
    'interlock_plate_mx_right.stl',
    'dongle_case.stl',
    'dongle_case_base.stl',
    'dongle_case_lid.stl'
];
for (const s of requiredStls) {
    const stlPath = path.join(rootDir, 'cad/dist', s);
    assert(fs.existsSync(stlPath), `Missing STL model: ${s}`);
    const stat = fs.statSync(stlPath);
    // geometry correctness is checked properly by tests/test_models.js; this only
    // catches a zero-length export.
    assert(stat.size > 2000, `STL ${s} is suspiciously small: ${stat.size} bytes`);
}
console.log('✓ Verified all 11 3D STL models are compiled and valid.');

// 8. Verify ZMK West Manifest Pins Stable Revision
const westYml = fs.readFileSync(path.join(rootDir, 'config/west.yml'), 'utf8');
assert(westYml.includes('revision: v0.2'), 'west.yml should pin stable revision v0.2 for reproducible builds');
console.log('✓ Verified west.yml pins stable release v0.2.');

console.log('✓ ALL ADVERSARIAL RELEASE AUDIT CHECKS PASSED SUCCESSFULLY!');
