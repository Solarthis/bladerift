#!/usr/bin/env bash
# Deploy the Bladerift client to https://games.matsolutions.gy/bladerift/ on Hostinger (SSH alias `hostinger-mat`).
# Skyfire Squad lives at the site root and is never touched here; see docs/deploy.md.
#
# Layout on the host:
#   domains/games.matsolutions.gy/public_html/bladerift/r/<release>/...  immutable release directories
#   domains/games.matsolutions.gy/public_html/bladerift/.htaccess        router: rewrites every /bladerift/ request into the ACTIVE release
#   domains/games.matsolutions.gy/public_html/bladerift/ACTIVE_RELEASE   name of the active release (for --status and --rollback)
#   domains/games.matsolutions.gy/deploy-backups/bladerift-<time>.tgz    tarball of public_html/bladerift taken before each deploy
#   domains/games.matsolutions.gy/bladerift-deploy.lock/                 lock directory, held while a deploy runs
#
# The ROOT router (public_html/.htaccess) must pass /bladerift/ through; deploy/skyfire-router.patch adds that line.
# This script checks for it before uploading and refuses to deploy without it.
#
# Switching releases = writing the new router to a temp file and renaming it over the old one (atomic: a request sees
# the old or the new release, never a missing router). Each release is verified (file count, index.html) before the
# switch and over HTTPS after it; on failure the previous router is put back.
#
# Usage: bash deploy/deploy-hostinger.sh             test, build, deploy
#        bash deploy/deploy-hostinger.sh --rollback  switch back to the previous release
#        bash deploy/deploy-hostinger.sh --status    show the active release, the releases on disk and the live one
set -euo pipefail
HOST=hostinger-mat
SITE=domains/games.matsolutions.gy
APP=$SITE/public_html/bladerift
ROOT_HTACCESS=$SITE/public_html/.htaccess
LOCK=$SITE/bladerift-deploy.lock
URL=https://games.matsolutions.gy
SSH="ssh -o BatchMode=yes -o ConnectTimeout=20 $HOST"
cd "$(dirname "$0")/.."

router() { # $1 = release name -> router .htaccess content for public_html/bladerift/
  sed "s/__RELEASE__/$1/g" deploy/htaccess
}

# Atomic switch. Keeps the current router (and pointer) as *.prev so a failed switch can be undone, then renames the
# new router into place last: the router is the only thing requests depend on.
remote_switch() { # $1 = release to activate
  router "$1" | $SSH "set -e; cd $APP; cat > .htaccess.next; test -s .htaccess.next; \
    if [ -f .htaccess ]; then cp -p .htaccess .htaccess.prev; fi; \
    if [ -f ACTIVE_RELEASE ]; then cp -p ACTIVE_RELEASE ACTIVE_RELEASE.prev; fi; \
    echo $1 > ACTIVE_RELEASE.next; mv -f ACTIVE_RELEASE.next ACTIVE_RELEASE; mv -f .htaccess.next .htaccess"
}

# Put back what remote_switch saved. With no saved router (first deploy) the new one is parked as .htaccess.failed.
restore_router() {
  if $SSH "cd $APP; \
    if [ -f .htaccess.prev ]; then mv -f .htaccess.prev .htaccess; else mv -f .htaccess .htaccess.failed; fi; \
    if [ -f ACTIVE_RELEASE.prev ]; then mv -f ACTIVE_RELEASE.prev ACTIVE_RELEASE; else rm -f ACTIVE_RELEASE; fi"; then
    echo "Previous Bladerift router restored."
  else
    echo "!! Could not restore the previous router automatically. Check $APP on the host by hand."
  fi
}

lock()   { $SSH "mkdir $LOCK" || { echo "Could not take the Bladerift deploy lock ($LOCK): another deploy holds it, or SSH failed."; echo "If no deploy is running, remove it: ssh $HOST rmdir $LOCK"; exit 1; }; }
unlock() { $SSH "rmdir $LOCK" || true; }

live_release() { # prints the RELEASE.txt the live site serves (empty if it does not answer)
  curl -fsS --max-time 20 "$URL/bladerift/RELEASE.txt?nocache=$(date +%s)$RANDOM" 2>/dev/null || true
}

verify_live() { # $1 = release that must be live; the origin or CDN may take a few seconds to pick up the switch
  local got=""
  for _ in 1 2 3 4 5; do
    sleep 3
    got=$(live_release)
    if [[ "$got" == "$1" ]]; then return 0; fi
  done
  echo "Live check returned '$got' (expected $1)."
  echo "If the origin is correct but a CDN serves stale content, purge the Hostinger CDN cache for the domain."
  return 1
}

