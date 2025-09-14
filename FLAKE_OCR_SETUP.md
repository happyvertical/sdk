# OCR Dependencies Setup with flake.nix

## Changes Made

I've updated the `flake.nix` file to include the OCR dependencies needed for PDF processing:

### Added Dependencies:
- **`stdenv.cc.cc.lib`** - Provides `libstdc++.so.6` (C++ Standard Library)
- **`onnxruntime`** - ONNX Runtime for OCR processing
- **`gcc-unwrapped`** - GCC compiler libraries
- **`glibc`** - GNU C Library

### Environment Configuration:
- Added `LD_LIBRARY_PATH` export to include all necessary library paths
- Added debug output to show the library path when entering the shell

## Testing the Setup

To test if the OCR dependencies now work:

### 1. Rebuild the Nix environment:
```bash
# Exit current nix shell if in one
exit

# Rebuild the flake
nix develop --rebuild
```

### 2. Verify libraries are available:
```bash
# Check if required libraries can be found
ldconfig -p | grep libstdc++
ldconfig -p | grep onnx

# Or check the environment variables
echo $LD_LIBRARY_PATH
```

### 3. Test PDF OCR functionality:
```bash
cd packages/pdf

# Test the dependency check
node -e "
const { checkOCRDependencies } = require('./dist/index.js');
checkOCRDependencies().then(result => {
  console.log('OCR Dependencies:', JSON.stringify(result, null, 2));
}).catch(err => {
  console.log('OCR Check Error:', err.message);
});"

# Test the PDF functionality
bun test --run
```

### 4. Test specific functionality:
```bash
# Test OCR capability directly
node -e "
const { getPDFReader } = require('./dist/index.js');
getPDFReader().then(async reader => {
  const caps = await reader.checkCapabilities();
  const deps = await reader.checkDependencies();
  console.log('Capabilities:', caps);
  console.log('Dependencies:', deps);
}).catch(console.error);"
```

## Expected Results

After reloading the Nix shell, you should see:

### ✅ **Success Indicators:**
- Development shell shows: "Development environment ready with OCR support for PDF processing"
- `checkOCRDependencies()` returns `{ available: true }`
- Tests run without the "libstdc++.so.6: cannot open shared object file" error
- OCR functionality works in PDF processing

### ❌ **If Still Failing:**
- Check if ONNX Runtime needs additional dependencies
- May need to add more specific library versions
- Could require different ONNX Runtime package variant

## Alternative Approach (if needed)

If the above doesn't work, we can try a more specific approach:

```nix
# In flake.nix buildInputs, replace onnxruntime with:
python3Packages.onnxruntime
# or
(onnxruntime.override { enableCuda = false; })
```

## Troubleshooting

### Library Path Issues:
```bash
# Manually set library path for testing
export LD_LIBRARY_PATH="/nix/store/*/lib:$LD_LIBRARY_PATH"
```

### Check Available Packages:
```bash
# Search for ONNX related packages
nix search nixpkgs onnx
nix search nixpkgs libstdc
```

The updated flake.nix should resolve the OCR dependency issues that were preventing PDF tests from running properly.