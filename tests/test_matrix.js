const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Interlock Ergo Adversarial-Grade Verification...');

const shieldDir = path.join(__dirname, '../config/boards/shields/interlock_ergo');

// 1. Verify dtsi & unique RC mapping
const dtsiContent = fs.readFileSync(path.join(shieldDir, 'interlock_ergo.dtsi'), 'utf8');
const rcMatches = dtsiContent.match(/RC\(\s*\d+\s*,\s*\d+\s*\)/g);
assert(rcMatches, 'Failed to find RC entries in dtsi');
const totalMatrixKeys = rcMatches.length;

// Check for duplicate RC coordinates
const uniqueRCs = new Set(rcMatches.map(rc => rc.replace(/\s+/g, '')));
assert.strictEqual(uniqueRCs.size, rcMatches.length, `Duplicate RC coordinate found in dtsi! (${uniqueRCs.size} unique vs ${rcMatches.length} total)`);
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
console.log('✓ All adversarial tests passed: firmware splits, transforms, overlays, and 6YHN verified!');
