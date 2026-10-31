# Deploying Bladerift

Bladerift is the static client (`packages/client`) served at **https://games.matsolutions.gy/bladerift/** on the same
Hostinger account as Skyfire Squad (SSH alias `hostinger-mat`). Skyfire Squad owns the site root and must keep working;
Bladerift only ever writes inside its own folder.

Run everything from the repository root.

## Where things live

| What | Where (on the host, relative to the SSH home directory) |
|---|---|
| Live Bladerift | `domains/games.matsolutions.gy/public_html/bladerift/` |
| Immutable releases | `.../public_html/bladerift/r/<release>/` (`<release>` = `YYYYmmdd-HHMMSS-<git sha>[-dirty]`) |
| Router (active release) | `.../public_html/bladerift/.htaccess` (generated from `deploy/htaccess`) |
| Active release name | `.../public_html/bladerift/ACTIVE_RELEASE` |
| Backups | `domains/games.matsolutions.gy/deploy-backups/bladerift-<time>.tgz` (one per deploy) |
| Lock | `domains/games.matsolutions.gy/bladerift-deploy.lock/` (held during a deploy, removed on exit) |
| Root router (Skyfire) | `domains/games.matsolutions.gy/public_html/.htaccess` (must contain the Bladerift pass-through line) |

Files in this repo:

- `deploy/deploy-hostinger.sh`: test, build, upload, switch, verify. Also `--status` and `--rollback`.
- `deploy/htaccess`: router template for `public_html/bladerift/.htaccess`. `__RELEASE__` is replaced at deploy time.
- `deploy/skyfire-router.patch`: the one-line change to Skyfire's root router template (see below).

## Prerequisites

- `ssh hostinger-mat` works without a password prompt (the script uses `BatchMode`).
- Git Bash with `tar`, `curl`, `ssh`; Node and npm; `npm install` has been run.
- The layout gate (`tools/viewportcheck.mjs`) needs Playwright's Chromium. If it is missing: `npx playwright install chromium`.
- Commit before deploying. The script deploys the working tree as it is. An uncommitted tree still deploys, but the
  release id ends in `-dirty` and the script prints a warning.

## One-time setup: the root router must let /bladerift/ through

Skyfire's root router (`public_html/.htaccess`) rewrites every request into Skyfire's release. Without a change it would
answer `/bladerift/...` with Skyfire's app. `deploy/skyfire-router.patch` adds one rule right after the `^r/` pass-through:

```
  # Bladerift lives in /bladerift/ with its own router: never route its requests into Skyfire's release.
  RewriteRule ^bladerift(/|$) - [L]
```

Apply it to the **live** root router once, before the first Bladerift deploy. The change is additive and does not
affect Skyfire's files. Until a Bladerift release exists, `/bladerift/` answers 404.

1. Check the live file. It must contain the `^r/` rule once and no bladerift line yet.

   ```bash
   ssh hostinger-mat 'cat domains/games.matsolutions.gy/public_html/.htaccess' > /c/Users/vascu/AppData/Local/Temp/root-live.htaccess
   grep -c 'RewriteRule ^r/ - \[L\]' /c/Users/vascu/AppData/Local/Temp/root-live.htaccess   # expect 1
   grep -c 'bladerift' /c/Users/vascu/AppData/Local/Temp/root-live.htaccess                 # expect 0
   ```

2. Back up the live file on the host (in the backups folder, never in place).

   ```bash
   ssh hostinger-mat 'cd domains/games.matsolutions.gy && cp -p public_html/.htaccess deploy-backups/root-htaccess-'"$(date +%Y%m%d-%H%M%S)"'.bak && ls -l deploy-backups/root-htaccess-*.bak'
   ```

3. Make the change on a local temp copy and check it. Only the two new lines should differ.

   ```bash
   awk '{ print } /RewriteRule \^r\/ - \[L\]/ { print "  # Bladerift has its own router under /bladerift/: never route its requests into Skyfire."; print "  RewriteRule ^bladerift(/|$) - [L]" }' \
     /c/Users/vascu/AppData/Local/Temp/root-live.htaccess > /c/Users/vascu/AppData/Local/Temp/root-new.htaccess
   diff /c/Users/vascu/AppData/Local/Temp/root-live.htaccess /c/Users/vascu/AppData/Local/Temp/root-new.htaccess   # only "> " lines
   grep -c 'RewriteRule ^bladerift' /c/Users/vascu/AppData/Local/Temp/root-new.htaccess   # expect 1
   ```

   The result should match `deploy/skyfire-router.patch` apart from the line endings. Check by hand if in doubt.

