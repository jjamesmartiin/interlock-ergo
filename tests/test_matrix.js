const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Running Interlock Ergo Matrix & Keymap Verification...');

// 1. Read dtsi
const dtsiContent = fs.readFileSync(path.join(__dirname, '../config/boards/shields/interlock_ergo/interlock_ergo.dtsi'), 'utf8');
const rcMatches = dtsiContent.match(/RC\(\s*\d+\s*,\s*\d+\s*\)/g);
assert(rcMatches, 'Failed to find RC entries in dtsi');
const totalMatrixKeys = rcMatches.length;
console.log(`Found ${totalMatrixKeys} matrix positions in default_transform.`);

// Verify 6-Y-H-N column mapping:
// In dtsi map, columns 0..6 are left, columns >= 7 are right.
const rightEntries = rcMatches.filter(rc => {
    const col = parseInt(rc.split(',')[1]);
    return col >= 7;
});
const leftEntries = rcMatches.filter(rc => {
    const col = parseInt(rc.split(',')[1]);
    return col < 7;
});
console.log(`Left half matrix keys: ${leftEntries.length}, Right half matrix keys: ${rightEntries.length}`);

// 2. Read keymap
const keymapContent = fs.readFileSync(path.join(__dirname, '../config/boards/shields/interlock_ergo/interlock_ergo.keymap'), 'utf8');

// Parse layers
const layerRegex = /(\w+_layer)\s*\{[\s\S]*?bindings\s*=\s*<([\s\S]*?)>;/g;
let match;
let layerCount = 0;

while ((match = layerRegex.exec(keymapContent)) !== null) {
    layerCount++;
    const layerName = match[1];
    const rawBindings = match[2];
    
    // Extract tokens starting with &
    const tokens = rawBindings.match(/&[a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9_]+)*/g) || [];
    console.log(`Layer '${layerName}': ${tokens.length} keybindings parsed.`);
    assert.strictEqual(tokens.length, totalMatrixKeys, 
        `Layer ${layerName} has ${tokens.length} keys, expected ${totalMatrixKeys}`);

    if (layerName === 'default_layer') {
        // Find 6, Y, H, N keys
        // Row 0 right starts with N6 (token index 7)
        // Row 1 right starts with Y (token index 16 + 7 = 23)
        // Row 2 right starts with H (token index 16 + 16 + 7 = 39)
        // Row 3 right starts with N (token index 16 + 16 + 14 + 7 = 53)
        const key6 = tokens[7];
        const keyY = tokens[23];
        const keyH = tokens[39];
        const keyN = tokens[53];

        console.log(`Right Column 7 Keys: R0='${key6}', R1='${keyY}', R2='${keyH}', R3='${keyN}'`);
        assert(key6.includes('N6'), `Expected &kp N6 at right col 7, got ${key6}`);
        assert(keyY.includes('Y'), `Expected &kp Y at right col 7, got ${keyY}`);
        assert(keyH.includes('H'), `Expected &kp H at right col 7, got ${keyH}`);
        assert(keyN.includes('N'), `Expected &kp N at right col 7, got ${keyN}`);

        // Left column 6 should have 5, T, G, B
        const key5 = tokens[6];
        const keyT = tokens[22];
        const keyG = tokens[38];
        const keyB = tokens[52];
        console.log(`Left Column 6 Keys: R0='${key5}', R1='${keyT}', R2='${keyG}', R3='${keyB}'`);
        assert(key5.includes('N5'), `Expected &kp N5 at left col 6, got ${key5}`);
        assert(keyT.includes('T'), `Expected &kp T at left col 6, got ${keyT}`);
        assert(keyG.includes('G'), `Expected &kp G at left col 6, got ${keyG}`);
        assert(keyB.includes('B'), `Expected &kp B at left col 6, got ${keyB}`);
    }
}

assert(layerCount >= 3, 'Expected at least 3 layers in keymap');
console.log('✓ All matrix, keymap, and 6-Y-H-N assertions passed successfully!');
