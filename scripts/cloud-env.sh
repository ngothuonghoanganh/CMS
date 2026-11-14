#!/usr/bin/env bash
# Prepares a Claude Code cloud session (claude.ai/code) for this repository: Node 24, pnpm,
# dependencies, Playwright browsers and the docker compose infrastructure. README "Cloud
# sessions" has the environment settings that go with it.
#
#   image    The environment's setup script runs this as root before each session. Its files
#            (Node, browsers, pulled images, node_modules) are cached between sessions.
#   session  The SessionStart hook (.claude/settings.json) runs this at each start and resume of
#            a cloud session, and does nothing elsewhere. It exports PATH for later commands,
#            installs changed dependencies and starts the infrastructure, which no cache keeps
#            running. Its stdout becomes Claude's context, so step output goes to a log file.
#
# Every step is idempotent. A failed step is reported and the next ones still run: a setup script
# that exits non-zero keeps the session from starting at all, which is harder to repair.
set -uo pipefail

mode="${1:-}"
case "$mode" in
  image) ;;
  session) [ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0 ;;
  *)
    echo "usage: scripts/cloud-env.sh image|session" >&2
    exit 2
    ;;
esac
if [ "$(uname -s)" != Linux ]; then
  echo "scripts/cloud-env.sh prepares Claude Code cloud sessions (Linux); see README." >&2
  exit 0
fi

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The setup script runs as root and installs under /opt; a session user who cannot write there
# still finds those files, or installs its own copy in its home.
if [ -w /opt ] || [ -x /opt/node24/bin/node ]; then
  tools=/opt
else
  tools="$HOME/.cache/plp"
fi
node_dir="$tools/node24"
export PATH="$node_dir/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="$tools/ms-playwright"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

log=/tmp/plp-cloud-env.log
failed=()

# Runs one step. In session mode its output goes to the log, so only the summary reaches Claude.
step() {
  local name="$1"
  shift
  if [ "$mode" = session ]; then
    echo "── $name" >>"$log"
    "$@" >>"$log" 2>&1
  else
    echo "── $name"
    "$@"
  fi || {
    echo "✗ $name failed" >&2
    failed+=("$name")
  }
}

install_node() {
  if "$node_dir/bin/node" --version 2>/dev/null | grep -q '^v24\.'; then
    return 0
  fi
  local arch version tmp file
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64) arch=arm64 ;;
    *) echo "unsupported CPU $(uname -m)" && return 1 ;;
  esac
  # index.json lists releases newest first.
  version="$(curl -fsSL https://nodejs.org/dist/index.json | grep -o '"version":"v24\.[0-9.]*"' |
    head -n 1 | cut -d '"' -f 4)"
  [ -n "$version" ] || return 1
  file="node-$version-linux-$arch.tar.xz"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/$file" "https://nodejs.org/dist/$version/$file" &&
    curl -fsSL -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/$version/SHASUMS256.txt" &&
    (cd "$tmp" && grep " $file\$" SHASUMS256.txt | sha256sum -c -) &&
    tar -xJf "$tmp/$file" -C "$tmp" &&
    mkdir -p "$tools" &&
    rm -rf "$node_dir" &&
    mv "$tmp/node-$version-linux-$arch" "$node_dir"
  local status=$?
  rm -rf "$tmp"
  return $status
}

# corepack fetches the pnpm version pinned in package.json's packageManager.
install_pnpm() {
  corepack enable pnpm && (cd "$repo" && pnpm --version)
}

install_dependencies() {
  local stamp="$repo/node_modules/.cloud-lockfile-sha256" sum
  sum="$(sha256sum "$repo/pnpm-lock.yaml" | cut -d ' ' -f 1)"
  if [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$sum" ]; then
    return 0
  fi
  (cd "$repo" && pnpm install --frozen-lockfile --config.confirmModulesPurge=false) &&
    echo "$sum" >"$stamp"
}

copy_env_file() {
  [ -f "$repo/.env" ] || cp "$repo/.env.example" "$repo/.env"
}

# The browsers come from Playwright's CDN, which the environment must allow (README). Their
# system libraries need apt, so only the root setup script installs those.
install_browsers() {
  local with_deps=()
  if [ "$mode" = image ] && [ "$(id -u)" = 0 ]; then
    with_deps=(--with-deps)
  fi
  (cd "$repo" && pnpm --filter @plp/e2e exec playwright install "${with_deps[@]}" chromium firefox webkit)
}

start_docker() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  if ! service docker start; then
    nohup dockerd >/tmp/dockerd.log 2>&1 &
  fi
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "the Docker daemon did not start; see /tmp/dockerd.log"
  return 1
}

pull_images() {
  (cd "$repo" && docker compose pull --quiet)
}

start_infrastructure() {
  (cd "$repo" && docker compose up -d --wait)
}

# Later Bash commands of the session read this file; without it they would get the image's Node 22.
export_session_env() {
  if [ -z "${CLAUDE_ENV_FILE:-}" ]; then
    echo "CLAUDE_ENV_FILE is not set"
    return 1
  fi
  {
    echo "export PATH=\"$node_dir/bin:\$PATH\""
    echo "export PLAYWRIGHT_BROWSERS_PATH=\"$PLAYWRIGHT_BROWSERS_PATH\""
    echo "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
  } >>"$CLAUDE_ENV_FILE"
}

: >"$log"
step "Node 24" install_node
step "pnpm" install_pnpm
step ".env" copy_env_file
step "dependencies" install_dependencies
step "Playwright browsers" install_browsers
step "Docker daemon" start_docker
if [ "$mode" = image ]; then
  step "container images" pull_images
else
  step "session PATH" export_session_env
  step "MongoDB, storage and Mailpit (pnpm infra:up)" start_infrastructure
fi

if [ "$mode" = session ]; then
  echo "Cloud session: Node $(node --version 2>/dev/null || echo missing), pnpm $(cd "$repo" && pnpm --version 2>/dev/null || echo missing)."
  if [ ${#failed[@]} -eq 0 ]; then
    echo "Dependencies installed and pnpm infra:up running (MongoDB :27117, storage :9100, Mailpit :8125)."
  else
    echo "Failed steps: ${failed[*]}. Read $log, fix the cause, then rerun: bash scripts/cloud-env.sh session"
  fi
  if [ -z "${CLAUDE_ENV_FILE:-}" ]; then
    echo "Prefix commands with: export PATH=$node_dir/bin:\$PATH PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH"
  fi
elif [ ${#failed[@]} -gt 0 ]; then
  echo "Failed steps: ${failed[*]}. The session hook retries them." >&2
fi
exit 0
