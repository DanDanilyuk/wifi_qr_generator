const THEME_KEY = 'theme';
const THEME_ATTRIBUTE = 'data-theme';
const RECENT_NETWORKS_KEY = 'wifi-qr:recent-networks';
const RECENT_NETWORKS_LIMIT = 5;
const QR_PREFS_KEY = 'wifi-qr:qr-prefs';
const QR_DEFAULT_PREFS = {
  correctLevel: 'M',
  colorDark: '#000000',
  colorLight: '#ffffff',
};
const VALID_CORRECT_LEVELS = ['L', 'M', 'Q', 'H'];
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const PDF_PREFS_KEY = 'wifi-qr:pdf-prefs';
const PDF_LOGO_MAX_PERSIST_BYTES = 50 * 1024;
const PDF_DEFAULT_TITLE = 'Wi-Fi access';
const PDF_DEFAULT_SUBTITLE = 'Scan the QR code or enter the details below.';
const JSQR_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.min.js';
const JSQR_INTEGRITY =
  'sha384-ZSs6LKr2GoUPDyHrN+rCQgyHL1yUyok5xMniSrgeRG7rUvA6vTmxronM1eZOfjgz';
const SECURITY_CONFIG = {
  WPA: {
    label: 'WPA / WPA2',
    qrValue: 'WPA',
    requiresPassword: true,
  },
  WPA3: {
    label: 'WPA3',
    qrValue: 'WPA',
    requiresPassword: true,
  },
  WEP: {
    label: 'WEP',
    qrValue: 'WEP',
    requiresPassword: true,
  },
  nopass: {
    label: 'Open network',
    qrValue: 'nopass',
    requiresPassword: false,
  },
};

const JSPDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const JSPDF_INTEGRITY = 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk';

let jspdfPromise = null;

function loadJsPdf() {
  if (!jspdfPromise) {
    jspdfPromise = new Promise((resolve, reject) => {
      if (window.jspdf?.jsPDF) {
        resolve(window.jspdf);
        return;
      }

      const script = document.createElement('script');
      script.src = JSPDF_SRC;
      script.integrity = JSPDF_INTEGRITY;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        if (window.jspdf?.jsPDF) {
          resolve(window.jspdf);
        } else {
          reject(new Error('jsPDF loaded but window.jspdf is unavailable.'));
        }
      };
      script.onerror = () => {
        jspdfPromise = null;
        reject(new Error('Failed to load jsPDF from the CDN.'));
      };
      document.head.appendChild(script);
    });
  }

  return jspdfPromise;
}

const savedTheme = localStorage.getItem(THEME_KEY);
const systemPrefersDark = window.matchMedia(
  '(prefers-color-scheme: dark)',
).matches;
const initialTheme =
  savedTheme === 'dark' || (!savedTheme && systemPrefersDark)
    ? 'dark'
    : 'light';

document.documentElement.setAttribute(THEME_ATTRIBUTE, initialTheme);

function normalizeSecurity(rawValue = '') {
  const value = rawValue.trim().toLowerCase();

  if (!value) {
    return 'WPA';
  }

  if (value === 'nopass' || value.includes('open') || value.includes('none')) {
    return 'nopass';
  }

  if (value.includes('wep')) {
    return 'WEP';
  }

  if (value.includes('wpa3') || value.includes('sae')) {
    return 'WPA3';
  }

  if (value.includes('wpa')) {
    return 'WPA';
  }

  return 'WPA';
}

function escapeWifiValue(value = '') {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

function sanitizeFilename(value) {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '_');

  return sanitized || 'wifi-network';
}

function detectOs() {
  const ua = window.navigator.userAgent || '';
  const rawPlatform =
    window.navigator.userAgentData?.platform || window.navigator.platform || '';
  const platform =
    `${window.navigator.userAgentData?.platform || ''} ${
      window.navigator.platform || ''
    } ${ua}`.toLowerCase();

  if (
    /iPad|iPhone|iPod/i.test(ua) ||
    (window.navigator.maxTouchPoints > 1 && /Mac/i.test(rawPlatform))
  ) {
    return 'ios';
  }

  if (platform.includes('win')) {
    return 'windows';
  }

  if (platform.includes('mac')) {
    return 'mac';
  }

  if (platform.includes('linux')) {
    return 'linux';
  }

  return 'unknown';
}

function buildCommandForCurrentOs() {
  switch (detectOs()) {
    case 'windows':
      return 'powershell -Command "& {Invoke-WebRequest -Uri \'https://dandanilyuk.github.io/wifi_qr_generator/wifi_gen.sh\' -OutFile \\"$env:TEMP\\wifi_gen.sh\\"; bash \\"$env:TEMP\\wifi_gen.sh\\"}"';
    case 'linux':
      return 'bash <(curl -fsSL https://dandanilyuk.github.io/wifi_qr_generator/wifi_gen.sh)';
    case 'ios':
      return '';
    case 'mac':
    default:
      return '/bin/bash -c "$(curl -fsSL https://dandanilyuk.github.io/wifi_qr_generator/wifi_gen.sh)"';
  }
}

function getSecurityMeta(rawSecurity) {
  return SECURITY_CONFIG[normalizeSecurity(rawSecurity)];
}

function buildWifiString(state) {
  const security = normalizeSecurity(state.security);
  const parts = [
    `WIFI:T:${SECURITY_CONFIG[security].qrValue};`,
    `S:${escapeWifiValue(state.ssid)};`,
  ];

  if (security !== 'nopass') {
    parts.push(`P:${escapeWifiValue(state.password)};`);
  }

  parts.push(`H:${state.hidden ? 'true' : 'false'};`);
  parts.push(';');

  return parts.join('');
}

function buildAppUrl(state, { includePassword } = { includePassword: false }) {
  const nextUrl = new URL(window.location.href);
  nextUrl.search = '';
  nextUrl.hash = '';

  if (!state.ssid) {
    return nextUrl.toString();
  }

  const params = new URLSearchParams();
  params.set('ssid', state.ssid);
  params.set('security', normalizeSecurity(state.security));
  params.set('hidden', String(state.hidden));

  if (
    includePassword &&
    normalizeSecurity(state.security) !== 'nopass' &&
    state.password
  ) {
    params.set('password', state.password);
  }

  nextUrl.hash = params.toString();

  return nextUrl.toString();
}

