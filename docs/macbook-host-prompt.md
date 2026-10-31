# Prompt: host a Skyfire Squad LAN match from a MacBook

Copy `skyfire-squad.bundle` to the MacBook first (AirDrop, USB stick or a cloud drive, into `~/Downloads`). Then open
Claude Code on the Mac and paste everything below the line.

---

Set up this MacBook to host LAN matches of Skyfire Squad, my jetpack shooter. Phones and laptops on the same Wi-Fi
join it in the browser. Work through it yourself and only stop to ask me where noted.

**What the game is.** A Node.js project: npm workspaces `packages/shared` (simulation), `packages/server` (the LAN
host: serves the built web client and a WebSocket on one port, default 7350) and `packages/client` (Phaser web
client). It normally runs on a Windows PC via `start-host.cmd`. The repo has a macOS launcher, `start-host.command`,
that does the same: install, build when sources changed, start the server, open the host console. The README's
"Hosting a LAN match" section and `docs/ARCHITECTURE.md` (section on LAN and HTTPS) explain the setup. Players use
plain `http://<mac-ip>:7350`; that is intended (no certificates).

**The code.** I copied the repo as a git bundle to `~/Downloads/skyfire-squad.bundle` (if it is not there, ask me
where it is). There is no remote.

Steps:

1. **Check the machine.** macOS version, chip (`uname -m`), whether `git` and `node` exist and `node -v`. The build
   needs Node 20.19+ or 22.12+ (22 LTS is best). If Node is missing or too old, or git needs the Xcode command line
   tools, tell me what you want to install and how (Homebrew `brew install node@22`, or the nodejs.org installer) and
   wait for my OK before installing anything.
2. **Get the code:** `git clone -b main ~/Downloads/skyfire-squad.bundle ~/Projects/skyfire-squad` (make
   `~/Projects` if needed). If that folder already exists, update it instead:
   `git -C ~/Projects/skyfire-squad pull ~/Downloads/skyfire-squad.bundle main`.
3. **Install and build:** in the repo, `npm ci`, then `npm run build`, then `node tools/build-stamp.mjs write`. If
   `npm ci` fails over missing macOS binaries (esbuild, rolldown, resvg), run `npm install` instead. Run `npm test`
   once as a sanity check and tell me if anything fails. Do not change game code.
4. **Start the host** in the background so it keeps running:
   `cd ~/Projects/skyfire-squad && caffeinate -dims node packages/server/dist/server.mjs --static=packages/client/dist --open`
   (this is what `start-host.command` runs). From its output, give me the **host console** URL
   (`http://localhost:7350/?host=...` - it should open in my browser; that is where I pick mode, map and bots and
   press Start) and the **Players join** URL (`http://<LAN-IP>:7350`).
5. **Check it is reachable:** `curl -s http://localhost:7350/api/info` and `curl -s http://<LAN-IP>:7350/api/info`
   should both return JSON with the arena name. Check the macOS firewall with
   `/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate` and `--getblockall`. If it could block incoming
   connections to node, tell me exactly what to click (System Settings > Network > Firewall > Options: allow `node`
   incoming connections, or click **Allow** on the "accept incoming network connections" prompt). Do not change
   firewall or other security settings yourself, and do not use sudo without asking.
6. **Tell me the rules of thumb:**
   - The Mac and the players' phones must be on the same Wi-Fi. Guest networks with client isolation block it.
   - Keep the Mac plugged in, and don't close the lid unless it is in clamshell mode with an external display:
     `caffeinate` stops idle sleep, not lid sleep.
   - The LAN address can change between sessions; players always use the address and QR code shown at the time.
   - Players can also open https://games.matsolutions.gy, tap **Join a LAN match** and enter the address.
   - Stop the host with Ctrl+C in its terminal. Start it next time by double-clicking `start-host.command` in Finder.
     If macOS blocks it as "from an unidentified developer", right-click > Open once.
     If it lost its executable bit, run `chmod +x ~/Projects/skyfire-squad/start-host.command`.
   - Updating: copy a new bundle to `~/Downloads`, `git -C ~/Projects/skyfire-squad pull ~/Downloads/skyfire-squad.bundle main`,
     then start as usual. The launcher rebuilds by itself when the sources changed.
7. **If something goes wrong:**
   - Port 7350 busy: `lsof -i :7350`; run on another port with `--port=7351`.
   - Phones can't load the page: same Wi-Fi? Firewall prompt dismissed? Does the IP printed match `ipconfig getifaddr en0`?
   - Fix what you can within these rules and tell me what you changed.

Done means: the host runs on this Mac, the host console is open in my browser, and you have given me the join URL
(the terminal also shows a QR code) plus how to start and stop it next time.
