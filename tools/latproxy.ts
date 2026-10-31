// TCP proxy that makes a local server behave like an internet one: a one-way delay each way, a little jitter, and now
// and then a stall during which nothing gets through and everything sent meanwhile then arrives at once (what a TCP
// resend looks like to the game). Order is kept, as TCP does. Each direction stalls on its own.
//   npx tsx tools/latproxy.ts --listen=8090 --target=8080 [--delay=160] [--jitter=15] [--stallEvery=3000] [--stallMs=250]
// then point a client (tools/netprobe.ts --server=http://localhost:8090) at the listen port.
import net from 'node:net';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const LISTEN = Number(a.listen ?? 8090);
const TARGET = Number(a.target ?? 8080);
const DELAY = Number(a.delay ?? 160);
const JITTER = Number(a.jitter ?? 15);
const STALL_EVERY = Number(a.stallEvery ?? 3000);
const STALL_MS = Number(a.stallMs ?? 250);

function pipe(from: net.Socket, to: net.Socket) {
  // one ordered queue per direction, drained by one timer (a timer per chunk can fire out of order)
  const queue: { at: number; chunk: Buffer }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const drain = () => {
    timer = null;
    const now = performance.now();
    while (queue.length && queue[0].at <= now) {
      const { chunk } = queue.shift()!;
      if (to.writable) to.write(chunk);
    }
    if (queue.length) timer = setTimeout(drain, Math.max(0, queue[0].at - now));
  };
  let last = 0;
  let stallStart = 0;
  let stallEnd = 0;
  const schedule = (now: number) => {
    // exponential gaps between stalls, each 50-150% of STALL_MS long
    stallStart = now - Math.log(1 - Math.random()) * STALL_EVERY;
    stallEnd = stallStart + STALL_MS * (0.5 + Math.random());
  };
  schedule(performance.now());
  from.on('data', (chunk) => {
    const now = performance.now();
    if (STALL_EVERY > 0 && now > stallEnd) schedule(now);
    const sentAt = STALL_EVERY > 0 && now >= stallStart && now < stallEnd ? stallEnd : now;
    const at = Math.max(last, sentAt + DELAY + Math.random() * JITTER);
    last = at;
    queue.push({ at, chunk });
    if (!timer) timer = setTimeout(drain, Math.max(0, at - now));
  });
  from.on('close', () => setTimeout(() => to.destroy(), DELAY));
  from.on('error', () => {});
}

net
  .createServer((client) => {
    client.setNoDelay(true);
    const server = net.connect(TARGET, '127.0.0.1');
    server.setNoDelay(true);
    pipe(client, server);
    pipe(server, client);
  })
  .listen(LISTEN, () => console.log(`latproxy :${LISTEN} -> :${TARGET}, ${DELAY} ms each way, jitter ${JITTER} ms, ${STALL_MS} ms stalls every ~${STALL_EVERY} ms`));
