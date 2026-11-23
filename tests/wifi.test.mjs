// Tests the real wifi.js that the pages load - there is no separate copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUIET_ZONE,
  SECURITY,
  buildWifiString,
  detectOs,
  encodeState,
  escapeWifiValue,
  normalizeSecurity,
  parseWifiString,
  qrModules,
  readLinkParams,
  sanitizeFilename,
} from '../wifi.js';

test('normalizeSecurity', async (t) => {
  await t.test('maps WPA variants', () => {
    assert.equal(normalizeSecurity('WPA'), 'WPA');
    assert.equal(normalizeSecurity('wpa2'), 'WPA');
    assert.equal(normalizeSecurity('Personal WPA2'), 'WPA');
    assert.equal(normalizeSecurity('WPA2-Personal'), 'WPA');
  });

  await t.test('maps WPA3 / SAE', () => {
    assert.equal(normalizeSecurity('WPA3'), 'WPA3');
    assert.equal(normalizeSecurity('WPA3-Personal'), 'WPA3');
    assert.equal(normalizeSecurity('sae'), 'WPA3');
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
    assert.equal(normalizeSecurity(null), 'WPA');
    assert.equal(normalizeSecurity('martian'), 'WPA');
  });

  await t.test('open beats wpa when both substrings appear', () => {
    assert.equal(normalizeSecurity('open wpa'), 'nopass');
  });

  await t.test('always returns a key of SECURITY', () => {
    for (const raw of ['', 'WPA', 'wpa3', 'WEP', 'open', 'x', null]) {
      assert.ok(SECURITY[normalizeSecurity(raw)]);
    }
  });
});

test('escapeWifiValue', async (t) => {
  await t.test('escapes backslash, semicolon, comma, colon, quote', () => {
    assert.equal(escapeWifiValue('a;b,c:d"e\\f'), 'a\\;b\\,c\\:d\\"e\\\\f');
  });

  await t.test('passes plain strings through unchanged', () => {
    assert.equal(escapeWifiValue('plain'), 'plain');
    assert.equal(escapeWifiValue(''), '');
    assert.equal(escapeWifiValue(), '');
  });
});

