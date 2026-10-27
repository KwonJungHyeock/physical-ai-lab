/**
 * 로봇 USB 만들기 (engine/simulator/usbKit.ts): the robots' result files as the screen reads them
 * (written by robot-python/server/usb_setup.py apply) and the Wi-Fi form's check (the same as
 * desktop-go/usbkit.go checkWifi). Run with: npm run check:usb
 */
import assert from 'node:assert/strict';

const { parseResult, checkWifi, kitDate, formatBytes, WIFI_OFF, DIRECT_IP } = await import('../../src/engine/simulator/usbKit');

/* --- 1. A robot that joined and updated ----------------------------------- */
{
  const text = [
    '﻿2026-10-14 09:12',
    '로봇: ubuntu-3a7f   사용자: 3조 김민수',
    "결과: 성공 — 'EDUINO-LAB' 에 연결했어요.",
    '버전: 20261002-101500-aaaaaaa → 20261014-051829-c782f72',
    '업데이트: 성공',
    '로봇 ID: 107   주소: 192.168.0.107, 10.0.0.5',
    'PC 브라우저: http://192.168.0.107:8080/console',
    '확인값: 3f9c0a1b22e4',
  ].join('\r\n');
  const r = parseResult('result-ubuntu-3a7f.txt', text, 5);
  assert.equal(r.when, '2026-10-14 09:12');
  assert.equal(r.robot, 'ubuntu-3a7f');
  assert.equal(r.user, '3조 김민수');
  assert.equal(r.wifi, 'ok');
  assert.equal(r.message, "'EDUINO-LAB' 에 연결했어요.");
  assert.equal(r.update, '성공');
  assert.equal(r.robotId, '107');
  assert.deepEqual(r.ips, ['192.168.0.107', '10.0.0.5']);
  assert.equal(r.time, 5);
}

/* --- 2. A robot that failed (no address, no user) -------------------------- */
{
  const r = parseResult(
    'result-ubuntu-9c01.txt',
    '2026-10-14 09:20\r\n로봇: ubuntu-9c01\r\n결과: 실패 — 비밀번호가 맞지 않아요.\r\n버전: 20261014-051829-c782f72\r\n로봇 ID: -   주소: -\r\n',
  );
  assert.equal(r.wifi, 'fail');
  assert.equal(r.user, '');
  assert.equal(r.robotId, '');
  assert.deepEqual(r.ips, []);
  assert.equal(r.message, '비밀번호가 맞지 않아요.');
  assert.equal(r.update, '');
}

/* --- 3. Wi-Fi left as it was; a file without its first lines ----------------- */
{
  assert.equal(parseResult('result-x.txt', '결과: 그대로 — 이 wifi.txt 는 전에 적용했어요 (Wi-Fi 그대로).').wifi, 'same');
  const r = parseResult('result-ubuntu-0001.txt', 'garbage');
  assert.equal(r.robot, 'ubuntu-0001');
  assert.equal(r.when, '');
}

/* --- 4. The form ------------------------------------------------------------- */
{
  const ok = (ssid: string, password = '', label = '') => checkWifi({ ssid, password, label });
  assert.equal(ok('EDUINO-LAB', '12345678'), '');
  assert.equal(ok('교실 Wi-Fi'), '');
  assert.match(ok(''), /Wi-Fi 이름/);
  assert.match(ok(' a'), /빈칸/);
  assert.match(ok('#a'), /#/);
  assert.match(ok('가'.repeat(11)), /너무 길어요/);
  assert.match(ok('a', '1234567'), /8~63/);
  assert.equal(ok('a', 'a'.repeat(64)), '');
  assert.match(ok('a', 'z'.repeat(64)), /8~63/);
  assert.match(ok('a', '', '가'.repeat(25)), /24자/);
  assert.match(ok('a', '', 'x\ny'), /보이지 않는/);
}

/* --- 4b. Wired: addresses by kind, Wi-Fi off --------------------------------- */
{
  const r = parseResult(
    'result-ubuntu-77aa.txt',
    `2026-10-24 10:00\r\n로봇: ubuntu-77aa\r\n결과: 성공 — Wi-Fi 를 껐어요 (유선 LAN 으로만 연결).\r\n로봇 ID: 61   주소: 유선 192.168.0.61 · 직결 ${DIRECT_IP}\r\n`,
  );
  assert.deepEqual(r.addrs, [
    { kind: '유선', ip: '192.168.0.61' },
    { kind: '직결', ip: DIRECT_IP },
  ]);
  assert.deepEqual(r.ips, ['192.168.0.61']);
  const both = parseResult('r.txt', '로봇 ID: 52   주소: 무선 192.168.0.52 · 유선 192.168.0.61 · 직결 169.254.127.10\r\n');
  assert.deepEqual(both.ips, ['192.168.0.52', '192.168.0.61']);
  const direct = parseResult('r.txt', `로봇 ID: -   주소: 직결 ${DIRECT_IP}\r\n`);
  assert.deepEqual(direct.ips, []);
  assert.equal(direct.addrs[0].kind, '직결');
  // the Wi-Fi-off word needs no password; the robot has no hotspot any more (same words as usbkit.go)
  assert.equal(checkWifi({ ssid: WIFI_OFF, password: '', label: '3조' }), '');
  assert.match(checkWifi({ ssid: '핫스팟', password: '', label: '' }), /쓰지 않아요/);
}

/* --- 5. Words ------------------------------------------------------------------ */
assert.equal(kitDate('20261014-051829-c782f72'), '2026.10.14');
assert.equal(kitDate(undefined), '');
assert.equal(formatBytes(105 * 1024 * 1024), '105 MB');
assert.equal(formatBytes(7.5 * 1024 ** 3), '7.5 GB');

console.log('usb kit: results, form, words OK');
