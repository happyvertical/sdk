#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory
cd "$SCRIPT_DIR"

# Link SDK packages
cd packages/ai && pnpm link --global
cd ../files && pnpm link --global
cd ../pdf && pnpm link --global
cd ../smrt && pnpm link --global
cd ../spider && pnpm link --global
cd ../sql && pnpm link --global
cd ../utils && pnpm link --global

# Link to praeco
cd ~/Work/happyvertical/repos/praeco
pnpm link --global @have/ai @have/files @have/smrt @have/spider @have/sql @have/utils
pnpm link --global

cd ~/Work/happyvertical/repos/svelte
pnpm link --global

# Link to bentleyalberta.com
cd ~/Work/happyvertical/repos/bentleyalberta.com
pnpm link --global @happyvertical/praeco @have/smrt @have/svelte @have/utils