4. Upload it next to the live file, then rename it into place. The rename is atomic.

   ```bash
   cat /c/Users/vascu/AppData/Local/Temp/root-new.htaccess | ssh hostinger-mat 'cd domains/games.matsolutions.gy/public_html && cat > .htaccess.next && test -s .htaccess.next && mv -f .htaccess.next .htaccess'
   ```

5. Check that Skyfire still answers as before.

   ```bash
   curl -fsS https://games.matsolutions.gy/RELEASE.txt?check=$RANDOM
   curl -sI https://games.matsolutions.gy/ | head -1      # expect 200
   ```

To undo the root change, put the backup from step 2 back the same way:

```bash
ssh hostinger-mat 'cd domains/games.matsolutions.gy && cp -p deploy-backups/root-htaccess-<time>.bak public_html/.htaccess.next && mv -f public_html/.htaccess.next public_html/.htaccess'
```

The patch must also go into Skyfire's own source, `skyfire-squad/deploy/htaccess`. Otherwise the next Skyfire deploy
regenerates the root router without the line and Bladerift stops working. The deploy script checks for the line before
it uploads (see Deploying step 3), so Bladerift will refuse to deploy rather than break; a Skyfire deploy by itself
will not check for it. Apply it there with `git apply deploy/skyfire-router.patch` from the Skyfire repo root (the
patch is written against the LF version in git, which is what `git apply` sees).

## Deploying

```bash
bash deploy/deploy-hostinger.sh
```

What the script does, in order. It stops at the first failure and removes its lock on exit.

1. `npm test --silent` (vitest).
2. Build: `VITE_RELEASE=<release> npm run build -w @bladerift/client`. The release id is printed into the title-screen footer.
   The Vite base is `./`, so the same build works under `/bladerift/`. The script then writes
   `packages/client/dist/RELEASE.txt` with the release id and counts the files.
3. Layout gate: serves `dist` with `vite preview` on port 4180 and runs `tools/viewportcheck.mjs`. A failure stops the deploy.
   `SKIP_VIEWPORT_GATE=1` skips it; use that only for an emergency.
4. Takes the lock `bladerift-deploy.lock`.
5. Precondition: the root router has the Bladerift pass-through line. If not, the script stops and tells you to apply the patch.
6. Backup: tars `public_html/bladerift` to `deploy-backups/bladerift-<time>.tgz` and checks it reads back. Skipped on the first deploy.
7. Creates `public_html/bladerift/r/<release>/` (refuses to reuse an existing name).
8. Streams `dist` over SSH as a tarball, then sets dirs to 755 and files to 644.
9. Verifies the remote file count equals the local one and that `index.html` is non-empty. A mismatch stops the deploy;
   the partial release stays on the host, unreferenced, and should be deleted by hand.
10. Switch: writes the new router to `.htaccess.next` and renames it over `.htaccess`. The current router is kept as
    `.htaccess.prev` first, together with `ACTIVE_RELEASE.prev`.
11. Verifies `https://games.matsolutions.gy/bladerift/RELEASE.txt?nocache=...` shows the new release (5 tries, 3 s apart).
    On failure it restores the previous router and pointer and exits 1.
12. Keeps the five newest releases (never the active one). Backups are not pruned.
13. Warn-only: checks that Skyfire's `RELEASE.txt` still answers.

Expected last line: `Deployed <release> (<N> files) to https://games.matsolutions.gy/bladerift/. Rollback: bash deploy/deploy-hostinger.sh --rollback`

## Checking a deploy

```bash
bash deploy/deploy-hostinger.sh --status          # active release, releases on disk, live RELEASE.txt
curl -fsS https://games.matsolutions.gy/bladerift/RELEASE.txt
```

Then, in a browser:

