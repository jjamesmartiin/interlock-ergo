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

      # ZMK v0.2 (and v0.3.0) target the Zephyr SDK 0.16 toolchain (ARM GCC 12).
      # nixpkgs' gcc-arm-embedded is now GCC 15, which rejects ZMK's
      # `int` -> `void *` user_data cast in app/src/split/bluetooth/central_bas_proxy.c
      # as a hard error. Upstream only fixed it after v0.3.0 (zmkfirmware/zmk#3105),
      # so pin the newest compiler that still accepts the pinned ZMK: GCC 13 (it
      # warns instead of erroring). Bump this when west.yml moves off v0.2.
      armGcc = final: prev: { gcc-arm-embedded = prev.gcc-arm-embedded-13; };
      mkPkgs = system: import nixpkgs { inherit system; overlays = [ armGcc ]; };
    in
    {
      packages = forAllSystems (system:
        let
          pkgs = mkPkgs system;
          zmk = zmk-nix.lib.buildersFor pkgs;

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
            zephyrDepsHash = "sha256-DOz+hpthxe7jyzZouYpe/aFy9RQgTFnIp+HUMmz3v50=";
          };

          firmware-right = zmk.buildKeyboard {
            name = "interlock-ergo-right";
            src = srcFilter;
            board = "nice_nano_v2";
            shield = "interlock_ergo_right";
            zephyrDepsHash = "sha256-DOz+hpthxe7jyzZouYpe/aFy9RQgTFnIp+HUMmz3v50=";
          };

          firmware-dongle = zmk.buildKeyboard {
            name = "interlock-ergo-dongle";
            src = srcFilter;
            board = "seeeduino_xiao_ble";
            shield = "interlock_ergo_dongle";
            zephyrDepsHash = "sha256-DOz+hpthxe7jyzZouYpe/aFy9RQgTFnIp+HUMmz3v50=";
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
              node tests/test_models.js
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
          pkgs = mkPkgs system;
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
              echo "• Run test suite:   node tests/test_matrix.js && node tests/test_models.js"
              echo "• Compile CAD STLs: nix build .#cad"
              echo "• Generate PCBs:    nix build .#pcb   (fails until every board is DRC-clean)"
              echo "• Build Release:    nix build"
              echo ""
            '';
          };
        }
      );
    };
}