test('sanitizeFilename', async (t) => {
  await t.test('strips characters Windows, macOS and Linux reject', () => {
    assert.equal(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j'), 'abcdefghij');
  });

  await t.test('strips control chars (U+0000 to U+001F)', () => {
    const withControls = `foo${String.fromCharCode(0x00, 0x07, 0x1f)}bar`;
    assert.equal(sanitizeFilename(withControls), 'foobar');
  });

  await t.test('replaces whitespace runs with underscores', () => {
    assert.equal(sanitizeFilename('  My  Network  '), 'My_Network');
  });

  await t.test('keeps non-English names', () => {
    assert.equal(sanitizeFilename('Café 🏠'), 'Café_🏠');
  });

  await t.test('falls back when nothing is left', () => {
    assert.equal(sanitizeFilename('   '), 'wifi-network');
    assert.equal(sanitizeFilename('///***'), 'wifi-network');
  });
});

test('buildWifiString', async (t) => {
  await t.test('with WPA + password', () => {
    assert.equal(
      buildWifiString({ ssid: 'Home', password: 'p@ss', security: 'WPA' }),
      'WIFI:T:WPA;S:Home;P:p@ss;H:false;;'
    );
  });

  await t.test('WPA3 is written as WPA, which phones expect', () => {
    assert.equal(
      buildWifiString({ ssid: 'Home', password: 'p', security: 'WPA3' }),
      'WIFI:T:WPA;S:Home;P:p;H:false;;'
    );
  });

  await t.test('open network omits P:', () => {
    assert.equal(
      buildWifiString({ ssid: 'Cafe', password: 'x', security: 'nopass' }),
      'WIFI:T:nopass;S:Cafe;H:false;;'
    );
  });

  await t.test('escapes special SSID + password chars', () => {
    assert.equal(
      buildWifiString({
        ssid: 'Net;Work',
        password: 'p:1',
        security: 'WPA',
        hidden: true,
      }),
      'WIFI:T:WPA;S:Net\\;Work;P:p\\:1;H:true;;'
    );
  });

  await t.test('WEP security passes through', () => {
    assert.equal(
      buildWifiString({ ssid: 'Old', password: 'abcde', security: 'WEP' }),
      'WIFI:T:WEP;S:Old;P:abcde;H:false;;'
    );
  });
});

test('parseWifiString', async (t) => {
  await t.test('round-trips what buildWifiString writes', () => {
    const state = {
      ssid: 'Net;Work: "5G", \\o/',
      password: 'p:a;s,s\\w"ord',
      security: 'WEP',
      hidden: true,
    };
    assert.deepEqual(parseWifiString(buildWifiString(state)), state);
  });

  await t.test('reads fields in any order and case', () => {
    assert.deepEqual(parseWifiString('wifi:S:Home;T:WPA;P:secret;;'), {
      ssid: 'Home',
      password: 'secret',
      security: 'WPA',
      hidden: false,
    });
  });

  await t.test('ignores a leading byte-order mark', () => {
    assert.equal(parseWifiString('\uFEFFWIFI:S:Café;T:nopass;;').ssid, 'Café');
  });

  await t.test('rejects anything that is not a Wi-Fi code', () => {
    assert.equal(parseWifiString('https://example.com'), null);
    assert.equal(parseWifiString('WIFI:T:WPA;P:x;;'), null);
    assert.equal(parseWifiString(undefined), null);
  });
});

test('links', async (t) => {
  const state = {
    ssid: 'Café & Co #1',
    password: 'a b+c&d=e',
    security: 'WPA3',
    hidden: true,
  };

  await t.test('fragment round-trips awkward characters', () => {
    const params = readLinkParams({ hash: `#${encodeState(state)}` });
    assert.equal(params.get('ssid'), state.ssid);
    assert.equal(params.get('password'), state.password);
    assert.equal(params.get('security'), 'WPA3');
    assert.equal(params.get('hidden'), 'true');
  });

  await t.test('password is left out on request and for open networks', () => {
    assert.ok(
      !encodeState(state, { includePassword: false }).includes('password')
    );
    assert.ok(
      !encodeState({ ...state, security: 'nopass' }).includes('password')
    );
  });

  await t.test('falls back to the query string for older links', () => {
    const params = readLinkParams({
      hash: '',
      search: '?ssid=Home&security=WPA',
    });
    assert.equal(params.get('ssid'), 'Home');
  });

  await t.test('reads percent-encoded links from the shell helper', () => {
    const params = readLinkParams({
      hash: '#ssid=Cafe%20%26%20Co&password=Pa%24%24',
    });
    assert.equal(params.get('ssid'), 'Cafe & Co');
    assert.equal(params.get('password'), 'Pa$$');
  });
});

test('detectOs', async (t) => {
  const cases = {
    mac: {
      platform: 'MacIntel',
      maxTouchPoints: 0,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    },
    windows: {
      platform: 'Win32',
      userAgentData: { platform: 'Windows' },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    linux: {
      platform: 'Linux x86_64',
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
    },
    android: {
      platform: 'Linux armv81',
      maxTouchPoints: 5,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    },
    ios: {
      platform: 'iPhone',
      maxTouchPoints: 5,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    },
  };

  for (const [expected, nav] of Object.entries(cases)) {
    await t.test(expected, () => assert.equal(detectOs(nav), expected));
  }

  await t.test('iPad pretending to be a Mac is still iOS', () => {
    assert.equal(detectOs({ ...cases.mac, maxTouchPoints: 5 }), 'ios');
  });

  await t.test('ChromeOS gets the Linux command', () => {
    assert.equal(
      detectOs({
        userAgent:
          'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36',
      }),
      'linux'
    );
  });

  await t.test('unknown when there is nothing to go on', () => {
    assert.equal(detectOs({}), 'unknown');
  });
});

// Draws the code the way the page does and reads it back with jsQR, the same
// decoder the page uses for "Import QR from image".
const jsQrScope = {};
new Function(
  'self',
  readFileSync(new URL('../vendor/jsQR.js', import.meta.url), 'utf8')
)(jsQrScope);

function scan(text, level) {
  const scale = 4;
  const { count, isDark } = qrModules(text, level);
  const size = (count + QUIET_ZONE * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const row = Math.floor(y / scale) - QUIET_ZONE;
      const col = Math.floor(x / scale) - QUIET_ZONE;

      if (
        row >= 0 &&
        col >= 0 &&
        row < count &&
        col < count &&
        isDark(row, col)
      ) {
        pixels.fill(0, (y * size + x) * 4, (y * size + x) * 4 + 3);
      }
    }
  }

  return jsQrScope.jsQR(pixels, size, size)?.data;
}

test('QR codes scan back to exactly what went in', async (t) => {
  const networks = {
    'plain ASCII': { ssid: 'Home WiFi', password: 'correct-horse-battery' },
    'accented letters': { ssid: 'Café Zoë', password: 'señor-naïve' },
    emoji: { ssid: '🏠 Home 📶', password: 'p🔑ss' },
    'Chinese, Japanese, Korean': {
      ssid: '我的网络 ホーム 집',
      password: '密码12345',
    },
    'characters that need escaping': {
      ssid: 'a;b,c:d"e\\f',
      password: ';;::,,',
    },
    'longest allowed password': {
      ssid: 'x'.repeat(32),
      password: 'f'.repeat(64),
    },
  };

  for (const [name, network] of Object.entries(networks)) {
    for (const level of ['L', 'M', 'Q', 'H']) {
      await t.test(`${name} at level ${level}`, () => {
        const payload = buildWifiString({ ...network, security: 'WPA' });
        assert.equal(scan(payload, level), payload);
      });
    }
  }

  await t.test('too much text is an Error, not a crash or a bad code', () => {
    assert.throws(() => qrModules('x'.repeat(5000), 'H'), Error);
  });
});
