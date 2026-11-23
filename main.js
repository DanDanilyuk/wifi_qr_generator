import {
  SECURITY,
  buildWifiString,
  detectOs,
  drawQr,
  encodeState,
  normalizeSecurity,
  parseWifiString,
  readLinkParams,
  sanitizeFilename,
} from './wifi.js';

const THEME_KEY = 'theme';
const RECENT_KEY = 'wifi-qr:recent-networks';
const RECENT_LIMIT = 5;
const QR_PREFS_KEY = 'wifi-qr:qr-prefs';
const QR_DEFAULTS = {
  correctLevel: 'M',
  colorDark: '#000000',
  colorLight: '#ffffff',
};
const QR_LEVELS = ['L', 'M', 'Q', 'H'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const PDF_PREFS_KEY = 'wifi-qr:pdf-prefs';
const PDF_LOGO_MAX_PERSIST_BYTES = 50 * 1024;
const PDF_DEFAULT_TITLE = 'Wi-Fi access';
const PDF_DEFAULT_SUBTITLE = 'Scan the QR code or enter the details below.';
const PDF_LOGO_HINT = 'PNG, JPEG, or SVG. Resized to about 40mm wide.';
const IMPORT_MAX_SIDE = 1600;

// Every element with an id, keyed by its camelCased id:
// <input id="pdf-title"> is el.pdfTitle.
const el = Object.fromEntries(
  [...document.querySelectorAll('[id]')].map((node) => [
    node.id.replace(/-(\w)/g, (_, letter) => letter.toUpperCase()),
    node,
  ])
);

let current = null; // the network shown in the result card
let hasGenerated = false; // edits re-render live only after the first generate
let qrPrefs = loadQrPrefs();
const pdfLogo = { dataUrl: null, mime: null, size: 0, name: null };

// ---------- Storage ----------
// localStorage throws when storage is blocked (private modes, strict cookie
// settings). The app works without it, so failures are swallowed here.

function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // Not persisted. Nothing else to do.
  }
}

// ---------- Small helpers ----------

// jsPDF and the QR decoder are big and rarely needed, so they load on demand.
const scriptLoads = new Map();

function loadScript(src) {
  if (!scriptLoads.has(src)) {
    scriptLoads.set(
      src,
      new Promise((resolve, reject) => {
        const script = document.createElement('script');

        script.src = src;
        script.onload = resolve;
        script.onerror = () => {
          scriptLoads.delete(src);
          script.remove();
          reject(new Error(`Could not load ${src}.`));
        };
        document.head.append(script);
      })
    );
  }

  return scriptLoads.get(src);
}

function setMessage(element, message = '', state = 'info') {
  element.hidden = !message;
  element.textContent = message;
  element.dataset.state = state;
}

function flash(button, label) {
  const original = button.dataset.label ?? button.textContent;

  button.dataset.label = original;
  button.classList.add('copied');

  if (label) {
    button.textContent = label;
  }

  clearTimeout(button.flashTimer);
  button.flashTimer = setTimeout(() => {
    button.classList.remove('copied');
    button.textContent = original;
  }, 1800);
}

function debounce(fn, ms) {
  let id;

  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard API (older browser, plain http) or permission denied.
  }

  const textarea = document.createElement('textarea');

  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();

  let copied = false;

  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  textarea.remove();

  return copied;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function qrPngBlob() {
  return new Promise((resolve) => el.qr.toBlob(resolve, 'image/png'));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to read the image.'));
    image.src = src;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Read failed.'));
    reader.readAsDataURL(file);
  });
}

// ---------- Theme ----------

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  el.themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
}

// ---------- Form ----------

function formState() {
  return {
    ssid: el.ssid.value.trim(),
    password: el.password.value,
    security: normalizeSecurity(el.security.value),
    hidden: el.hidden.checked,
  };
}

function validate(state) {
  if (!state.ssid) {
    return {
      field: el.ssid,
      message: 'Enter the Wi-Fi network name to generate a QR code.',
    };
  }

  if (SECURITY[state.security].requiresPassword && !state.password) {
    return {
      field: el.password,
      message: 'Enter the Wi-Fi password for this protected network.',
    };
  }

  return null;
}

function clearInvalid() {
  el.ssid.removeAttribute('aria-invalid');
  el.password.removeAttribute('aria-invalid');
}

