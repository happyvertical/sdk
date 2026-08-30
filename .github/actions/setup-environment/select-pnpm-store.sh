#!/usr/bin/env bash
#
# Choose the pnpm store root for this job and whether the hosted Actions cache
# backs it. Writes `store-root` and `use-actions-cache` to $GITHUB_OUTPUT.
#
# The persistent branch keys on PNPM_STORE_DIR being exported, never on the
# runner's name. A provider that offers a node-local store advertises it by
# exporting that variable; one that does not, does not. Runner names are
# provider-specific and change without notice: a prior name-based branch became
# unreachable after runner-pool consolidation, silently dropping every
# self-hosted job onto a cold per-job store. The runner contract sets
# `provider_specific_targets: forbid` for the same reason.
#
# Extracted from the composite action so `scripts/select-pnpm-store.test.mjs`
# can exercise the decision table directly — the hardlink assertion in
# `node-runner-smoke.yml` cannot detect this regression, because pnpm hardlinks
# into `node_modules` on every install whether or not the store was reused.
#
# A self-hosted runner that does not export PNPM_STORE_DIR is treated as a
# fault, not a supported configuration. PNPM_STORE_DIR is not part of the
# runner target contract, so nothing obligates a provider to export it, and a
# provider that quietly stops would cost a cold store on every job while every
# check stayed green — the same silent degradation this script exists to fix.
# Failing loudly is the point. Set CI_ALLOW_EPHEMERAL_PNPM_STORE=true (from the
# runner environment, a workflow `env:` block, or the action's
# allow-ephemeral-store input) to accept the cold store and downgrade the error
# to a warning.
set -euo pipefail

# The action's allow-ephemeral-store input wins when set; otherwise
# CI_ALLOW_EPHEMERAL_PNPM_STORE inherited from the runner or a workflow `env:`
# block decides. Resolved here rather than in a workflow expression because the
# `env` context is not documented as available inside composite actions.
allow_ephemeral="${INPUT_ALLOW_EPHEMERAL_STORE:-}"
allow_source="the allow-ephemeral-store input"
if [ -z "$allow_ephemeral" ]; then
  allow_ephemeral="${CI_ALLOW_EPHEMERAL_PNPM_STORE:-false}"
  allow_source='CI_ALLOW_EPHEMERAL_PNPM_STORE'
fi

if [ "${RUNNER_ENVIRONMENT:-}" = self-hosted ] && [ -n "${PNPM_STORE_DIR:-}" ]; then
  store_root="$PNPM_STORE_DIR"
  use_actions_cache=false
  description='node-local persistent pnpm store'
elif [ "${RUNNER_ENVIRONMENT:-}" = self-hosted ]; then
  if [ "$allow_ephemeral" != true ]; then
    echo "::error::self-hosted runner ${RUNNER_NAME:-<unnamed>} did not export PNPM_STORE_DIR, so every job on it would rebuild the pnpm store from scratch. Fix it at the runner by exporting PNPM_STORE_DIR, or accept a cold per-job store by passing allow-ephemeral-store: true to this action or setting CI_ALLOW_EPHEMERAL_PNPM_STORE=true (the literal string 'true' in both cases)."
    exit 1
  fi
  echo "::warning::self-hosted runner ${RUNNER_NAME:-<unnamed>} did not export PNPM_STORE_DIR; falling back to a cold per-job store because $allow_source is set to true."
  store_root="$RUNNER_TEMP/pnpm-store-${GITHUB_RUN_ID}-${GITHUB_JOB}-${GITHUB_RUN_ATTEMPT}"
  use_actions_cache=false
  description='isolated compatibility-runner pnpm store'
else
  store_root="$HOME/.local/share/pnpm/store"
  use_actions_cache=true
  description='hosted-runner pnpm cache'
fi

{
  echo "store-root=$store_root"
  echo "use-actions-cache=$use_actions_cache"
} >>"$GITHUB_OUTPUT"

echo "Using the $description: $store_root"
