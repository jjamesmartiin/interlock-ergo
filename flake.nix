{
  description = "Interlock Ergo - Wireless Split Keyboard with 6YHN Right-Hand Layout";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    zmk-nix = {
      url = "github:lilyinstarlight/zmk-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, zmk-nix }:
    let
      forAllSystems = nixpkgs.lib.genAttrs (nixpkgs.lib.attrNames zmk-nix.packages);
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          zmk = zmk-nix.legacyPackages.${system};

          srcFilter = nixpkgs.lib.sourceFilesBySuffices self [
            ".board" ".cmake" ".conf" ".defconfig" ".dts" ".dtsi"
            ".json" ".keymap" ".overlay" ".shield" ".yml" ".yaml"
          ];
        in
        rec {
          # 1. ZMK Firmware Packages via zmk-nix
          firmware-left = zmk.buildKeyboard {
            name = "interlock-ergo-left";
            src = srcFilter;
            board = "nice_nano_v2";
            shield = "interlock_ergo_left";
            zephyrDepsHash = "sha256-F03oJNHWmHlpFc1JHyvqX02WL+Pg6ZcNWpCaiDfJANA=";
          };

          firmware-right = zmk.buildKeyboard {
            name = "interlock-ergo-right";
            src = srcFilter;
            board = "nice_nano_v2";
            shield = "interlock_ergo_right";
            zephyrDepsHash = "sha256-F03oJNHWmHlpFc1JHyvqX02WL+Pg6ZcNWpCaiDfJANA=";
          };

          firmware-dongle = zmk.buildKeyboard {
            name = "interlock-ergo-dongle";
            src = srcFilter;
            board = "seeeduino_xiao_ble";
            shield = "interlock_ergo_dongle";
            zephyrDepsHash = "sha256-F03oJNHWmHlpFc1JHyvqX02WL+Pg6ZcNWpCaiDfJANA=";
          };

          # 2. 3D Printable CAD Meshes (OpenSCAD)
          cad = pkgs.stdenv.mkDerivation {
            pname = "interlock-ergo-cad";
            version = "0.1.0";
            src = ./.;
            nativeBuildInputs = [ pkgs.nodejs pkgs.openscad ];
            buildPhase = ''
              export HOME=$TMPDIR
              node cad/build_models.js
            '';
            installPhase = ''
              mkdir -p $out
              cp -r cad/dist/* $out/
            '';
          };

          # 3. KiCad PCBs & JLCPCB Production Gerbers
          pcb = pkgs.stdenv.mkDerivation {
            pname = "interlock-ergo-pcb";
            version = "0.1.0";
            src = ./.;
            nativeBuildInputs = [ pkgs.nodejs pkgs.kicad pkgs.zip ];
            buildPhase = ''
              export HOME=$TMPDIR
              node pcb/generate_pcb.js
            '';
            installPhase = ''
              mkdir -p $out
              cp -r pcb/dist/* $out/
            '';
          };

          # 4. Complete Manufacturing & Hardware Bundle
          default = pkgs.symlinkJoin {
            name = "interlock-ergo-release-package";
            paths = [ cad pcb ];
          };
        }
      );

      # Flashing utility apps via zmk-nix
      apps = forAllSystems (system: {
        flash-left = {
          type = "app";
          program = "${zmk-nix.packages.${system}.flash.override { firmware = self.packages.${system}.firmware-left; }}/bin/flash";
        };
        flash-right = {
          type = "app";
          program = "${zmk-nix.packages.${system}.flash.override { firmware = self.packages.${system}.firmware-right; }}/bin/flash";
        };
        flash-dongle = {
          type = "app";
          program = "${zmk-nix.packages.${system}.flash.override { firmware = self.packages.${system}.firmware-dongle; }}/bin/flash";
        };
      });

      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            name = "interlock-ergo-dev";
            packages = with pkgs; [
              nodejs
              openscad
              kicad
              zip
              unzip
              python3Packages.west
            ] ++ (zmk-nix.devShells.${system}.default.nativeBuildInputs or []);

            shellHook = ''
              echo "🖮  Interlock Ergo Nix Development Shell"
              echo "----------------------------------------"
              echo "• Run test suite:   node tests/test_matrix.js"
              echo "• Compile CAD STLs: nix build .#cad"
              echo "• Generate PCBs:    nix build .#pcb"
              echo "• Build Release:    nix build"
              echo ""
            '';
          };
        }
      );
    };
}
