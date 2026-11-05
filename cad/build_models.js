const fs = require('fs');
const os = require('os');
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
        mode: 'assembly'
    },
    {
        name: 'dongle_case_base.stl',
        file: 'dongle_case.scad',
        mode: 'base'
    },
    {
        name: 'dongle_case_lid.stl',
        file: 'dongle_case.scad',
        mode: 'lid'
    }
];

function hasCmd(bin) {
    try {
        execSync(`command -v ${bin} >/dev/null 2>&1`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

// OpenSCAD is normally on PATH (devShell, nix build, CI). On a bare NixOS shell it
// is not, so fall back to `nix-shell -p openscad`. Going through nix-shell means the
// command line has to survive two levels of shell, which mangles -D quoting: write
// the command into a temp script instead and let nix-shell just run the script.
// (Losing the quotes makes OpenSCAD read `mode="left"` as the variable `left`, fall
// through to the assembly branch, and export both halves into one file.)
const localOpenscad = hasCmd("openscad");
const hasNixShell = hasCmd("nix-shell");

if (!localOpenscad && !hasNixShell) {
    console.error("openscad not found on PATH and nix-shell is unavailable.\n" +
        "Install OpenSCAD, or run this from `nix develop`.");
    process.exit(1);
}

function renderOne(inFile, outFile, mode) {
    const inner = `openscad ${mode ? `-D 'mode="${mode}"'` : ""} -o '${outFile}' '${inFile}'`;
    if (localOpenscad) {
        execSync(inner, { stdio: "inherit" });
        return;
    }
    const script = path.join(os.tmpdir(), `interlock-ergo-openscad-${process.pid}.sh`);
    fs.writeFileSync(script, `#!/bin/sh\nset -e\nexec ${inner}\n`, { mode: 0o755 });
    try {
        execSync(`nix-shell -p openscad --run '${script}'`, { stdio: "inherit" });
    } finally {
        fs.unlinkSync(script);
    }
}

for (const t of targets) {
    const outFile = path.join(distDir, t.name);
    const inFile = path.join(cadDir, t.file);
    console.log(`Generating ${t.name}...`);
    renderOne(inFile, outFile, t.mode);
    const stat = fs.statSync(outFile);
    console.log(`  -> Size: ${(stat.size / 1024).toFixed(1)} KB`);
}

console.log(`✓ All ${targets.length} STL models generated in cad/dist/.`);
