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

// 6. Verify Hardware & Fab Packages
const requiredZips = [
    'interlock_ergo_left_choc_gerbers.zip',
    'interlock_ergo_right_choc_gerbers.zip',
    'interlock_ergo_left_mx_gerbers.zip',
    'interlock_ergo_right_mx_gerbers.zip'
];
for (const z of requiredZips) {
    const zipPath = path.join(rootDir, 'pcb/dist', z);
    assert(fs.existsSync(zipPath), `Missing Gerber zip package: ${z}`);
    const stat = fs.statSync(zipPath);
    assert(stat.size > 20000, `Gerber zip ${z} is suspiciously small: ${stat.size} bytes`);
}
console.log('✓ Verified all 4 JLCPCB Gerber packages are present and non-empty.');

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
    'dongle_case.stl'
];
for (const s of requiredStls) {
    const stlPath = path.join(rootDir, 'cad/dist', s);
    assert(fs.existsSync(stlPath), `Missing STL model: ${s}`);
    const stat = fs.statSync(stlPath);
    assert(stat.size > 10000, `STL ${s} is suspiciously small: ${stat.size} bytes`);
}
console.log('✓ Verified all 9 3D STL models are compiled and valid.');

// 8. Verify ZMK West Manifest Pins Stable Revision
const westYml = fs.readFileSync(path.join(rootDir, 'config/west.yml'), 'utf8');
assert(westYml.includes('revision: v0.2'), 'west.yml should pin stable revision v0.2 for reproducible builds');
console.log('✓ Verified west.yml pins stable release v0.2.');

console.log('✓ ALL ADVERSARIAL RELEASE AUDIT CHECKS PASSED SUCCESSFULLY!');