function showPassword(visible) {
  el.password.type = visible ? 'text' : 'password';
  el.togglePassword.textContent = visible ? 'Hide' : 'Show';
  el.togglePassword.setAttribute(
    'aria-label',
    visible ? 'Hide password' : 'Show password'
  );
}

function syncSecurityUi() {
  const isOpen = normalizeSecurity(el.security.value) === 'nopass';

  el.password.disabled = isOpen;
  el.password.placeholder = isOpen
    ? 'No password needed for open networks'
    : 'Enter password';
  el.togglePassword.hidden = isOpen;
  el.rememberField.hidden = isOpen;
  el.passwordHelp.textContent = isOpen
    ? 'This QR code will connect to an open network without a password.'
    : 'Protected networks need a password to scan and join.';
  el.securityHelp.textContent = isOpen
    ? 'Open networks let guests join immediately after scanning.'
    : 'Choose the same security mode your router uses.';

  if (isOpen) {
    showPassword(false);
    el.rememberPassword.checked = false;
  }
}

function fillForm(state) {
  el.ssid.value = state.ssid || '';
  el.security.value = normalizeSecurity(state.security);
  el.hidden.checked = Boolean(state.hidden);
  el.password.value = state.password || '';
  syncSecurityUi();
}

// ---------- Result ----------

function syncUrl(state) {
  const fragment = state.ssid
    ? `#${encodeState(state, { includePassword: false })}`
    : '';

  // Keeps the address bar shareable and drops any password it arrived with.
  history.replaceState(null, '', `${location.pathname}${fragment}`);
}

function hideResult(message) {
  el.result.hidden = true;
  current = null;
  setMessage(el.formFeedback, message, 'error');
}

function render({ scroll = false, remember = true } = {}) {
  const state = formState();
  const problem = validate(state);

  clearInvalid();
  setMessage(el.resultStatus);

  if (problem) {
    hideResult(problem.message);
    problem.field.setAttribute('aria-invalid', 'true');
    return false;
  }

  try {
    drawQr(el.qr, buildWifiString(state), {
      level: qrPrefs.correctLevel,
      dark: qrPrefs.colorDark,
      light: qrPrefs.colorLight,
    });
  } catch (error) {
    console.error(error);
    hideResult('Those details are too long to fit in a QR code.');
    return false;
  }

  const isOpen = state.security === 'nopass';

  el.qr.setAttribute('aria-label', `Wi-Fi QR code for ${state.ssid}`);
  el.resultSsid.textContent = state.ssid;
  el.resultSecurity.textContent = SECURITY[state.security].label;
  el.resultHiddenRow.hidden = !state.hidden;
  el.resultPassword.textContent = isOpen ? 'No password' : state.password;
  el.copyPassword.hidden = isOpen;
  el.result.hidden = false;

  current = state;
  hasGenerated = true;
  setMessage(el.formFeedback);
  syncUrl(state);
  updateQrWarning();

  if (remember) {
    saveRecent(state, el.rememberPassword.checked);
    renderRecent();
  }

  if (scroll) {
    el.result.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'nearest',
    });
  }

  return true;
}

// ---------- Recent networks ----------

function loadRecent() {
  const stored = readStored(RECENT_KEY);

  if (!Array.isArray(stored)) {
    return [];
  }

  return stored
    .filter((entry) => entry && typeof entry.ssid === 'string' && entry.ssid)
    .slice(0, RECENT_LIMIT)
    .map((entry) => ({
      ssid: entry.ssid,
      security: normalizeSecurity(entry.security),
      hidden: Boolean(entry.hidden),
      password: typeof entry.password === 'string' ? entry.password : '',
    }));
}

function saveRecent(state, rememberPassword) {
  const entry = {
    ssid: state.ssid,
    security: state.security,
    hidden: state.hidden,
    password:
      rememberPassword && state.security !== 'nopass' ? state.password : '',
  };
  const others = loadRecent().filter(
    (item) => item.ssid !== entry.ssid || item.security !== entry.security
  );

  writeStored(RECENT_KEY, [entry, ...others].slice(0, RECENT_LIMIT));
}

