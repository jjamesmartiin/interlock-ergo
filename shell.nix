{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  name = "interlock-ergo-shell";

  packages = with pkgs; [
    nodejs
    openscad
    kicad
    zip
    unzip
    python3Packages.west
  ];

  shellHook = ''
    echo "🖮  Interlock Ergo Development Environment"
    echo "----------------------------------------"
    echo "• Test Matrix:      node tests/test_matrix.js"
    echo "• Build CAD STLs:   node cad/build_models.js"
    echo "• Generate PCBs:    node pcb/generate_pcb.js"
    echo ""
  '';
}