case "${1:-}" in
  --status)
    $SSH "cd $APP 2>/dev/null || { echo 'Bladerift is not deployed yet.'; exit 0; }; \
      echo active: \$(cat ACTIVE_RELEASE 2>/dev/null || echo none); echo releases:; ls -1 r 2>/dev/null | sort || true"
    echo "live:   $(live_release)"
    exit 0 ;;
  --rollback)
    lock; trap unlock EXIT
    CUR=$($SSH "cat $APP/ACTIVE_RELEASE" 2>/dev/null || true)
    test -n "$CUR" || { echo 'No active Bladerift release is recorded on the host; nothing to roll back from.'; exit 1; }
    # Previous = the newest release whose name sorts before the active one (names start with a timestamp).
    PREV=$($SSH "cd $APP/r && ls -1 | sort | awk -v cur='$CUR' '\$0 < cur' | tail -1" || true)
    test -n "$PREV" || { echo "No release older than $CUR to roll back to."; exit 1; }
    $SSH "test -s $APP/r/$PREV/index.html"
    remote_switch "$PREV"
    if verify_live "$PREV"; then echo "Rolled back from $CUR to $PREV"; exit 0; fi
    restore_router
    exit 1 ;;
  "") ;;
  *)
    echo "Usage: bash deploy/deploy-hostinger.sh [--status | --rollback]"
    exit 2 ;;
esac

# 1. Tests and build. The release id is baked into the client (title-screen footer) so testers can see which build they run.
npm test --silent
SHA=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain)" ]; then
  SHA="$SHA-dirty"
  echo "!! Working tree has uncommitted changes: this release is marked $SHA."
fi
REL=$(date +%Y%m%d-%H%M%S)-$SHA
VITE_RELEASE=$REL npm run build -w @bladerift/client --silent
test -f packages/client/dist/index.html
echo "$REL" > packages/client/dist/RELEASE.txt
COUNT=$(find packages/client/dist -type f | wc -l | tr -d ' ')

# 2. Layout gate on the exact build about to ship (same check as Skyfire: the app must fill the screen in every
#    viewport it is played in). A failure stops the deploy. SKIP_VIEWPORT_GATE=1 skips it for an emergency and says so.
if [[ -n "${SKIP_VIEWPORT_GATE:-}" ]]; then echo "!! Viewport gate skipped (SKIP_VIEWPORT_GATE)"; else
  PREVIEW_PORT=4180
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

# 3. Host work. From here on the lock is held and released on exit.
lock; trap unlock EXIT
# Precondition: the root router must let /bladerift/ through, or Skyfire's router would swallow every request.
$SSH "grep -qF 'RewriteRule ^bladerift' $ROOT_HTACCESS" || {
  echo "Root router ($ROOT_HTACCESS) has no bladerift pass-through line. Apply deploy/skyfire-router.patch first (docs/deploy.md). Not deploying."
  exit 1
}
# Backup of the previous Bladerift tree (skipped on the first deploy). Verified as a readable gzip archive.
$SSH "set -e; cd $SITE; mkdir -p deploy-backups; B=bladerift-\$(date +%Y%m%d-%H%M%S).tgz; \
  if [ -d public_html/bladerift ]; then tar czf deploy-backups/\$B -C public_html bladerift; tar tzf deploy-backups/\$B >/dev/null; \
    echo backup: $SITE/deploy-backups/\$B; else echo 'No existing public_html/bladerift: nothing to back up.'; fi"
$SSH "set -e; mkdir -p $APP/r; mkdir $APP/r/$REL"
# Stream a tarball over SSH (no local rsync on Windows Git Bash). Perms: dirs 755, files 644, as on the rest of the host.
tar czf - -C packages/client/dist . | $SSH "set -e; cd $APP/r/$REL && tar xzf - && find . -type d -exec chmod 755 {} + && find . -type f -exec chmod 644 {} +"
GOT=$($SSH "find $APP/r/$REL -type f | wc -l" | tr -d '[:space:]')
if [[ "$GOT" != "$COUNT" ]]; then
  echo "Upload incomplete ($GOT/$COUNT files); not switching. Partial release left at $APP/r/$REL on the host (delete it by hand)."
  exit 1
fi
$SSH "test -s $APP/r/$REL/index.html"

# 4. Switch, then verify over HTTPS. A failed check puts the previous router back.
remote_switch "$REL"
if ! verify_live "$REL"; then
  restore_router
  echo "Release $REL is on the host but not live. Previous release still serves /bladerift/."
  exit 1
fi

# 5. Housekeeping: keep the five newest releases, never the active one. Backups are not pruned.
$SSH "cd $APP/r && ls -1 | sort | head -n -5 | grep -vx '$REL' | xargs -r rm -rf" || true

# 6. Warn-only: Skyfire Squad at the site root should still answer (this deploy does not touch it).
if [[ -z "$(curl -fsS --max-time 20 "$URL/RELEASE.txt?nocache=$RANDOM$RANDOM" 2>/dev/null || true)" ]]; then
  echo "!! Skyfire Squad at $URL/ did not answer RELEASE.txt. Check the root router (public_html/.htaccess) now."
fi
echo "Deployed $REL ($COUNT files) to $URL/bladerift/. Rollback: bash deploy/deploy-hostinger.sh --rollback"