function renderRecent() {
  const entries = loadRecent();

  el.recent.hidden = entries.length === 0;
  el.recentList.replaceChildren(
    ...entries.map((entry) => {
      const item = document.createElement('li');
      const pill = document.createElement('button');
      const name = document.createElement('span');
      const badge = document.createElement('small');

      name.textContent = entry.ssid;
      pill.type = 'button';
      pill.setAttribute(
        'aria-label',
        `Use ${entry.ssid} (${SECURITY[entry.security].label})`
      );

      if (entry.password) {
        badge.textContent = 'saved';
        badge.className = 'saved';
      } else {
        badge.textContent =
          entry.security === 'nopass' ? 'open' : entry.security;
      }

      pill.append(name, badge);
      pill.addEventListener('click', () => {
        fillForm(entry);
        el.rememberPassword.checked = Boolean(entry.password);
        render({ scroll: true });
      });
      item.append(pill);

      return item;
    })
  );
}

// ---------- QR appearance ----------

function loadQrPrefs() {
  const stored = readStored(QR_PREFS_KEY) ?? {};

  return {
    correctLevel: QR_LEVELS.includes(stored.correctLevel)
      ? stored.correctLevel
      : QR_DEFAULTS.correctLevel,
    colorDark: HEX_COLOR.test(stored.colorDark)
      ? stored.colorDark
      : QR_DEFAULTS.colorDark,
    colorLight: HEX_COLOR.test(stored.colorLight)
      ? stored.colorLight
      : QR_DEFAULTS.colorLight,
  };
}

function setQrPrefs(changes) {
  qrPrefs = { ...qrPrefs, ...changes };
  writeStored(QR_PREFS_KEY, qrPrefs);
  el.qrLevel.value = qrPrefs.correctLevel;
  el.qrDark.value = qrPrefs.colorDark;
  el.qrLight.value = qrPrefs.colorLight;

  if (current) {
    render({ remember: false });
  } else {
    updateQrWarning();
  }
}

