// Shared Wi-Fi QR logic. Loaded by index.html (main.js), scan.html (scan.js)
// and the Node tests, so there is exactly one copy of each rule.

import qrcode from './vendor/qrcode-generator.js';

export const SECURITY = {
  WPA: { label: 'WPA / WPA2', qrValue: 'WPA', requiresPassword: true },
  WPA3: { label: 'WPA3', qrValue: 'WPA', requiresPassword: true },
  WEP: { label: 'WEP', qrValue: 'WEP', requiresPassword: true },
  nopass: { label: 'Open network', qrValue: 'nopass', requiresPassword: false },
};

// Accepts whatever a URL, a scanned code, nmcli or netsh hands us
// ("WPA2-Personal", "sae", "Open", ...) and returns a key of SECURITY.
export function normalizeSecurity(raw) {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();

  if (value === 'nopass' || value.includes('open') || value.includes('none')) {
    return 'nopass';
  }

  if (value.includes('wep')) {
    return 'WEP';
  }

  if (value.includes('wpa3') || value.includes('sae')) {
    return 'WPA3';
  }

  return 'WPA';
}

export function escapeWifiValue(value = '') {
  return String(value).replace(/([\\;,:"])/g, '\\$1');
}

export function buildWifiString(state) {
  const security = normalizeSecurity(state.security);
  const password =
    security === 'nopass' ? '' : `P:${escapeWifiValue(state.password)};`;

  return (
    `WIFI:T:${SECURITY[security].qrValue};` +
    `S:${escapeWifiValue(state.ssid)};` +
    password +
    `H:${state.hidden ? 'true' : 'false'};;`
  );
}

export function parseWifiString(raw) {
  // trim() also drops the byte-order mark some generators put in front.
  const text = String(raw ?? '').trim();

  if (!/^WIFI:/i.test(text)) {
    return null;
  }

  const fields = {};
  let key = null;
  let value = '';

  for (let i = 5; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '\\' && i + 1 < text.length) {
      i += 1;
      value += text[i];
    } else if (key === null && ch === ':') {
      key = value.toUpperCase();
      value = '';
    } else if (ch === ';') {
      if (key) {
        fields[key] = value;
      }
      key = null;
      value = '';
    } else {
      value += ch;
    }
  }

  if (key && value) {
    fields[key] = value;
  }

  if (!fields.S) {
    return null;
  }

  return {
    ssid: fields.S,
    password: fields.P || '',
    security: normalizeSecurity(fields.T || 'WPA'),
    hidden: String(fields.H || '').toLowerCase() === 'true',
  };
}

// Strips everything Windows, macOS or Linux refuse in a file name.
export function sanitizeFilename(value) {
  const sanitized = String(value ?? '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '_');

  return sanitized || 'wifi-network';
}

// Network details travel in the URL fragment (#ssid=...), which browsers never
// send to the server. The query string is still read for older links.
export function encodeState(state, { includePassword = true } = {}) {
  const security = normalizeSecurity(state.security);
  const params = new URLSearchParams({
    ssid: state.ssid,
    security,
    hidden: String(Boolean(state.hidden)),
  });

  if (includePassword && security !== 'nopass' && state.password) {
    params.set('password', state.password);
  }

  return params.toString();
}

export function readLinkParams({ hash = '', search = '' } = {}) {
  return new URLSearchParams(hash.replace(/^#/, '') || search);
}

// Returns 'mac', 'windows', 'linux', 'ios', 'android' or 'unknown'.
export function detectOs(nav = globalThis.navigator ?? {}) {
  const text = [nav.userAgentData?.platform, nav.platform, nav.userAgent]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (text.includes('android')) {
    return 'android';
  }

  // iPadOS reports itself as a Mac, but only a touch device has touch points.
  if (
    /iphone|ipad|ipod/.test(text) ||
    (text.includes('mac') && nav.maxTouchPoints > 1)
  ) {
    return 'ios';
  }

  if (/windows|win32|win64/.test(text)) {
    return 'windows';
  }

  if (text.includes('mac')) {
    return 'mac';
  }

  if (/linux|x11|cros/.test(text)) {
    return 'linux';
  }

  return 'unknown';
}

// The text is encoded as UTF-8 bytes here rather than by the library, so
// accented names, CJK and emoji come out as the bytes a phone expects.
// Throws if the text is too long for a QR code.
export function qrModules(text, level = 'M') {
  const bytes = new TextEncoder().encode(text);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const qr = qrcode(0, level);
  qr.addData(binary, 'Byte');

  try {
    qr.make();
  } catch (error) {
    throw new Error(`QR code generation failed: ${error?.message ?? error}`);
  }

  return {
    count: qr.getModuleCount(),
    isDark: (row, col) => qr.isDark(row, col),
  };
}

// Blank border, in modules, that scanners need around a code.
export const QUIET_ZONE = 4;

export function drawQr(
  canvas,
  text,
  { level = 'M', dark = '#000000', light = '#ffffff', size = 640 } = {}
) {
  const { count, isDark } = qrModules(text, level);
  const total = count + QUIET_ZONE * 2;
  const scale = Math.max(1, Math.ceil(size / total));
  const ctx = canvas.getContext('2d');

  canvas.width = total * scale;
  canvas.height = total * scale;
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = dark;

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (isDark(row, col)) {
        ctx.fillRect(
          (col + QUIET_ZONE) * scale,
          (row + QUIET_ZONE) * scale,
          scale,
          scale
        );
      }
    }
  }
}
