import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSecurity,
  escapeWifiValue,
  sanitizeFilename,
  buildWifiString,
} from './main.pure.mjs';

test('normalizeSecurity', async (t) => {
  await t.test('maps WPA variants', () => {
    assert.equal(normalizeSecurity('WPA'), 'WPA');
    assert.equal(normalizeSecurity('wpa2'), 'WPA');
    assert.equal(normalizeSecurity('Personal WPA2'), 'WPA');
  });

  await t.test('maps WEP', () => {
    assert.equal(normalizeSecurity('wep'), 'WEP');
    assert.equal(normalizeSecurity('WEP'), 'WEP');
  });

  await t.test('maps nopass / open / none', () => {
    assert.equal(normalizeSecurity('nopass'), 'nopass');
    assert.equal(normalizeSecurity('open'), 'nopass');
    assert.equal(normalizeSecurity('none'), 'nopass');
    assert.equal(normalizeSecurity('Open Network'), 'nopass');
  });

  await t.test('defaults to WPA on empty / unknown', () => {
    assert.equal(normalizeSecurity(''), 'WPA');
    assert.equal(normalizeSecurity(undefined), 'WPA');
    assert.equal(normalizeSecurity('martian'), 'WPA');
  });

  await t.test('open beats wpa when both substrings appear', () => {
    // "open" is checked before "wpa", confirming priority order.
    assert.equal(normalizeSecurity('open wpa'), 'nopass');
  });
});

test('escapeWifiValue escapes special chars', async (t) => {
  await t.test('escapes backslash, semicolon, comma, colon, quote', () => {
    assert.equal(
      escapeWifiValue('a;b,c:d"e\\f'),
      'a\\;b\\,c\\:d\\"e\\\\f',
    );
  });

  await t.test('passes plain strings through unchanged', () => {
    assert.equal(escapeWifiValue('plain'), 'plain');
    assert.equal(escapeWifiValue(''), '');
  });

  await t.test('handles default empty arg', () => {
    assert.equal(escapeWifiValue(), '');
  });
});

test('sanitizeFilename', async (t) => {
  await t.test('strips reserved filesystem chars', () => {
    assert.equal(
      sanitizeFilename('a/b\\c:d*e?f"g<h>i|j'),
      'abcdefghij',
    );
  });

  await t.test('strips control chars (U+0000 to U+001F)', () => {
    const withControls = `foo${String.fromCharCode(0x00, 0x07, 0x1f)}bar`;
    assert.equal(sanitizeFilename(withControls), 'foobar');
  });

  await t.test('replaces whitespace runs with underscores', () => {
    assert.equal(sanitizeFilename('  My  Network  '), 'My_Network');
    assert.equal(sanitizeFilename('My Network'), 'My_Network');
  });

  await t.test('falls back when empty', () => {
    assert.equal(sanitizeFilename('   '), 'wifi-network');
    assert.equal(sanitizeFilename(''), 'wifi-network');
  });

  await t.test('falls back when only forbidden chars', () => {
    assert.equal(sanitizeFilename('///***'), 'wifi-network');
  });
});

test('buildWifiString', async (t) => {
  await t.test('with WPA + password', () => {
    const s = buildWifiString({
      ssid: 'Home',
      password: 'p@ss',
      security: 'WPA',
      hidden: false,
    });
    assert.equal(s, 'WIFI:T:WPA;S:Home;P:p@ss;H:false;;');
  });

  await t.test('open network omits P:', () => {
    const s = buildWifiString({
      ssid: 'Cafe',
      security: 'nopass',
      hidden: false,
    });
    assert.equal(s, 'WIFI:T:nopass;S:Cafe;H:false;;');
  });

  await t.test('escapes special SSID + password chars', () => {
    const s = buildWifiString({
      ssid: 'Net;Work',
      password: 'p:1',
      security: 'WPA',
      hidden: true,
    });
    assert.equal(s, 'WIFI:T:WPA;S:Net\\;Work;P:p\\:1;H:true;;');
  });

  await t.test('hidden flag renders true/false correctly', () => {
    const visible = buildWifiString({
      ssid: 'X',
      password: 'y',
      security: 'WPA',
      hidden: false,
    });
    assert.match(visible, /H:false;;$/);

    const hidden = buildWifiString({
      ssid: 'X',
      password: 'y',
      security: 'WPA',
      hidden: true,
    });
    assert.match(hidden, /H:true;;$/);
  });

  await t.test('WEP security passes through', () => {
    const s = buildWifiString({
      ssid: 'Old',
      password: 'abcde',
      security: 'WEP',
      hidden: false,
    });
    assert.equal(s, 'WIFI:T:WEP;S:Old;P:abcde;H:false;;');
  });
});