// WCAG relative luminance of a #rrggbb color.
function luminance(hex) {
  const channel = (offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;

    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function updateQrWarning() {
  const dark = luminance(qrPrefs.colorDark);
  const light = luminance(qrPrefs.colorLight);
  const ratio = (Math.max(dark, light) + 0.05) / (Math.min(dark, light) + 0.05);

  if (ratio < 3) {
    setMessage(
      el.qrWarning,
      `Low contrast (${ratio.toFixed(2)}:1). Cameras may struggle to scan; aim for 3:1 or higher.`,
      'error'
    );
  } else if (dark > light) {
    setMessage(
      el.qrWarning,
      'Light-on-dark codes fail on some phone cameras. A dark foreground on a light background is safest.',
      'error'
    );
  } else {
    setMessage(el.qrWarning);
  }
}

// ---------- Copy, download, share ----------

async function copyLink(button, page, name) {
  // Re-render first so the link matches what is in the form right now.
  if (!render({ remember: false })) {
    return;
  }

  const url = new URL(page, location.href);

  url.search = '';
  url.hash = encodeState(current);

  const copied = await copyText(url.href);
  const warning =
    current.security === 'nopass' ? '' : ' It includes the Wi-Fi password.';

  setMessage(
    el.resultStatus,
    copied
      ? `${name} link copied.${warning}`
      : `Unable to copy the ${name.toLowerCase()} link from this browser.`,
    copied ? 'success' : 'error'
  );

  if (copied) {
    flash(button);
  }
}

async function copyPassword() {
  if (!current || current.security === 'nopass') {
    return;
  }

  const copied = await copyText(current.password);

  setMessage(
    el.resultStatus,
    copied
      ? 'Password copied.'
      : 'Unable to copy the password from this browser.',
    copied ? 'success' : 'error'
  );

  if (copied) {
    flash(el.copyPassword, 'Copied');
  }
}

async function copyCommand() {
  const command = el.terminal.querySelector('pre:not([hidden])');

  if (await copyText(command.textContent.trim())) {
    flash(el.copyCommand, 'Copied');
  }
}

async function downloadPng() {
  if (!current) {
    return;
  }

  const blob = await qrPngBlob();

  if (blob) {
    downloadBlob(blob, `${sanitizeFilename(current.ssid)}_WiFi_QR.png`);
  }
}

async function share() {
  if (!current) {
    return;
  }

  const data = {
    title: `Wi-Fi: ${current.ssid}`,
    text: 'Tap to join the Wi-Fi network.',
    url: new URL(`#${encodeState(current)}`, location.href).href,
  };
  const blob = await qrPngBlob();
  const file =
    blob &&
    new File([blob], `${sanitizeFilename(current.ssid)}_WiFi_QR.png`, {
      type: 'image/png',
    });
  // Not every system can share files, so fall back to sharing the link alone.
  const attempts =
    file && navigator.canShare?.({ files: [file] })
      ? [{ ...data, files: [file] }, data]
      : [data];

  for (const attempt of attempts) {
    try {
      await navigator.share(attempt);
      setMessage(el.resultStatus, 'Shared.', 'success');
      return;
    } catch (error) {
      if (error?.name === 'AbortError') {
        return;
      }

      console.error('Share failed:', error);
    }
  }

  setMessage(el.resultStatus, 'Unable to share from this browser.', 'error');
}

// ---------- PDF card ----------

// jsPDF's built-in fonts only cover Western European letters. Text with
// anything else (emoji, Cyrillic, Chinese...) is drawn by the browser, which
// has fonts for all of it, and placed in the PDF as a picture.
const PDF_FONT_CAN_DRAW = /^[\x20-\x7E\xA0-\xFF]*$/;

function pdfText(pdf, text, x, y, options) {
  const { size, color, bold = false, align = 'left', maxWidth } = options;

  if (PDF_FONT_CAN_DRAW.test(text)) {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    pdf.text(text, x, y, { align });
    return;
  }

  const px = 64; // drawn large so it stays sharp when printed
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = `${bold ? 'bold' : 'normal'} ${px}px system-ui, sans-serif`;

  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 8;
  canvas.height = Math.ceil(px * 1.4);
  ctx.font = font; // resizing a canvas resets its settings
  ctx.fillStyle = `rgb(${color.join(',')})`;
  ctx.fillText(text, 4, px);

  const em = size * 0.3528; // points to millimetres
  let height = em * 1.4;
  let width = (canvas.width / canvas.height) * height;

  if (maxWidth && width > maxWidth) {
    height *= maxWidth / width;
    width = maxWidth;
  }

  const left = { left: x, center: x - width / 2, right: x - width }[align];

  // The text baseline sits one em below the top of the picture.
  pdf.addImage(
    canvas.toDataURL('image/png'),
    'PNG',
    left,
    y - height / 1.4,
    width,
    height
  );
}

function buildPdf(jsPDF, state) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const centerX = pageWidth / 2;
  const cardX = 18;
  const cardY = 18;
  const cardWidth = pageWidth - 36;
  const leftX = cardX + 12;
  const rightX = cardX + cardWidth - 12;
  const qrSize = 88;
  const rowStartY = 166;
  const lineHeight = 5.2;
  const rowGap = 6;
  const maxValueWidth = cardWidth - 24 - 24;
  const maxPasswordLines = 3;
  const isOpen = state.security === 'nopass';

  pdf.setFont('helvetica', 'bold');

  const wrap = (text, size) => {
    pdf.setFontSize(size);
    return pdf.splitTextToSize(text, maxValueWidth);
  };

  const rows = [
    ['NETWORK', state.ssid],
    ['PASSWORD', isOpen ? 'Open network' : state.password],
    ['SECURITY', SECURITY[state.security].label],
    ['HIDDEN', state.hidden ? 'Yes' : 'No'],
  ].map(([label, value]) => {
    let fontSize = 12;
    // Text drawn as a picture is scaled to fit on one line instead of wrapped.
    let lines = PDF_FONT_CAN_DRAW.test(value) ? wrap(value, fontSize) : [value];

    if (label === 'PASSWORD' && !isOpen) {
      // A long password shrinks first, then is cut off at three lines.
      for (const smaller of [10, 9]) {
        if (lines.length > maxPasswordLines) {
          fontSize = smaller;
          lines = wrap(value, fontSize);
        }
      }

      if (lines.length > maxPasswordLines) {
        lines = lines.slice(0, maxPasswordLines);
        lines.push(`${lines.pop().trimEnd().slice(0, -1)}…`);
      }
    }

    return {
      label,
      lines,
      fontSize,
      height: Math.max(1, lines.length) * lineHeight + rowGap,
    };
  });

  const rowsHeight = rows.reduce((sum, row) => sum + row.height, 0);
  const cardHeight = Math.max(220, rowStartY - cardY + rowsHeight + 6);

  pdf.setFillColor(253, 252, 249);
  pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 8, 8, 'F');
  pdf.setDrawColor(226, 221, 212);
  pdf.setLineWidth(0.5);
  pdf.roundedRect(cardX, cardY, cardWidth, cardHeight, 8, 8);

  let titleY = 34;

  if (pdfLogo.dataUrl) {
    try {
      const props = pdf.getImageProperties(pdfLogo.dataUrl);
      const scale = Math.min(40 / props.width, 18 / props.height);
      const width = props.width * scale;
      const height = props.height * scale;
      const isJpeg = /jpe?g/i.test(
        pdfLogo.mime || pdfLogo.dataUrl.slice(0, 20)
      );

      pdf.addImage(
        pdfLogo.dataUrl,
        isJpeg ? 'JPEG' : 'PNG',
        centerX - width / 2,
        22,
        width,
        height
      );
      titleY = 22 + height + 8;
    } catch (error) {
      console.warn('Failed to embed logo in PDF:', error);
    }
  }

  pdfText(pdf, el.pdfTitle.value.trim() || PDF_DEFAULT_TITLE, centerX, titleY, {
    size: 24,
    bold: true,
    color: [26, 23, 21],
    align: 'center',
    maxWidth: cardWidth - 24,
  });
  pdfText(
    pdf,
    el.pdfSubtitle.value.trim() || PDF_DEFAULT_SUBTITLE,
    centerX,
    titleY + 8,
    {
      size: 11,
      color: [140, 133, 124],
      align: 'center',
      maxWidth: cardWidth - 24,
    }
  );

  pdf.addImage(
    el.qr.toDataURL('image/png'),
    'PNG',
    centerX - qrSize / 2,
    54,
    qrSize,
    qrSize
  );
  pdfText(
    pdf,
    'Point your phone camera at the code to connect.',
    centerX,
    149,
    {
      size: 8,
      color: [160, 160, 160],
      align: 'center',
    }
  );

  let y = rowStartY;

  rows.forEach((row, index) => {
    if (index > 0) {
      pdf.setDrawColor(235, 235, 235);
      pdf.setLineWidth(0.3);
      pdf.line(leftX, y - 4, rightX, y - 4);
    }

    pdfText(pdf, row.label, leftX, y, { size: 8, color: [150, 150, 150] });
    row.lines.forEach((line, lineIndex) => {
      pdfText(pdf, line, rightX, y + lineIndex * lineHeight, {
        size: row.fontSize,
        bold: true,
        color: [20, 20, 20],
        align: 'right',
        maxWidth: maxValueWidth,
      });
    });

    y += row.height;
  });

  return pdf;
}