function parseWifiString(raw) {
  if (typeof raw !== 'string') {
    return null;
  }

  const trimmed = raw.trim();

  if (!/^WIFI:/i.test(trimmed)) {
    return null;
  }

  const body = trimmed.slice(5);
  const fields = {};
  let i = 0;
  let key = null;
  let value = '';
  let readingKey = true;

  while (i < body.length) {
    const ch = body[i];

    if (ch === '\\' && i + 1 < body.length) {
      value += body[i + 1];
      i += 2;
      continue;
    }

    if (readingKey) {
      if (ch === ':') {
        key = value;
        value = '';
        readingKey = false;
        i += 1;
        continue;
      }

      if (ch === ';') {
        key = null;
        value = '';
        readingKey = true;
        i += 1;
        continue;
      }

      value += ch;
      i += 1;
      continue;
    }

    if (ch === ';') {
      if (key) {
        fields[key.toUpperCase()] = value;
      }
      key = null;
      value = '';
      readingKey = true;
      i += 1;
      continue;
    }

    value += ch;
    i += 1;
  }

  if (key && value) {
    fields[key.toUpperCase()] = value;
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

let jsqrLoadPromise = null;

function loadJsQR() {
  if (typeof window.jsQR === 'function') {
    return Promise.resolve(window.jsQR);
  }

  if (jsqrLoadPromise) {
    return jsqrLoadPromise;
  }

  jsqrLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = JSQR_SRC;
    script.integrity = JSQR_INTEGRITY;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    script.onload = () => {
      if (typeof window.jsQR === 'function') {
        resolve(window.jsQR);
      } else {
        jsqrLoadPromise = null;
        reject(new Error('jsQR loaded but the global is missing.'));
      }
    };
    script.onerror = () => {
      jsqrLoadPromise = null;
      reject(new Error('Unable to load the QR decoder.'));
    };
    document.head.appendChild(script);
  });

  return jsqrLoadPromise;
}

function loadImageBitmapFromFile(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read the image.'));
    };
    image.src = url;
  });
}

function decodeQrFromImageData(imageData) {
  return loadJsQR().then(jsQR => {
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    return result ? result.data : null;
  });
}

async function decodeQrFromFile(file) {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();

      if (formats.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        const bitmap = await loadImageBitmapFromFile(file);
        const codes = await detector.detect(bitmap);

        if (codes && codes.length) {
          return codes[0].rawValue || null;
        }
      }
    } catch (error) {
      console.warn('BarcodeDetector failed, falling back to jsQR:', error);
    }
  }

  const bitmap = await loadImageBitmapFromFile(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }

  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  if (typeof bitmap.close === 'function') {
    bitmap.close();
  }

  return decodeQrFromImageData(imageData);
}

function readPdfPrefs() {
  try {
    const raw = localStorage.getItem(PDF_PREFS_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Unable to read PDF prefs from localStorage:', error);
    return {};
  }
}

function writePdfPrefs(prefs) {
  try {
    localStorage.setItem(PDF_PREFS_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.warn('Unable to persist PDF prefs to localStorage:', error);
  }
}

function buildScanUrl(state, { includePassword } = { includePassword: true }) {
  const baseUrl = new URL('scan.html', window.location.href);
  const params = new URLSearchParams();

  params.set('ssid', state.ssid);
  params.set('security', normalizeSecurity(state.security));
  params.set('hidden', String(state.hidden));

  if (
    includePassword &&
    normalizeSecurity(state.security) !== 'nopass' &&
    state.password
  ) {
    params.set('password', state.password);
  }

  baseUrl.hash = params.toString();
  return baseUrl.toString();
}

function copyWithFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  return copied;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Failed to copy with clipboard API:', error);
    }
  }

  return copyWithFallback(text);
}

function debounce(fn, ms) {
  let id;
  return function (...args) {
    clearTimeout(id);
    id = setTimeout(() => fn.apply(this, args), ms);
  };
}