- Open `https://games.matsolutions.gy/bladerift/` (with a trailing slash). The title screen footer should show the release id.
- Open a deep link such as `/bladerift/anything`. It should fall back to the app shell.
- Open `https://games.matsolutions.gy/bladerift` (no slash). It should redirect to the slash form.
- Open Skyfire at `https://games.matsolutions.gy/`. It should still be Skyfire.

Headers, from the command line:

```bash
curl -sI https://games.matsolutions.gy/bladerift/                 # 200, Cache-Control: no-cache, no-transform
curl -sI https://games.matsolutions.gy/bladerift/manifest.webmanifest   # Content-Type: application/manifest+json
curl -sI https://games.matsolutions.gy/bladerift/assets/<hashed>.js     # Cache-Control: public, max-age=31536000, immutable
curl -sI http://games.matsolutions.gy/bladerift/                  # 301 to https
```

The layout gate is an automated desktop check. Before calling a release done, also look at the game on a phone,
including the home-screen app and a silent viewport change.

## Rollback

Switch the router back to the previous release (the newest release older than the active one):

```bash
bash deploy/deploy-hostinger.sh --rollback
```

To roll back to a specific release, switch the router by hand with the same atomic rename the script uses. Run this
only after checking the release name exists under `public_html/bladerift/r/`:

```bash
ssh hostinger-mat 'cd domains/games.matsolutions.gy/public_html/bladerift && ls -1 r'
# then, with <REL> set to the chosen release:
sed "s/__RELEASE__/<REL>/g" deploy/htaccess | ssh hostinger-mat 'cd domains/games.matsolutions.gy/public_html/bladerift && cat > .htaccess.next && test -s .htaccess.next && echo <REL> > ACTIVE_RELEASE && mv -f .htaccess.next .htaccess'
```

To recover from a damaged tree, unpack the backup into a new empty folder, check it, and only then swap it in. Do not
extract over the live folder:

```bash
ssh hostinger-mat 'cd domains/games.matsolutions.gy && mkdir restore-check && tar xzf deploy-backups/bladerift-<time>.tgz -C restore-check && ls restore-check/bladerift/r'
```

## Stale lock

The lock is a directory and is removed by an exit trap. A deploy killed hard (for example, a closed terminal in the
middle of a Ctrl-C) can leave it behind. The script then says so and stops. If you are sure no deploy is running:

```bash
ssh hostinger-mat 'rmdir domains/games.matsolutions.gy/bladerift-deploy.lock'
```

## Known risks and open items

1. **Skyfire's service worker is scoped to `/`.** Skyfire registers its service worker at the site root, so its scope
   includes `/bladerift/`. A browser that already has Skyfire installed may send the first `/bladerift/` navigation
   through Skyfire's service worker, which can serve Skyfire's app shell. Bladerift's own service worker (scope
   `/bladerift/`) takes over after its first successful registration, but that registration never happens if the page
   is Skyfire's. Recommended fix in the Skyfire repo: add `/^\/bladerift/` to `navigateFallbackDenylist` in
   `packages/client/vite.config.ts` and ship a Skyfire release. Test this with a browser profile that has Skyfire installed,
   before the first Bladerift deploy.
2. **Skyfire's deploy template needs the same patch** (see One-time setup). Until it has it, the next Skyfire deploy
   removes the pass-through line.
3. **Online play is not on this host.** The client reads its online server from `VITE_ONLINE_URL` at build time, and it
   is empty by default, so a plain deploy has no online server. To ship with online play, set it for the deploy:
   `VITE_ONLINE_URL=https://<server> bash deploy/deploy-hostinger.sh`. The server (`packages/server`) runs elsewhere and is not deployed by this script.
4. **Not tested against a real Apache yet.** The router logic follows Skyfire's proven router and was checked by reading.
   After the first deploy, run the checks above, including the deep-link and redirect checks, before relying on it.
5. **CDN caching.** Hostinger's CDN may keep serving an old `RELEASE.txt`, and the cache-busting query may not get past
   it. If the live check fails while the origin is correct, purge the CDN cache for the domain and run `--status`.
6. **Backups grow.** Skyfire's backup tarball (`public_html`) now includes the `bladerift` folder, and Bladerift's backups
   are not pruned. Delete old backups by hand when disk space matters.
7. **Dirty trees.** Commit first. A `-dirty` release is marked as such, but it still goes live.