async function downloadPdf() {
  if (!current) {
    return;
  }

  el.downloadPdf.disabled = true;
  el.downloadPdf.setAttribute('aria-busy', 'true');
  el.downloadPdf.textContent = 'Generating...';

  try {
    await loadScript('vendor/jspdf.umd.min.js');
    buildPdf(window.jspdf.jsPDF, current).save(
      `${sanitizeFilename(current.ssid)}_WiFi_QR.pdf`
    );
  } catch (error) {
    console.error('PDF generation failed:', error);
    setMessage(el.resultStatus, 'PDF generation failed.', 'error');
  } finally {
    el.downloadPdf.disabled = false;
    el.downloadPdf.removeAttribute('aria-busy');
    el.downloadPdf.textContent = 'Download PDF';
  }
}

function savePdfPrefs() {
  const prefs = { title: el.pdfTitle.value, subtitle: el.pdfSubtitle.value };

  if (pdfLogo.dataUrl && pdfLogo.size <= PDF_LOGO_MAX_PERSIST_BYTES) {
    prefs.logo = { ...pdfLogo };
  }

  writeStored(PDF_PREFS_KEY, prefs);
}

function setPdfLogo(logo) {
  Object.assign(
    pdfLogo,
    logo ?? { dataUrl: null, mime: null, size: 0, name: null }
  );
  el.pdfLogoClear.hidden = !pdfLogo.dataUrl;
  el.pdfLogoStatus.textContent = pdfLogo.dataUrl
    ? `${pdfLogo.name || 'Logo loaded'} (${(pdfLogo.size / 1024).toFixed(1)} KB)`
    : PDF_LOGO_HINT;
}

