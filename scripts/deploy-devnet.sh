#!/usr/bin/env bash
# Controlled QAL devnet deployment (experimental pre-alpha).
# Does NOT use the grant receiving wallet as authority.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

EXPECTED_PROGRAM_ID="6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR"
PROGRAM_KEYPAIR="${QAL_PROGRAM_KEYPAIR:-$HOME/.config/qal/qal-anchor-program-keypair.json}"
DEPLOY_AUTH="${QAL_DEPLOY_AUTHORITY:-$HOME/.config/qal/devnet-deploy-authority.json}"
GRANT_RECEIVE="8976JDnWQqq7uFfwJza82gZSkGj4PMGMY4JLh8b7TDGe"

echo "=== QAL devnet deploy (pre-alpha) ==="

test -f "$PROGRAM_KEYPAIR" || { echo "Missing program keypair: $PROGRAM_KEYPAIR"; exit 1; }
test -f "$DEPLOY_AUTH" || { echo "Missing deploy authority: $DEPLOY_AUTH"; exit 1; }

ACTUAL_PROGRAM_ID="$(solana-keygen pubkey "$PROGRAM_KEYPAIR")"
echo "Expected program ID: $EXPECTED_PROGRAM_ID"
echo "Actual program ID:   $ACTUAL_PROGRAM_ID"
test "$ACTUAL_PROGRAM_ID" = "$EXPECTED_PROGRAM_ID" || {
  echo "ERROR: Program keypair does not match declared QAL program ID."
  exit 1
}

DEPLOY_PUB="$(solana-keygen pubkey "$DEPLOY_AUTH")"
echo "Deploy authority:    $DEPLOY_PUB"
if [ "$DEPLOY_PUB" = "$GRANT_RECEIVE" ]; then
  echo "ERROR: Refuse to use grant receiving wallet as deploy authority."
  exit 1
fi

solana config set --url https://api.devnet.solana.com
solana config set --keypair "$DEPLOY_AUTH"
echo "Genesis: $(solana genesis-hash)"
echo "Balance: $(solana balance)"

BAL_LAMPORTS="$(solana balance --output json | python3 -c 'import sys,json; print(int(float(json.load(sys.stdin)["value"])*1e9))' 2>/dev/null || echo 0)"
# Require ~2 SOL for program deploy
if [ "${BAL_LAMPORTS:-0}" -lt 1500000000 ]; then
  echo "ERROR: Deploy authority underfunded ($BAL_LAMPORTS lamports). Fund with devnet SOL only."
  echo "  solana airdrop 2 --url devnet --keypair $DEPLOY_AUTH"
  echo "  or https://faucet.solana.com"
  exit 1
fi

mkdir -p target/deploy
cp "$PROGRAM_KEYPAIR" target/deploy/qal_anchor-keypair.json

pnpm install --frozen-lockfile
pnpm test
pnpm build
anchor build

echo "Deploying..."
DEPLOY_OUT="$(anchor deploy --provider.cluster devnet --provider.wallet "$DEPLOY_AUTH" 2>&1 | tee /tmp/qal-deploy.out)"
echo "$DEPLOY_OUT"

solana program show "$EXPECTED_PROGRAM_ID" --url devnet | tee /tmp/qal-program-show.out

echo "Running devnet vertical slice..."
export QAL_DEVNET=1
export QAL_SOURCE_COMMIT="$(git rev-parse HEAD)"
export QAL_WALLET="$DEPLOY_AUTH"
pnpm test:devnet

echo "=== Done. Review evidence/devnet/v0.1.2/ ==="
