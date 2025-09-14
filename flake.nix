{
  description = "A Nix-based development environment for the sdk-ts project";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    nix-playwright-mcp.url = "github:akirak/nix-playwright-mcp";
  };

  outputs = { self, nixpkgs, flake-utils, nix-playwright-mcp }:
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
            chromium
            nix-playwright-mcp.packages.${system}.default
            
            # Python available if needed for other tools
            pythonEnv
            
            # System libraries
            stdenv.cc.cc.lib  # Provides libstdc++.so.6
            gcc-unwrapped
            glibc
          ];

          shellHook = ''
            export PATH=$PWD/node_modules/.bin:$PATH
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=${pkgs.chromium}/bin/chromium
            export PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH=${pkgs.chromium}/bin/chromium
            
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