async function choosePdfLogo(file) {
  try {
    let dataUrl = await readFileAsDataUrl(file);
    let mime = file.type || 'image/png';
    let size = file.size;

    if (mime.includes('svg')) {
      // jsPDF cannot embed SVG, so draw it onto a canvas and keep the PNG.
      const image = await loadImage(dataUrl);
      const canvas = document.createElement('canvas');

      canvas.width = 320;
      canvas.height = 320;
      canvas.getContext('2d').drawImage(image, 0, 0, 320, 320);
      dataUrl = canvas.toDataURL('image/png');
      mime = 'image/png';
      size = Math.ceil((dataUrl.length * 3) / 4);
    }

    setPdfLogo({ dataUrl, mime, size, name: file.name || null });
    savePdfPrefs();
  } catch (error) {
    console.error('Failed to read logo image:', error);
    el.pdfLogoStatus.textContent =
      'Unable to read that image. Try another file.';
  }
}

function loadPdfPrefs() {
  const prefs = readStored(PDF_PREFS_KEY) ?? {};

  el.pdfTitle.value = typeof prefs.title === 'string' ? prefs.title : '';
  el.pdfSubtitle.value =
    typeof prefs.subtitle === 'string' ? prefs.subtitle : '';
  setPdfLogo(
    typeof prefs.logo?.dataUrl === 'string'
      ? {
          dataUrl: prefs.logo.dataUrl,
          mime: prefs.logo.mime || 'image/png',
          size: prefs.logo.size || 0,
          name: prefs.logo.name || null,
        }
      : null
  );
}

// ---------- Import a QR code from an image ----------

async function decodeQrImage(file) {
  const url = URL.createObjectURL(file);
  let image;

  try {
    image = await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  // Phone photos are huge. Shrinking them keeps decoding fast everywhere.
  const scale = Math.min(
    1,
    IMPORT_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // The built-in detector only exists on some systems; jsQR works on all.
  if ('BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const codes = await detector.detect(canvas);

      if (codes.length) {
        return codes[0].rawValue;
      }
    } catch {
      // Fall through to jsQR.
    }
  }

  await loadScript('vendor/jsQR.js');

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return window.jsQR(pixels.data, pixels.width, pixels.height)?.data ?? null;
}

async function importQr(file) {
  setMessage(el.importStatus, 'Decoding QR code...');

  try {
    const raw = await decodeQrImage(file);
    const parsed = raw && parseWifiString(raw);

    if (!raw) {
      setMessage(
        el.importStatus,
        'No QR code found in that image. Try a sharper photo.',
        'error'
      );
    } else if (!parsed) {
      setMessage(
        el.importStatus,
        'That QR code is not a Wi-Fi credential.',
        'error'
      );
    } else {
      fillForm(parsed);

      // If the code had no password, render() explains that in the form.
      if (render({ scroll: true })) {
        setMessage(
          el.importStatus,
          'Imported network details from the QR image.',
          'success'
        );
      } else {
        setMessage(el.importStatus);
      }
    }
  } catch (error) {
    console.error('Failed to import QR image:', error);
    setMessage(
      el.importStatus,
      `Could not decode the image. ${error?.message ?? ''}`.trim(),
      'error'
    );
  }
}

// ---------- Terminal command ----------

function showCommandFor(os) {
  el.terminal.querySelectorAll('[data-os]').forEach((node) => {
    node.hidden = node.dataset.os !== os;
  });
}

function setUpTerminal() {
  const os = detectOs();

  // The helper script needs a desktop shell, so phones don't see this section.
  if (os === 'ios' || os === 'android') {
    el.terminal.hidden = true;
    return;
  }

  const choice = os === 'unknown' ? 'linux' : os;

  el.terminal.querySelector(`input[name="os"][value="${choice}"]`).checked =
    true;
  showCommandFor(choice);
  el.terminal.addEventListener('change', (event) => {
    if (event.target.name === 'os') {
      showCommandFor(event.target.value);
    }
  });
}

// ---------- Start-up ----------

function applyLinkParams() {
  const params = readLinkParams(location);
  const hasDetails = ['ssid', 'security', 'password', 'hidden'].some((key) =>
    params.has(key)
  );

  if (!hasDetails) {
    return;
  }

  fillForm({
    ssid: params.get('ssid'),
    security: params.get('security'),
    password: params.get('password'),
    hidden: params.get('hidden') === 'true',
  });

  const state = formState();

  syncUrl(state);

  if (!validate(state)) {
    render({ remember: false });
  }
}

const liveRender = debounce(() => render({ remember: false }), 150);

function onFormChange() {
  syncSecurityUi();

  if (hasGenerated) {
    liveRender();
  } else if (!el.formFeedback.hidden && !validate(formState())) {
    setMessage(el.formFeedback);
    clearInvalid();
  }
}

setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
setUpTerminal();
setQrPrefs({});
syncSecurityUi();
renderRecent();
loadPdfPrefs();
applyLinkParams();

el.themeToggle.addEventListener('click', () => {
  const next =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';

  setTheme(next);

  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
});

el.togglePassword.addEventListener('click', () => {
  showPassword(el.password.type === 'password');
});

el.qrForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (!render({ scroll: true })) {
    validate(formState())?.field.focus();
  }
});