function loadRecentNetworks() {
  try {
    const raw = localStorage.getItem(RECENT_NETWORKS_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(entry => entry && typeof entry.ssid === 'string' && entry.ssid)
      .slice(0, RECENT_NETWORKS_LIMIT)
      .map(entry => ({
        ssid: entry.ssid,
        security: normalizeSecurity(entry.security || 'WPA'),
        hidden: Boolean(entry.hidden),
        savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : Date.now(),
        password: typeof entry.password === 'string' ? entry.password : '',
      }));
  } catch (error) {
    console.error('Failed to read recent networks:', error);
    return [];
  }
}

function persistRecentNetworks(entries) {
  try {
    localStorage.setItem(RECENT_NETWORKS_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('Failed to persist recent networks:', error);
  }
}

function saveRecentNetwork(state, { rememberPassword = false } = {}) {
  if (!state || !state.ssid) {
    return [];
  }

  const security = normalizeSecurity(state.security);
  const includePassword =
    rememberPassword &&
    security !== 'nopass' &&
    typeof state.password === 'string' &&
    state.password.length > 0;
  const entry = {
    ssid: state.ssid,
    security,
    hidden: Boolean(state.hidden),
    savedAt: Date.now(),
  };

  if (includePassword) {
    entry.password = state.password;
  }

  const existing = loadRecentNetworks();
  const filtered = existing.filter(item => {
    return !(
      item.ssid === entry.ssid &&
      normalizeSecurity(item.security) === security
    );
  });
  const next = [entry, ...filtered].slice(0, RECENT_NETWORKS_LIMIT);

  persistRecentNetworks(next);

  return next;
}

function clearRecentNetworks() {
  try {
    localStorage.removeItem(RECENT_NETWORKS_KEY);
  } catch (error) {
    console.error('Failed to clear recent networks:', error);
  }
}

function loadQrPrefs() {
  try {
    const raw = localStorage.getItem(QR_PREFS_KEY);

    if (!raw) {
      return { ...QR_DEFAULT_PREFS };
    }

    const parsed = JSON.parse(raw);

    return {
      correctLevel: VALID_CORRECT_LEVELS.includes(parsed?.correctLevel)
        ? parsed.correctLevel
        : QR_DEFAULT_PREFS.correctLevel,
      colorDark: HEX_COLOR_PATTERN.test(parsed?.colorDark || '')
        ? parsed.colorDark
        : QR_DEFAULT_PREFS.colorDark,
      colorLight: HEX_COLOR_PATTERN.test(parsed?.colorLight || '')
        ? parsed.colorLight
        : QR_DEFAULT_PREFS.colorLight,
    };
  } catch (error) {
    console.error('Failed to read QR preferences:', error);
    return { ...QR_DEFAULT_PREFS };
  }
}

function saveQrPrefs(prefs) {
  try {
    localStorage.setItem(QR_PREFS_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.error('Failed to persist QR preferences:', error);
  }
}

function getCorrectLevelConstant(level) {
  if (typeof QRCode === 'undefined' || !QRCode.CorrectLevel) {
    return undefined;
  }

  return QRCode.CorrectLevel[level] ?? QRCode.CorrectLevel.H;
}

function hexToRgb(hex) {
  if (!HEX_COLOR_PATTERN.test(hex)) {
    return null;
  }

  const value = hex.slice(1);

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }) {
  const channel = component => {
    const ratio = component / 255;

    return ratio <= 0.03928
      ? ratio / 12.92
      : Math.pow((ratio + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hexA, hexB) {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);

  if (!rgbA || !rgbB) {
    return 1;
  }

  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  return (lighter + 0.05) / (darker + 0.05);
}

async function canvasToPngFile(canvas, filename) {
  if (!canvas) {
    return null;
  }

  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/png');
  });

  if (!blob) {
    return null;
  }

  return new File([blob], filename, { type: 'image/png' });
}

document.addEventListener('DOMContentLoaded', () => {
  const refs = {
    clearRecent: document.getElementById('clear-recent'),
    command: document.getElementById('command'),
    copyCommand: document.getElementById('copy-command'),
    copyLink: document.getElementById('copy-link'),
    copyPassword: document.getElementById('copy-password'),
    copyScanLink: document.getElementById('copy-scan-link'),
    customizeFeedback: document.getElementById('qr-customize-feedback'),
    downloadQr: document.getElementById('download-qr'),
    eyeIcon: document.getElementById('eye-icon'),
    eyeOffIcon: document.getElementById('eye-off-icon'),
    formFeedback: document.getElementById('form-feedback'),
    generatePdf: document.getElementById('generate-pdf'),
    hidden: document.getElementById('hidden'),
    importQr: document.getElementById('import-qr'),
    importQrFile: document.getElementById('import-qr-file'),
    importStatus: document.getElementById('import-status'),
    moonIcon: document.getElementById('moon-icon'),
    password: document.getElementById('password'),
    passwordHelp: document.getElementById('password-help'),
    pdfLogo: document.getElementById('pdf-logo'),
    pdfLogoClear: document.getElementById('pdf-logo-clear'),
    pdfLogoStatus: document.getElementById('pdf-logo-status'),
    pdfSubtitle: document.getElementById('pdf-subtitle'),
    pdfTitle: document.getElementById('pdf-title'),
    qrColorDark: document.getElementById('qr-color-dark'),
    qrColorLight: document.getElementById('qr-color-light'),
    qrColorsReset: document.getElementById('qr-colors-reset'),
    qrCorrectLevel: document.getElementById('qr-correct-level'),
    qrcodeContainer: document.getElementById('qrcode'),
    qrForm: document.getElementById('qr-form'),
    recentList: document.getElementById('recent-networks-list'),
    recentNetworks: document.getElementById('recent-networks'),
    rememberPassword: document.getElementById('remember-password'),
    rememberPasswordField: document.getElementById('remember-password-field'),
    resultCard: document.querySelector('.result-card'),
    resultHidden: document.getElementById('result-hidden'),
    resultHiddenRow: document.getElementById('result-hidden-row'),
    resultPassword: document.getElementById('result-password'),
    resultSecurity: document.getElementById('result-security'),
    resultSsid: document.getElementById('result-ssid'),
    resultStatus: document.getElementById('result-status'),
    security: document.getElementById('security'),
    securityHelp: document.getElementById('security-help'),
    shareNetwork: document.getElementById('share-network'),
    ssid: document.getElementById('ssid'),
    sunIcon: document.getElementById('sun-icon'),
    themeBtn: document.getElementById('theme-toggle'),
    togglePassword: document.getElementById('toggle-password'),
  };

  const pdfState = {
    title: '',
    subtitle: '',
    logoDataUrl: null,
    logoMime: null,
    logoSize: 0,
    logoName: null,
  };

  let hasGenerated = false;
  let currentResultState = null;
  let qrPrefs = loadQrPrefs();
  let qrcode = createQrCode(qrPrefs);

  function createQrCode(prefs) {
    refs.qrcodeContainer.innerHTML = '';

    return new QRCode(refs.qrcodeContainer, {
      width: 320,
      height: 320,
      colorDark: prefs.colorDark,
      colorLight: prefs.colorLight,
      correctLevel: getCorrectLevelConstant(prefs.correctLevel),
    });
  }

  function reinitQrCode() {
    qrcode = createQrCode(qrPrefs);
  }

  function updateThemeToggle() {
    const isDark =
      document.documentElement.getAttribute(THEME_ATTRIBUTE) === 'dark';

    refs.moonIcon.style.display = isDark ? 'none' : 'block';
    refs.sunIcon.style.display = isDark ? 'block' : 'none';
    refs.themeBtn.setAttribute(
      'aria-label',
      isDark ? 'Switch to light theme' : 'Switch to dark theme',
    );
    refs.themeBtn.setAttribute('aria-pressed', String(isDark));
  }

  function setMessage(element, message, state = 'info') {
    if (!message) {
      element.hidden = true;
      element.textContent = '';
      delete element.dataset.state;
      return;
    }

    element.hidden = false;
    element.dataset.state = state;
    element.textContent = message;
  }

  function flashButton(button, className = 'copied') {
    button.classList.add(className);

    window.clearTimeout(button.flashTimeoutId);
    button.flashTimeoutId = window.setTimeout(() => {
      button.classList.remove(className);
    }, 1800);
  }

  function getFormState() {
    return {
      ssid: refs.ssid.value.trim(),
      password: refs.password.value,
      security: normalizeSecurity(refs.security.value),
      hidden: refs.hidden.checked,
    };
  }

  function validateState(state) {
    if (!state.ssid) {
      return {
        field: refs.ssid,
        message: 'Enter the Wi-Fi network name to generate a QR code.',
        valid: false,
      };
    }

    if (getSecurityMeta(state.security).requiresPassword && !state.password) {
      return {
        field: refs.password,
        message: 'Enter the Wi-Fi password for this protected network.',
        valid: false,
      };
    }

    return { valid: true };
  }

  function syncVisibleUrl(state) {
    const nextUrl = new URL(buildAppUrl(state, { includePassword: false }));
    const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    window.history.replaceState({}, '', nextPath || nextUrl.pathname);
  }

  function readUrlParams() {
    const fragment = window.location.hash.slice(1);

    if (fragment) {
      return new URLSearchParams(fragment);
    }

    return new URLSearchParams(window.location.search);
  }

  function updatePasswordFieldState() {
    const isOpenNetwork = normalizeSecurity(refs.security.value) === 'nopass';

    refs.password.disabled = isOpenNetwork;
    refs.password.type = 'password';
    refs.password.placeholder = isOpenNetwork
      ? 'No password needed for open networks'
      : 'Enter password';
    refs.togglePassword.hidden = isOpenNetwork;
    refs.eyeIcon.style.display = 'block';
    refs.eyeOffIcon.style.display = 'none';
    refs.togglePassword.setAttribute('aria-label', 'Show password');
    refs.passwordHelp.textContent = isOpenNetwork
      ? 'This QR code will connect to an open network without a password.'
      : 'Protected networks need a password to scan and join.';
    refs.securityHelp.textContent = isOpenNetwork
      ? 'Open networks let guests join immediately after scanning.'
      : 'Choose the same security mode your router uses.';
    updateRememberPasswordVisibility();
  }

  function updateResultCard(state) {
    refs.resultSsid.textContent = state.ssid;
    refs.resultSecurity.textContent = getSecurityMeta(state.security).label;
    refs.resultHidden.textContent = state.hidden ? 'Yes' : 'No';
    refs.resultHiddenRow.hidden = !state.hidden;
    refs.resultPassword.textContent =
      normalizeSecurity(state.security) === 'nopass'
        ? 'No password'
        : state.password;
    refs.copyPassword.hidden = normalizeSecurity(state.security) === 'nopass';
  }

  function markFieldInvalid(field) {
    if (!field) {
      return;
    }

    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', 'form-feedback');
  }

  function clearFieldInvalid() {
    [refs.ssid, refs.password].forEach(field => {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    });
  }

  function revealResults({ scrollIntoView } = { scrollIntoView: false }) {
    refs.resultCard.hidden = false;

    if (scrollIntoView) {
      refs.resultCard.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }

  function hideResults() {
    refs.resultCard.hidden = true;
    currentResultState = null;
  }

  function applyStateToForm(entry) {
    if (!entry) {
      return;
    }

    refs.ssid.value = entry.ssid || '';
    refs.security.value = normalizeSecurity(entry.security || 'WPA');
    refs.hidden.checked = Boolean(entry.hidden);

    if (typeof entry.password === 'string' && entry.password.length > 0) {
      refs.password.value = entry.password;

      if (refs.rememberPassword) {
        refs.rememberPassword.checked = true;
      }
    } else {
      refs.password.value = '';

      if (refs.rememberPassword) {
        refs.rememberPassword.checked = false;
      }
    }

    updatePasswordFieldState();
    updateRememberPasswordVisibility();
  }

  function renderRecentNetworks() {
    if (!refs.recentNetworks || !refs.recentList) {
      return;
    }

    const entries = loadRecentNetworks();

    refs.recentList.innerHTML = '';

    if (entries.length === 0) {
      refs.recentNetworks.hidden = true;
      return;
    }

    refs.recentNetworks.hidden = false;

    entries.forEach(entry => {
      const pill = document.createElement('button');

      pill.type = 'button';
      pill.className = 'recent-pill';
      pill.dataset.savedAt = String(entry.savedAt);
      pill.setAttribute(
        'aria-label',
        `Use ${entry.ssid} (${getSecurityMeta(entry.security).label})`,
      );

      const name = document.createElement('span');

      name.className = 'recent-pill-name';
      name.textContent = entry.ssid;
      pill.appendChild(name);

      const badge = document.createElement('span');

      badge.className = 'recent-pill-badge';

      if (entry.password) {
        badge.dataset.savedPassword = 'true';
        badge.textContent = 'saved';
        badge.title = 'Password stored locally in this browser.';
      } else if (normalizeSecurity(entry.security) === 'nopass') {
        badge.textContent = 'open';
      } else {
        badge.textContent = normalizeSecurity(entry.security);
      }

      pill.appendChild(badge);

      pill.addEventListener('click', () => {
        applyStateToForm(entry);
        renderResult({ scrollIntoView: true });
      });

      refs.recentList.appendChild(pill);
    });
  }

  function handleClearRecent() {
    clearRecentNetworks();
    renderRecentNetworks();
    setMessage(refs.formFeedback, 'Recent networks cleared.', 'info');
    window.setTimeout(() => {
      if (refs.formFeedback.textContent === 'Recent networks cleared.') {
        setMessage(refs.formFeedback, '');
      }
    }, 2200);
  }

  function updateRememberPasswordVisibility() {
    if (!refs.rememberPasswordField) {
      return;
    }

    const isOpenNetwork = normalizeSecurity(refs.security.value) === 'nopass';

    refs.rememberPasswordField.hidden = isOpenNetwork;

    if (isOpenNetwork && refs.rememberPassword) {
      refs.rememberPassword.checked = false;
    }
  }

  function updateContrastWarning() {
    if (!refs.customizeFeedback) {
      return;
    }

    const ratio = contrastRatio(qrPrefs.colorDark, qrPrefs.colorLight);

    if (ratio < 3) {
      refs.customizeFeedback.hidden = false;
      refs.customizeFeedback.textContent = `Low contrast ratio (${ratio.toFixed(
        2,
      )}:1). Cameras may struggle to scan; aim for 3:1 or higher.`;
      refs.customizeFeedback.dataset.state = 'error';
    } else {
      refs.customizeFeedback.hidden = true;
      refs.customizeFeedback.textContent = '';
      delete refs.customizeFeedback.dataset.state;
    }
  }

  function applyQrPrefsToControls() {
    if (refs.qrCorrectLevel) {
      refs.qrCorrectLevel.value = qrPrefs.correctLevel;
    }

    if (refs.qrColorDark) {
      refs.qrColorDark.value = qrPrefs.colorDark;
    }

    if (refs.qrColorLight) {
      refs.qrColorLight.value = qrPrefs.colorLight;
    }
  }

  function regenerateIfShown() {
    if (currentResultState) {
      renderResult({ persistRecent: false });
    } else {
      updateContrastWarning();
    }
  }

  async function shareNetwork() {
    if (!currentResultState || typeof navigator.share !== 'function') {
      return;
    }

    const state = currentResultState;
    const url = buildAppUrl(state, { includePassword: true });
    const shareData = {
      title: `Wi-Fi: ${state.ssid}`,
      text: 'Tap to join the Wi-Fi network.',
      url,
    };

    const canvas = getGeneratedCanvas();

    if (canvas && typeof navigator.canShare === 'function') {
      try {
        const file = await canvasToPngFile(
          canvas,
          `${sanitizeFilename(state.ssid)}_WiFi_QR.png`,
        );

        if (file && navigator.canShare({ files: [file] })) {
          shareData.files = [file];
        }
      } catch (error) {
        console.error('Failed to attach QR file to share:', error);
      }
    }

    try {
      await navigator.share(shareData);
      setMessage(refs.resultStatus, 'Shared.', 'success');
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }

      if (shareData.files) {
        try {
          const fallback = { ...shareData };

          delete fallback.files;
          await navigator.share(fallback);
          setMessage(refs.resultStatus, 'Shared.', 'success');
          return;
        } catch (fallbackError) {
          if (fallbackError?.name === 'AbortError') {
            return;
          }

          console.error('Share fallback failed:', fallbackError);
        }
      }

      console.error('Share failed:', error);
      setMessage(
        refs.resultStatus,
        'Unable to share from this browser.',
        'error',
      );
    }
  }

  function renderResult({ scrollIntoView = false, persistRecent = true } = {}) {
    const state = getFormState();
    const validation = validateState(state);

    if (!validation.valid) {
      hideResults();
      setMessage(refs.resultStatus, '');
      setMessage(refs.formFeedback, validation.message, 'error');
      clearFieldInvalid();
      markFieldInvalid(validation.field);
      return false;
    }

    reinitQrCode();
    qrcode.makeCode(buildWifiString(state));
    updateResultCard(state);
    syncVisibleUrl(state);
    revealResults({ scrollIntoView });

    currentResultState = state;
    hasGenerated = true;
    setMessage(refs.formFeedback, '');
    setMessage(refs.resultStatus, '');
    clearFieldInvalid();
    updateContrastWarning();

    if (persistRecent) {
      saveRecentNetwork(state, {
        rememberPassword: refs.rememberPassword?.checked,
      });
      renderRecentNetworks();
    }

    return true;
  }

  function getGeneratedCanvas() {
    return refs.qrcodeContainer.querySelector('canvas');
  }

  function downloadQrPng() {
    if (!currentResultState) {
      return;
    }

    const canvas = getGeneratedCanvas();

    if (!canvas) {
      return;
    }

    const filename = `${sanitizeFilename(currentResultState.ssid)}_WiFi_QR.png`;
    const link = document.createElement('a');

    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function setPdfButtonLoading(isLoading) {
    const button = refs.generatePdf;

    if (isLoading) {
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.textContent;
      }

      button.classList.add('loading');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Generating...';
      return;
    }

    button.classList.remove('loading');
    button.disabled = false;
    button.removeAttribute('aria-busy');

    if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }

  async function downloadPdfCard() {
    if (!currentResultState) {
      return;
    }

    const canvas = getGeneratedCanvas();

    if (!canvas) {
      return;
    }

    setPdfButtonLoading(true);

    let jspdfModule;

    try {
      jspdfModule = await loadJsPdf();
    } catch (error) {
      console.error('Failed to load jsPDF:', error);
      setMessage(refs.resultStatus, 'PDF generation failed.', 'error');
      setPdfButtonLoading(false);
      return;
    }

    try {
      const { jsPDF } = jspdfModule;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const cardX = 18;
      const cardY = 18;
      const cardWidth = pageWidth - 36;
      const leftPadding = 12;
      const leftX = cardX + leftPadding;
      const rightX = cardX + cardWidth - leftPadding;
      const qrSize = 88;
      const qrX = (pageWidth - qrSize) / 2;
      const qrY = 54;
      const titleText = (pdfState.title || '').trim() || PDF_DEFAULT_TITLE;
      const subtitleText =
        (pdfState.subtitle || '').trim() || PDF_DEFAULT_SUBTITLE;
      const logoDataUrl = pdfState.logoDataUrl;

      const isOpenNetwork =
        normalizeSecurity(currentResultState.security) === 'nopass';
      const passwordValue = isOpenNetwork
        ? 'Open network'
        : currentResultState.password;

      const details = [
        ['NETWORK', currentResultState.ssid],
        ['PASSWORD', passwordValue],
        ['SECURITY', getSecurityMeta(currentResultState.security).label],
        ['HIDDEN', currentResultState.hidden ? 'Yes' : 'No'],
      ];

      const rowStartY = 166;
      const labelGap = 24;
      const valueLineHeight = 5.2;
      const rowGap = 6;
      const maxValueWidth = cardWidth - 2 * leftPadding - labelGap;
      const maxPasswordLines = 3;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);

      let passwordFontSize = 12;

      if (!isOpenNetwork) {
        const measure = size => {
          pdf.setFontSize(size);
          return pdf.splitTextToSize(passwordValue, maxValueWidth);
        };

        let wrapped = measure(passwordFontSize);

        if (wrapped.length > maxPasswordLines) {
          passwordFontSize = 10;
          wrapped = measure(passwordFontSize);
        }

        if (wrapped.length > maxPasswordLines) {
          passwordFontSize = 9;
          wrapped = measure(passwordFontSize);
        }

        if (wrapped.length > maxPasswordLines) {
          const kept = wrapped.slice(0, maxPasswordLines);
          const lastIndex = kept.length - 1;
          const lastLine = kept[lastIndex] || '';
          const truncatedLast = `${lastLine.replace(/\s+$/, '').slice(0, -1)}…`;
          kept[lastIndex] = truncatedLast;
          wrapped = kept;
        }

        details[1] = ['PASSWORD', wrapped, passwordFontSize];
      }

      const rowSpecs = details.map(entry => {
        const [, rawValue, sizeOverride] = entry;
        let lines;
        let fontSize;

        if (Array.isArray(rawValue)) {
          lines = rawValue;
          fontSize = sizeOverride || 12;
        } else {
          fontSize = sizeOverride || 12;
          pdf.setFontSize(fontSize);
          lines = pdf.splitTextToSize(String(rawValue), maxValueWidth);
        }

        const valueHeight = Math.max(
          valueLineHeight,
          lines.length * valueLineHeight,
        );

        return { lines, fontSize, valueHeight };
      });

      const rowHeights = rowSpecs.map(spec =>
        Math.max(valueLineHeight, spec.valueHeight) + rowGap,
      );
      const detailsBlockHeight = rowHeights.reduce((sum, h) => sum + h, 0);
      const cardHeight = Math.max(220, rowStartY - cardY + detailsBlockHeight + 6);

      pdf.setFillColor(253, 252, 249);
      pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 8, 8, 'F');
      pdf.setDrawColor(226, 221, 212);
      pdf.setLineWidth(0.5);
      pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 8, 8);

      let titleY = 34;

      if (logoDataUrl) {
        try {
          const logoFormat = inferPdfImageFormat(pdfState.logoMime, logoDataUrl);
          const logoProps = pdf.getImageProperties(logoDataUrl);
          const logoMaxWidth = 40;
          const logoMaxHeight = 18;
          const widthRatio = logoMaxWidth / logoProps.width;
          const heightRatio = logoMaxHeight / logoProps.height;
          const scale = Math.min(widthRatio, heightRatio);
          const logoWidth = logoProps.width * scale;
          const logoHeight = logoProps.height * scale;
          const logoX = (pageWidth - logoWidth) / 2;
          const logoY = 22;

          pdf.addImage(
            logoDataUrl,
            logoFormat,
            logoX,
            logoY,
            logoWidth,
            logoHeight,
          );
          titleY = logoY + logoHeight + 8;
        } catch (error) {
          console.warn('Failed to embed logo in PDF:', error);
        }
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(24);
      pdf.setTextColor(26, 23, 21);
      pdf.text(titleText, pageWidth / 2, titleY, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(140, 133, 124);
      pdf.text(subtitleText, pageWidth / 2, titleY + 8, { align: 'center' });

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', qrX, qrY, qrSize, qrSize);

      pdf.setFontSize(8);
      pdf.setTextColor(160, 160, 160);
      pdf.text(
        'Point your phone camera at the code to connect.',
        pageWidth / 2,
        149,
        { align: 'center' },
      );

      let cursorY = rowStartY;

      details.forEach(([label], index) => {
        const spec = rowSpecs[index];
        const rowTop = cursorY;

        if (index > 0) {
          pdf.setDrawColor(235, 235, 235);
          pdf.setLineWidth(0.3);
          pdf.line(leftX, rowTop - 4, rightX, rowTop - 4);
        }

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(label, leftX, rowTop);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(spec.fontSize);
        pdf.setTextColor(20, 20, 20);

        spec.lines.forEach((line, lineIndex) => {
          pdf.text(line, rightX, rowTop + lineIndex * valueLineHeight, {
            align: 'right',
          });
        });

        cursorY = rowTop + rowHeights[index];
      });

      pdf.save(`${sanitizeFilename(currentResultState.ssid)}_WiFi_QR.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      setMessage(refs.resultStatus, 'PDF generation failed.', 'error');
    } finally {
      setPdfButtonLoading(false);
    }
  }

  function inferPdfImageFormat(mimeType, dataUrl) {
    const mime = (mimeType || '').toLowerCase();

    if (mime.includes('jpeg') || mime.includes('jpg')) {
      return 'JPEG';
    }

    if (mime.includes('png')) {
      return 'PNG';
    }

    if (typeof dataUrl === 'string') {
      if (dataUrl.startsWith('data:image/jpeg')) {
        return 'JPEG';
      }

      if (dataUrl.startsWith('data:image/png')) {
        return 'PNG';
      }
    }

    return 'PNG';
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Read failed.'));
      reader.readAsDataURL(file);
    });
  }

  function rasterizeSvgDataUrl(dataUrl, width, height) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const targetWidth = Math.max(1, Math.round(width || 320));
      const targetHeight = Math.max(1, Math.round(height || 320));

      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable.'));
          return;
        }

        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => reject(new Error('Unable to rasterize SVG logo.'));
      image.src = dataUrl;
    });
  }

  function persistPdfPrefs() {
    const prefs = {
      title: pdfState.title || '',
      subtitle: pdfState.subtitle || '',
    };

    if (pdfState.logoDataUrl && pdfState.logoSize <= PDF_LOGO_MAX_PERSIST_BYTES) {
      prefs.logo = {
        dataUrl: pdfState.logoDataUrl,
        mime: pdfState.logoMime || 'image/png',
        size: pdfState.logoSize || 0,
        name: pdfState.logoName || null,
      };
    }

    writePdfPrefs(prefs);
  }

  function updatePdfLogoStatus(message) {
    if (!refs.pdfLogoStatus) {
      return;
    }
    refs.pdfLogoStatus.textContent =
      message || 'PNG, JPEG, or SVG. Resized to about 40mm wide.';
  }

  function updatePdfLogoUI() {
    if (refs.pdfLogoClear) {
      refs.pdfLogoClear.hidden = !pdfState.logoDataUrl;
    }

    if (pdfState.logoDataUrl) {
      const sizeKb = (pdfState.logoSize / 1024).toFixed(1);
      const label = pdfState.logoName
        ? `${pdfState.logoName} (${sizeKb} KB)`
        : `Logo loaded (${sizeKb} KB)`;
      updatePdfLogoStatus(label);
    } else {
      updatePdfLogoStatus(null);
    }
  }

  function clearPdfLogo() {
    pdfState.logoDataUrl = null;
    pdfState.logoMime = null;
    pdfState.logoSize = 0;
    pdfState.logoName = null;

    if (refs.pdfLogo) {
      refs.pdfLogo.value = '';
    }

    updatePdfLogoUI();
    persistPdfPrefs();
  }

  async function handlePdfLogoChange(event) {
    const file = event.target.files && event.target.files[0];

    if (!file) {
      return;
    }

    try {
      let dataUrl = await readFileAsDataUrl(file);
      let mime = file.type || 'image/png';
      let size = file.size || 0;

      if (mime.includes('svg')) {
        const rasterized = await rasterizeSvgDataUrl(dataUrl, 320, 320);
        dataUrl = rasterized;
        mime = 'image/png';
        size = Math.ceil((rasterized.length * 3) / 4);
      }

      pdfState.logoDataUrl = dataUrl;
      pdfState.logoMime = mime;
      pdfState.logoSize = size;
      pdfState.logoName = file.name || null;
      updatePdfLogoUI();
      persistPdfPrefs();
    } catch (error) {
      console.error('Failed to read logo image:', error);
      updatePdfLogoStatus('Unable to read that image. Try another file.');
    }
  }

  function loadPdfPrefsIntoUi() {
    const prefs = readPdfPrefs();

    if (prefs.title && refs.pdfTitle) {
      pdfState.title = prefs.title;
      refs.pdfTitle.value = prefs.title;
    }

    if (prefs.subtitle && refs.pdfSubtitle) {
      pdfState.subtitle = prefs.subtitle;
      refs.pdfSubtitle.value = prefs.subtitle;
    }

    if (prefs.logo && prefs.logo.dataUrl) {
      pdfState.logoDataUrl = prefs.logo.dataUrl;
      pdfState.logoMime = prefs.logo.mime || 'image/png';
      pdfState.logoSize = prefs.logo.size || 0;
      pdfState.logoName = prefs.logo.name || null;
    }

    updatePdfLogoUI();
  }

  async function handleImportQr(file) {
    if (!file) {
      return;
    }

    setMessage(refs.importStatus, 'Decoding QR code...', 'info');

    try {
      const raw = await decodeQrFromFile(file);

      if (!raw) {
        setMessage(
          refs.importStatus,
          'No QR code found in that image. Try a sharper photo.',
          'error',
        );
        return;
      }

      const parsed = parseWifiString(raw);

      if (!parsed) {
        setMessage(
          refs.importStatus,
          'That QR code is not a Wi-Fi credential.',
          'error',
        );
        return;
      }

      refs.ssid.value = parsed.ssid;
      refs.password.value = parsed.password;
      refs.security.value = parsed.security;
      refs.hidden.checked = parsed.hidden;

      updatePasswordFieldState();
      const rendered = renderResult({ scrollIntoView: true });

      if (rendered) {
        setMessage(
          refs.importStatus,
          'Imported network details from the QR image.',
          'success',
        );
      } else {
        setMessage(refs.importStatus, '', 'info');
      }
    } catch (error) {
      console.error('Failed to import QR image:', error);
      setMessage(
        refs.importStatus,
        error && error.message
          ? `Could not decode the image: ${error.message}`
          : 'Could not decode the image.',
        'error',
      );
    }
  }

  async function copyScanLink() {
    const state = getFormState();
    const validation = validateState(state);

    if (!validation.valid) {
      setMessage(refs.formFeedback, validation.message, 'error');
      validation.field.focus();
      return;
    }

    if (!currentResultState) {
      renderResult();
    }

    const copied = await copyText(buildScanUrl(state, { includePassword: true }));
    const isOpen = normalizeSecurity(state.security) === 'nopass';

    setMessage(
      refs.resultStatus,
      copied
        ? isOpen
          ? 'Scan-only link copied.'
          : 'Scan-only link copied. It includes the Wi-Fi password.'
        : 'Unable to copy the scan link from this browser.',
      copied ? 'success' : 'error',
    );

    if (copied) {
      flashButton(refs.copyScanLink);
    }
  }

  async function copySetupLink() {
    const state = getFormState();
    const validation = validateState(state);

    if (!validation.valid) {
      setMessage(refs.formFeedback, validation.message, 'error');
      clearFieldInvalid();
      markFieldInvalid(validation.field);
      validation.field.focus();
      return;
    }

    if (!currentResultState) {
      renderResult({ persistRecent: false });
    }

    const copied = await copyText(buildAppUrl(state, { includePassword: true }));

    setMessage(
      refs.resultStatus,
      copied
        ? normalizeSecurity(state.security) === 'nopass'
          ? 'Setup link copied.'
          : 'Setup link copied. It includes the Wi-Fi password.'
        : 'Unable to copy the setup link from this browser.',
      copied ? 'success' : 'error',
    );

    if (copied) {
      flashButton(refs.copyLink);
    }
  }

  async function copyPassword() {
    if (!currentResultState) {
      return;
    }

    if (normalizeSecurity(currentResultState.security) === 'nopass') {
      setMessage(refs.resultStatus, 'Open networks do not have a password.', 'info');
      return;
    }

    const copied = await copyText(currentResultState.password);

    setMessage(
      refs.resultStatus,
      copied
        ? 'Password copied.'
        : 'Unable to copy the password from this browser.',
      copied ? 'success' : 'error',
    );

    if (copied) {
      flashButton(refs.copyPassword);
    }
  }

  async function copyCommand() {
    const copied = await copyText(refs.command.innerText.trim());

    if (copied) {
      flashButton(refs.copyCommand);
    }
  }

  const debouncedRenderResult = debounce(() => {
    renderResult({ persistRecent: false });
    setMessage(refs.resultStatus, '');
  }, 150);

  function handleFormChange() {
    updatePasswordFieldState();

    if (hasGenerated) {
      debouncedRenderResult();
      return;
    }

    if (!refs.formFeedback.hidden) {
      const validation = validateState(getFormState());

      if (validation.valid) {
        setMessage(refs.formFeedback, '');
        clearFieldInvalid();
      }
    }
  }

  function applyUrlParams() {
    const urlParams = readUrlParams();

    if (urlParams.has('ssid')) {
      refs.ssid.value = urlParams.get('ssid') || '';
    }

    if (urlParams.has('security')) {
      refs.security.value = normalizeSecurity(urlParams.get('security') || '');
    }

    if (urlParams.has('password')) {
      refs.password.value = urlParams.get('password') || '';
    }

    if (urlParams.has('hidden')) {
      refs.hidden.checked = urlParams.get('hidden') === 'true';
    }

    updatePasswordFieldState();

    const state = getFormState();
    const shouldAutogenerate =
      state.ssid &&
      (normalizeSecurity(state.security) === 'nopass' || Boolean(state.password));

    if (
      urlParams.has('ssid') ||
      urlParams.has('security') ||
      urlParams.has('password') ||
      urlParams.has('hidden')
    ) {
      syncVisibleUrl(state);
    }

    if (shouldAutogenerate) {
      renderResult({ persistRecent: false });
    }
  }

  const osCommand = buildCommandForCurrentOs();

  if (osCommand) {
    refs.command.innerText = osCommand;
  } else {
    const terminalSection = document.querySelector('.terminal-section');

    if (terminalSection) {
      terminalSection.hidden = true;
    }
  }

  updateThemeToggle();
  applyQrPrefsToControls();
  updateContrastWarning();
  updateRememberPasswordVisibility();
  renderRecentNetworks();
  loadPdfPrefsIntoUi();
  applyUrlParams();

  refs.themeBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute(THEME_ATTRIBUTE);
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute(THEME_ATTRIBUTE, nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
    updateThemeToggle();
  });

  refs.togglePassword.addEventListener('click', () => {
    const isHidden = refs.password.type === 'password';

    refs.password.type = isHidden ? 'text' : 'password';
    refs.eyeIcon.style.display = isHidden ? 'none' : 'block';
    refs.eyeOffIcon.style.display = isHidden ? 'block' : 'none';
    refs.togglePassword.setAttribute(
      'aria-label',
      isHidden ? 'Hide password' : 'Show password',
    );
    refs.togglePassword.setAttribute('aria-pressed', String(isHidden));
  });

  refs.qrForm.addEventListener('submit', event => {
    event.preventDefault();

    const didRender = renderResult({ scrollIntoView: true });

    if (!didRender) {
      validateState(getFormState()).field?.focus();
    }
  });

  refs.ssid.addEventListener('input', handleFormChange);
  refs.password.addEventListener('input', handleFormChange);
  refs.security.addEventListener('change', handleFormChange);
  refs.hidden.addEventListener('change', handleFormChange);

  refs.copyCommand.addEventListener('click', () => {
    copyCommand().catch(error => {
      console.error('Failed to copy command:', error);
    });
  });

  refs.copyLink.addEventListener('click', () => {
    copySetupLink().catch(error => {
      console.error('Failed to copy setup link:', error);
      setMessage(
        refs.resultStatus,
        'Unable to copy the setup link from this browser.',
        'error',
      );
    });
  });

  refs.copyPassword.addEventListener('click', () => {
    copyPassword().catch(error => {
      console.error('Failed to copy password:', error);
      setMessage(
        refs.resultStatus,
        'Unable to copy the password from this browser.',
        'error',
      );
    });
  });

  refs.downloadQr.addEventListener('click', downloadQrPng);
  refs.generatePdf.addEventListener('click', downloadPdfCard);

  document.addEventListener('keydown', event => {
    const target = event.target;
    const inField =
      target instanceof Element &&
      target.matches('input, textarea, select');

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      refs.ssid.focus();
      refs.ssid.select?.();
      return;
    }

    if (event.key === '/' && !inField && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      refs.ssid.focus();
      refs.ssid.select?.();
      return;
    }

    if (event.key === 'Escape' && inField) {
      target.blur();
    }
  });

  if (refs.shareNetwork && typeof navigator.share === 'function') {
    refs.shareNetwork.hidden = false;
    refs.shareNetwork.addEventListener('click', () => {
      shareNetwork().catch(error => {
        console.error('Share failed:', error);
      });
    });
  }

  if (refs.copyScanLink) {
    refs.copyScanLink.addEventListener('click', () => {
      copyScanLink().catch(error => {
        console.error('Failed to copy scan link:', error);
        setMessage(
          refs.resultStatus,
          'Unable to copy the scan link from this browser.',
          'error',
        );
      });
    });
  }

  if (refs.clearRecent) {
    refs.clearRecent.addEventListener('click', handleClearRecent);
  }

  if (refs.qrCorrectLevel) {
    refs.qrCorrectLevel.addEventListener('change', () => {
      const next = refs.qrCorrectLevel.value;

      if (!VALID_CORRECT_LEVELS.includes(next)) {
        return;
      }

      qrPrefs = { ...qrPrefs, correctLevel: next };
      saveQrPrefs(qrPrefs);
      regenerateIfShown();
    });
  }

  if (refs.qrColorDark) {
    refs.qrColorDark.addEventListener('input', () => {
      const next = refs.qrColorDark.value;

      if (!HEX_COLOR_PATTERN.test(next)) {
        return;
      }

      qrPrefs = { ...qrPrefs, colorDark: next };
      saveQrPrefs(qrPrefs);
      regenerateIfShown();
    });
  }

  if (refs.qrColorLight) {
    refs.qrColorLight.addEventListener('input', () => {
      const next = refs.qrColorLight.value;

      if (!HEX_COLOR_PATTERN.test(next)) {
        return;
      }

      qrPrefs = { ...qrPrefs, colorLight: next };
      saveQrPrefs(qrPrefs);
      regenerateIfShown();
    });
  }

  if (refs.qrColorsReset) {
    refs.qrColorsReset.addEventListener('click', () => {
      qrPrefs = {
        ...qrPrefs,
        colorDark: QR_DEFAULT_PREFS.colorDark,
        colorLight: QR_DEFAULT_PREFS.colorLight,
      };
      saveQrPrefs(qrPrefs);
      applyQrPrefsToControls();
      regenerateIfShown();
    });
  }

  if (refs.pdfTitle) {
    refs.pdfTitle.addEventListener('input', () => {
      pdfState.title = refs.pdfTitle.value;
      persistPdfPrefs();
    });
  }

  if (refs.pdfSubtitle) {
    refs.pdfSubtitle.addEventListener('input', () => {
      pdfState.subtitle = refs.pdfSubtitle.value;
      persistPdfPrefs();
    });
  }

  if (refs.pdfLogo) {
    refs.pdfLogo.addEventListener('change', event => {
      handlePdfLogoChange(event).catch(error => {
        console.error('Failed to handle logo change:', error);
      });
    });
  }

  if (refs.pdfLogoClear) {
    refs.pdfLogoClear.addEventListener('click', clearPdfLogo);
  }

  if (refs.importQr && refs.importQrFile) {
    refs.importQr.addEventListener('click', () => {
      setMessage(refs.importStatus, '');
      refs.importQrFile.click();
    });

    refs.importQrFile.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }
      handleImportQr(file)
        .catch(error => {
          console.error('Import QR failed:', error);
        })
        .finally(() => {
          event.target.value = '';
        });
    });
  }
});
