<?php
// Direct-play handshake (src/net/p2p.ts): a guest leaves a WebRTC offer under a match code, the host picks it up and
// leaves its answer, the guest picks that up. Nothing else passes through here (the match itself runs between the two
// devices). Offers and answers live 60 s in the host's temp directory; every field is checked.
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
if (!is_string($code) || !preg_match('/^[A-Z0-9]{4}$/', $code)) out(['error' => 'bad code'], 400);
if ($gid !== '' && (!is_string($gid) || !preg_match('/^[a-z0-9]{6,20}$/', $gid))) out(['error' => 'bad id'], 400);
if ($sdp !== '' && (!is_string($sdp) || strlen($sdp) > 20000 || strpos($sdp, 'v=0') !== 0)) out(['error' => 'bad sdp'], 400);

$dir = sys_get_temp_dir() . '/bladerift-p2p';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
if (!is_dir($dir) || !is_writable($dir)) out(['error' => 'no storage'], 500);

// sweep anything older than a minute (a handful of files at most)
foreach (glob($dir . '/*') ?: [] as $f) if (@filemtime($f) < time() - 60) @unlink($f);

$offerFile = $dir . '/' . $code . '.offer';
switch ($op) {
  case 'offer':
    if ($gid === '' || $sdp === '') out(['error' => 'missing'], 400);
    // one waiting guest per code (a newer offer replaces an older one)
    file_put_contents($offerFile, json_encode(['gid' => $gid, 'sdp' => $sdp]), LOCK_EX);
    out(['ok' => true]);
  case 'poll-offer':
    if (!is_file($offerFile)) out(['ok' => true]);
    $o = json_decode((string)@file_get_contents($offerFile), true);
    @unlink($offerFile);
    out(is_array($o) ? ['gid' => $o['gid'], 'sdp' => $o['sdp']] : ['ok' => true]);
  case 'answer':
    if ($gid === '' || $sdp === '') out(['error' => 'missing'], 400);
    file_put_contents($dir . '/' . $code . '.' . $gid . '.answer', $sdp, LOCK_EX);
    out(['ok' => true]);
  case 'poll-answer':
    if ($gid === '') out(['error' => 'missing'], 400);
    $f = $dir . '/' . $code . '.' . $gid . '.answer';
    if (!is_file($f)) out(['ok' => true]);
    $a = (string)@file_get_contents($f);
    @unlink($f);
    out(['sdp' => $a]);
}
out(['error' => 'unknown op'], 400);
