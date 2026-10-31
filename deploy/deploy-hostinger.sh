#!/usr/bin/env bash
# Deploy the static PWA to games.matsolutions.gy on Hostinger (SSH alias `hostinger-mat`).
#
# Layout on the host (public_html stays a real directory; nothing outside the game's own folder is touched):
#   public_html/r/<release>/...   immutable release directories
#   public_html/.htaccess          router: rewrites every request into the ACTIVE release (one line names it)
#   domains/games.matsolutions.gy/deploy-backups/   tarballs of public_html taken before each deploy
#
# Switching releases = writing a new .htaccess to a temp file and renaming it over the old one, which is
# atomic: requests see either the old or the new release, never a missing document root. A lock directory
# prevents concurrent deploys. The release is verified (file count, index.html) before the switch and over
# HTTPS after it; on failure the previous router is restored automatically.
#
# Usage: bash deploy/deploy-hostinger.sh             build, test, deploy
#        bash deploy/deploy-hostinger.sh --rollback  switch back to the previous release
#        bash deploy/deploy-hostinger.sh --status    show active and available releases
set -euo pipefail
HOST=hostinger-mat
SITE=domains/games.matsolutions.gy
WEB=$SITE/public_html
URL=https://games.matsolutions.gy
SSH="ssh -o BatchMode=yes $HOST"
cd "$(dirname "$0")/.."

router() { # $1 = release name -> router .htaccess content
  sed "s/__RELEASE__/$1/g" deploy/htaccess
}

remote_switch() { # $1 = release to activate (atomic rename)
  router "$1" | $SSH "set -e; cd $WEB; cat > .htaccess.next; test -s .htaccess.next; \
    [ -f .htaccess ] && cp -p .htaccess .htaccess.prev || true; mv -f .htaccess.next .htaccess; echo $1 > ACTIVE_RELEASE"
}

lock()   { $SSH "mkdir $SITE/deploy.lock" || { echo 'Another deploy holds the lock ('"$SITE"'/deploy.lock).'; exit 1; }; }
unlock() { $SSH "rmdir $SITE/deploy.lock" || true; }

case "${1:-}" in
  --status)
    $SSH "cd $WEB; echo active: \$(cat ACTIVE_RELEASE 2>/dev/null || echo none); ls -1 r 2>/dev/null"
    exit 0 ;;
  --rollback)
    lock; trap unlock EXIT
    PREV=$($SSH "cd $WEB; cur=\$(cat ACTIVE_RELEASE); ls -1 r | grep -v \"^\$cur\$\" | tail -1")
    test -n "$PREV" || { echo 'No previous release.'; exit 1; }
    remote_switch "$PREV"
    echo "Rolled back to $PREV"
    exit 0 ;;
esac

# TEST_CMD may narrow the suite for an urgent hotfix (it is printed so it can't happen silently).
if [[ -n "${TEST_CMD:-}" ]]; then echo "!! Using custom test command: $TEST_CMD"; eval "$TEST_CMD"; else npm test --silent; fi
REL=$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)
# The release id is baked into the client (title-screen footer) so testers can see which build they run.
VITE_RELEASE=$REL npm run build -w @bladerift/client --silent
test -f packages/client/dist/index.html
echo "$REL" > packages/client/dist/RELEASE.txt
COUNT=$(find packages/client/dist -type f | wc -l | tr -d ' ')

# Layout gate on the exact build about to ship: the app must fill the screen (title and game, silent iOS viewport
# changes, the iPhone home-screen app) and the build line must stay off the menu. A failure stops the deploy.
# (SKIP_VIEWPORT_GATE=1 skips it for an emergency and says so.)
if [[ -n "${SKIP_VIEWPORT_GATE:-}" ]]; then echo "!! Viewport gate skipped (SKIP_VIEWPORT_GATE)"; else
  PREVIEW_PORT=4179
  (cd packages/client && npx vite preview --port $PREVIEW_PORT --strictPort >/dev/null 2>&1) &
  PREVIEW_PID=$!
  for _ in $(seq 1 40); do curl -fs "http://localhost:$PREVIEW_PORT/" >/dev/null && break; sleep 0.5; done
  GATE=0; node tools/viewportcheck.mjs --url=http://localhost:$PREVIEW_PORT/ || GATE=$?
  kill $PREVIEW_PID 2>/dev/null || true
  # (Windows: the preview runs under npx's node; stop whatever still listens on the port)
  if command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort $PREVIEW_PORT -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1 || true
  fi
  if [[ $GATE -ne 0 ]]; then echo "Viewport gate failed: not deploying."; exit 1; fi
fi

lock; trap unlock EXIT
$SSH "set -e; cd $SITE; mkdir -p deploy-backups; tar czf deploy-backups/public_html-\$(date +%Y%m%d-%H%M%S).tgz -C public_html . ; mkdir -p public_html/r/$REL"
# Stream a tarball over SSH (no local rsync on Windows Git Bash); world-readable perms per host baseline.
tar czf - -C packages/client/dist . | $SSH "set -e; cd $WEB/r/$REL && tar xzf - && find . -type d -exec chmod 755 {} + && find . -type f -exec chmod 644 {} +"
GOT=$($SSH "find $WEB/r/$REL -type f | wc -l")
test "$GOT" -eq "$COUNT" || { echo "Upload incomplete ($GOT/$COUNT files); not switching."; exit 1; }
$SSH "test -s $WEB/r/$REL/index.html"

remote_switch "$REL"
sleep 2
LIVE=$(curl -fsS "$URL/RELEASE.txt?v=$RANDOM" || true)
if [[ "$LIVE" != "$REL" ]]; then
  echo "Live check returned '$LIVE' (expected $REL). Restoring previous router."
  $SSH "cd $WEB; [ -f .htaccess.prev ] && mv -f .htaccess.prev .htaccess || true"
  echo "If the origin is correct but a CDN serves stale content, purge the Hostinger CDN cache for the domain."
  exit 1
fi
# Keep the five newest releases.
$SSH "cd $WEB/r && ls -1 | sort | head -n -5 | xargs -r rm -rf"
echo "Deployed $REL ($COUNT files). Rollback: bash deploy/deploy-hostinger.sh --rollback"