el.ssid.addEventListener('input', onFormChange);
el.password.addEventListener('input', onFormChange);
el.security.addEventListener('change', onFormChange);
el.hidden.addEventListener('change', onFormChange);

el.clearRecent.addEventListener('click', () => {
  writeStored(RECENT_KEY, null);
  renderRecent();
});

el.copyLink.addEventListener('click', () =>
  copyLink(el.copyLink, location.pathname, 'Setup')
);
el.copyScanLink.addEventListener('click', () =>
  copyLink(el.copyScanLink, 'scan.html', 'Scan-only')
);
el.copyPassword.addEventListener('click', copyPassword);
el.copyCommand.addEventListener('click', copyCommand);
el.downloadQr.addEventListener('click', downloadPng);
el.downloadPdf.addEventListener('click', downloadPdf);

if (typeof navigator.share === 'function') {
  el.share.hidden = false;
  el.share.addEventListener('click', share);
}

el.qrLevel.addEventListener('change', () => {
  if (QR_LEVELS.includes(el.qrLevel.value)) {
    setQrPrefs({ correctLevel: el.qrLevel.value });
  }
});
el.qrDark.addEventListener('input', () => {
  if (HEX_COLOR.test(el.qrDark.value)) {
    setQrPrefs({ colorDark: el.qrDark.value });
  }
});
el.qrLight.addEventListener('input', () => {
  if (HEX_COLOR.test(el.qrLight.value)) {
    setQrPrefs({ colorLight: el.qrLight.value });
  }
});
el.qrReset.addEventListener('click', () => {
  setQrPrefs({
    colorDark: QR_DEFAULTS.colorDark,
    colorLight: QR_DEFAULTS.colorLight,
  });
});

el.pdfTitle.addEventListener('input', savePdfPrefs);
el.pdfSubtitle.addEventListener('input', savePdfPrefs);
el.pdfLogo.addEventListener('change', () => {
  if (el.pdfLogo.files[0]) {
    choosePdfLogo(el.pdfLogo.files[0]);
  }
});
el.pdfLogoClear.addEventListener('click', () => {
  el.pdfLogo.value = '';
  setPdfLogo(null);
  savePdfPrefs();
});

el.importQr.addEventListener('click', () => {
  setMessage(el.importStatus);
  el.importFile.click();
});
el.importFile.addEventListener('change', async () => {
  const file = el.importFile.files[0];

  if (file) {
    await importQr(file);
    el.importFile.value = '';
  }
});

document.addEventListener('keydown', (event) => {
  const inField =
    event.target instanceof Element &&
    event.target.matches('input, textarea, select');
  const modifier = event.metaKey || event.ctrlKey;

  if (
    (modifier && event.key.toLowerCase() === 'k') ||
    (event.key === '/' && !inField && !modifier && !event.altKey)
  ) {
    event.preventDefault();
    el.ssid.focus();
    el.ssid.select();
  } else if (event.key === 'Escape' && inField) {
    event.target.blur();
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
