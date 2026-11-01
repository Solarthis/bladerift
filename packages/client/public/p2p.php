<?php
// Direct-play handshake (src/net/p2p.ts): a guest leaves a WebRTC offer under a match code, the host picks it up and
// leaves its answer, the guest picks that up. Nothing else passes through here (the match itself runs between the two
// devices). The host owns its code with a random key (the first to poll claims it; it stays claimed while the host
// keeps polling), so nobody else can take a guest's offer or answer it. Files live 60 s in the host's temp directory,
// every field is checked and the store is capped.
header('Content-Type: application/json');
header('Cache-Control: no-store, no-transform');
header('X-Content-Type-Options: nosniff');

function out($v, $status = 200) {
  http_response_code($status);
  echo json_encode($v);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['error' => 'POST only'], 405);
$raw = file_get_contents('php://input', false, null, 0, 24000);
$in = json_decode($raw ?: '', true);
if (!is_array($in)) out(['error' => 'bad request'], 400);
$op = isset($in['op']) ? $in['op'] : '';
$code = isset($in['code']) ? $in['code'] : '';
$gid = isset($in['gid']) ? $in['gid'] : '';
$sdp = isset($in['sdp']) ? $in['sdp'] : '';
$key = isset($in['key']) ? $in['key'] : '';
if (!is_string($code) || !preg_match('/^[A-Z0-9]{4}$/', $code)) out(['error' => 'bad code'], 400);
if ($gid !== '' && (!is_string($gid) || !preg_match('/^[a-z0-9]{6,20}$/', $gid))) out(['error' => 'bad id'], 400);
if ($key !== '' && (!is_string($key) || !preg_match('/^[a-z0-9]{16,40}$/', $key))) out(['error' => 'bad key'], 400);
if ($sdp !== '' && (!is_string($sdp) || strlen($sdp) > 20000 || strpos($sdp, 'v=0') !== 0)) out(['error' => 'bad sdp'], 400);

$dir = sys_get_temp_dir() . '/bladerift-p2p';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
if (!is_dir($dir) || !is_writable($dir)) out(['error' => 'no storage'], 500);

// sweep anything older than a minute; refuse new files while the store is unusually full
$files = glob($dir . '/*') ?: [];
foreach ($files as $f) if (@filemtime($f) < time() - 60) @unlink($f);
$full = count($files) > 600;

$base = $dir . '/' . $code;
$keyFile = $base . '.key';

/** The key that owns this code (fresh: the host polled within 12 s), or ''. */
function owner($keyFile) {
  if (!is_file($keyFile) || @filemtime($keyFile) < time() - 12) return '';
  return trim((string)@file_get_contents($keyFile));
}

switch ($op) {
  case 'probe':
    // is a host listening on this code right now?
    out(['host' => owner($keyFile) !== '']);
  case 'offer':
    if ($gid === '' || $sdp === '') out(['error' => 'missing'], 400);
    if (owner($keyFile) === '') out(['error' => 'no host'], 404);
    if ($full) out(['error' => 'busy'], 503);
    // one waiting guest per code (a newer offer replaces an older one)
    file_put_contents($base . '.offer', json_encode(['gid' => $gid, 'sdp' => $sdp]), LOCK_EX);
    out(['ok' => true]);
  case 'poll-offer':
    if ($key === '') out(['error' => 'missing'], 400);
    $own = owner($keyFile);
    if ($own !== '' && !hash_equals($own, $key)) out(['error' => 'taken'], 403);
    if ($own === '' && $full) out(['error' => 'busy'], 503);
    // claim the code, or keep it claimed (the file's age is the host's heartbeat)
    file_put_contents($keyFile, $key, LOCK_EX);
    if (!is_file($base . '.offer')) out(['ok' => true]);
    $o = json_decode((string)@file_get_contents($base . '.offer'), true);
    @unlink($base . '.offer');
    if (!is_array($o) || !isset($o['gid'], $o['sdp'])) out(['ok' => true]);
    touch($base . '.' . $o['gid'] . '.taken');
    out(['gid' => $o['gid'], 'sdp' => $o['sdp']]);
  case 'answer':
    if ($gid === '' || $sdp === '' || $key === '') out(['error' => 'missing'], 400);
    $own = owner($keyFile);
    if ($own === '' || !hash_equals($own, $key)) out(['error' => 'not the host'], 403);
    // only an offer this host actually took can be answered
    if (!is_file($base . '.' . $gid . '.taken')) out(['error' => 'no offer'], 404);
    @unlink($base . '.' . $gid . '.taken');
    file_put_contents($base . '.' . $gid . '.answer', $sdp, LOCK_EX);
    out(['ok' => true]);
  case 'poll-answer':
    if ($gid === '') out(['error' => 'missing'], 400);
    $f = $base . '.' . $gid . '.answer';
    if (!is_file($f)) out(['ok' => true]);
    $a = (string)@file_get_contents($f);
    @unlink($f);
    out(['sdp' => $a]);
}
out(['error' => 'unknown op'], 400);
