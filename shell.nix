{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    stdenv.cc.cc.lib
    glibc
    onnxruntime
    bun
  ];
  
  shellHook = ''
    export LD_LIBRARY_PATH="${pkgs.stdenv.cc.cc.lib}/lib:${pkgs.glibc}/lib:${pkgs.onnxruntime}/lib:$LD_LIBRARY_PATH"
    echo "OCR dependencies loaded. LD_LIBRARY_PATH set."
  '';
}