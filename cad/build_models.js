const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cadDir = __dirname;
const distDir = path.join(cadDir, 'dist');

if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

console.log('--- Compiling OpenSCAD Models via nix-shell ---');

const targets = [
    {
        name: 'interlock_choc_left.stl',
        file: 'interlock_case_choc.scad',
        mode: 'left'
    },
    {
        name: 'interlock_choc_right.stl',
        file: 'interlock_case_choc.scad',
        mode: 'right'
    },
    {
        name: 'interlock_mx_left.stl',
        file: 'interlock_case_mx.scad',
        mode: 'left'
    },
    {
        name: 'interlock_mx_right.stl',
        file: 'interlock_case_mx.scad',
        mode: 'right'
    },
    {
        name: 'interlock_plate_choc_left.stl',
        file: 'interlock_plate_choc.scad',
        mode: 'left'
    },
    {
        name: 'interlock_plate_choc_right.stl',
        file: 'interlock_plate_choc.scad',
        mode: 'right'
    },
    {
        name: 'interlock_plate_mx_left.stl',
        file: 'interlock_plate_mx.scad',
        mode: 'left'
    },
    {
        name: 'interlock_plate_mx_right.stl',
        file: 'interlock_plate_mx.scad',
        mode: 'right'
    },
    {
        name: 'dongle_case.stl',
        file: 'dongle_case.scad',
        mode: null
    }
];

function getCmd(bin) {
    try {
        execSync(`command -v ${bin} >/dev/null 2>&1`);
        return bin;
    } catch {
        try {
            execSync('command -v nix-shell >/dev/null 2>&1');
            return `nix-shell -p ${bin} --run ${bin}`;
        } catch {
            return bin;
        }
    }
}

const openscadBin = getCmd('openscad');

for (const t of targets) {
    const outFile = path.join(distDir, t.name);
    const inFile = path.join(cadDir, t.file);
    const defArg = t.mode ? `-D mode="${t.mode}"` : '';
    console.log(`Generating ${t.name}...`);
    const cmd = `${openscadBin} ${defArg} -o '${outFile}' '${inFile}'`;
    execSync(cmd, { stdio: 'inherit' });
    const stat = fs.statSync(outFile);
    console.log(`  -> Size: ${(stat.size / 1024).toFixed(1)} KB`);
}

console.log('✓ All 3D STL models successfully generated!');
