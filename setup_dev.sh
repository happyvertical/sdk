#!/usr/bin/env bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Unlink all packages globally first
bun unlink @have/ai @have/files @have/pdf @have/smrt @have/spider @have/sql @have/utils
bun unlink @happyvertical/praeco

# Link SDK packages
cd "$SCRIPT_DIR/packages/ai" && bun unlink && bun link
cd "$SCRIPT_DIR/packages/files" && bun unlink && bun link
cd "$SCRIPT_DIR/packages/pdf" && bun unlink && bun link
cd "$SCRIPT_DIR/packages/smrt" && bun unlink && bun link
cd "$SCRIPT_DIR/packages/spider" && bun unlink && bun link
cd "$SCRIPT_DIR/packages/sql" && bun unlink && bun link
cd "$SCRIPT_DIR/packages/utils" && bun unlink && bun link

# Link to praeco
cd "$SCRIPT_DIR/../praeco"
bun unlink @have/ai @have/files @have/smrt @have/spider @have/sql @have/utils
bun link @have/ai @have/files @have/smrt @have/spider @have/sql @have/utils

# Link to bentleyalberta.com
cd "$SCRIPT_DIR/../bentleyalberta.com"
bun unlink @happyvertical/praeco @have/smrt @have/utils
bun link @happyvertical/praeco @have/smrt @have/utils