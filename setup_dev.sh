#!/usr/bin/env bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Unlink all packages globally first
pnpm unlink --global @have/ai @have/files @have/pdf @have/smrt @have/spider @have/sql @have/utils
pnpm unlink --global @happyvertical/praeco @have/svelte

# Link SDK packages
cd "$SCRIPT_DIR/packages/ai" && pnpm unlink && pnpm link --global
cd "$SCRIPT_DIR/packages/files" && pnpm unlink && pnpm link --global
cd "$SCRIPT_DIR/packages/pdf" && pnpm unlink && pnpm link --global
cd "$SCRIPT_DIR/packages/smrt" && pnpm unlink && pnpm link --global
cd "$SCRIPT_DIR/packages/spider" && pnpm unlink && pnpm link --global
cd "$SCRIPT_DIR/packages/sql" && pnpm unlink && pnpm link --global
cd "$SCRIPT_DIR/packages/utils" && pnpm unlink && pnpm link --global

# Link to praeco
cd "$SCRIPT_DIR/../praeco"
pnpm unlink @have/ai @have/files @have/smrt @have/spider @have/sql @have/utils
pnpm link --global @have/ai @have/files @have/smrt @have/spider @have/sql @have/utils
pnpm link --global

cd "$SCRIPT_DIR/../svelte"
pnpm unlink
pnpm link --global

# Link to bentleyalberta.com
cd "$SCRIPT_DIR/../bentleyalberta.com"
pnpm unlink @happyvertical/praeco @have/smrt @have/svelte @have/utils
pnpm link --global @happyvertical/praeco @have/smrt @have/svelte @have/utils