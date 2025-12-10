{
  description = "A Nix-based development environment for the sdk-ts project";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
        
        # Minimal Python environment for basic tools
        pythonEnv = pkgs.python312.withPackages (ps: with ps; [
          pip
          # Basic packages kept for potential future use
        ]);
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs
            bun

            # Python available if needed for other tools
            pythonEnv
            
            # System libraries
            stdenv.cc.cc.lib  # Provides libstdc++.so.6
            gcc-unwrapped
            glibc
          ];

          shellHook = ''
            export PATH=$PWD/node_modules/.bin:$PATH

            # Basic library paths
            export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib:${pkgs.glibc}/lib:$LD_LIBRARY_PATH"
            
            echo "Development environment ready with ONNX OCR support"
            echo "Python: $(which python3)"
            echo "Node.js: $(which node)"
            echo "Bun: $(which bun)"
          '';
        };
      });
}
