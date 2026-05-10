const THEME_KEY = 'theme';
const THEME_ATTRIBUTE = 'data-theme';
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

document.addEventListener('DOMContentLoaded', () => {
  const refs = {
    command: document.getElementById('command'),
    copyCommand: document.getElementById('copy-command'),
    copyLink: document.getElementById('copy-link'),
    copyPassword: document.getElementById('copy-password'),
    downloadQr: document.getElementById('download-qr'),
    eyeIcon: document.getElementById('eye-icon'),
    eyeOffIcon: document.getElementById('eye-off-icon'),
    formFeedback: document.getElementById('form-feedback'),
    generatePdf: document.getElementById('generate-pdf'),
    hidden: document.getElementById('hidden'),
    moonIcon: document.getElementById('moon-icon'),
    password: document.getElementById('password'),
    passwordHelp: document.getElementById('password-help'),
    qrcodeContainer: document.getElementById('qrcode'),
    qrForm: document.getElementById('qr-form'),
    resultCard: document.querySelector('.result-card'),
    resultHidden: document.getElementById('result-hidden'),
    resultPassword: document.getElementById('result-password'),
    resultSecurity: document.getElementById('result-security'),
    resultSsid: document.getElementById('result-ssid'),
    resultStatus: document.getElementById('result-status'),
    security: document.getElementById('security'),
    securityHelp: document.getElementById('security-help'),
    ssid: document.getElementById('ssid'),
    sunIcon: document.getElementById('sun-icon'),
    themeBtn: document.getElementById('theme-toggle'),
    togglePassword: document.getElementById('toggle-password'),
  };

  let hasGenerated = false;
  let currentResultState = null;

  const qrcode = new QRCode(refs.qrcodeContainer, {
    width: 320,
    height: 320,
    colorDark: '#000000',
    colorLight: '#ffffff',
  });

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
  }

  function updateResultCard(state) {
    refs.resultSsid.textContent = state.ssid;
    refs.resultSecurity.textContent = getSecurityMeta(state.security).label;
    refs.resultHidden.textContent = state.hidden ? 'Yes' : 'No';
    refs.resultPassword.textContent =
      normalizeSecurity(state.security) === 'nopass'
        ? 'No password'
        : state.password;
    refs.copyPassword.hidden = normalizeSecurity(state.security) === 'nopass';
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

  function renderResult({ scrollIntoView = false } = {}) {
    const state = getFormState();
    const validation = validateState(state);

    if (!validation.valid) {
      hideResults();
      setMessage(refs.resultStatus, '');
      setMessage(refs.formFeedback, validation.message, 'error');
      return false;
    }

    qrcode.makeCode(buildWifiString(state));
    updateResultCard(state);
    syncVisibleUrl(state);
    revealResults({ scrollIntoView });

    currentResultState = state;
    hasGenerated = true;
    setMessage(refs.formFeedback, '');
    setMessage(refs.resultStatus, '');

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

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(24);
      pdf.setTextColor(26, 23, 21);
      pdf.text('Wi-Fi access', pageWidth / 2, 34, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(140, 133, 124);
      pdf.text(
        'Scan the QR code or enter the details below.',
        pageWidth / 2,
        42,
        { align: 'center' },
      );

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

  async function copySetupLink() {
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

  function handleFormChange() {
    updatePasswordFieldState();

    if (hasGenerated) {
      renderResult();
      setMessage(refs.resultStatus, '');
      return;
    }

    if (!refs.formFeedback.hidden) {
      const validation = validateState(getFormState());

      if (validation.valid) {
        setMessage(refs.formFeedback, '');
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
      renderResult();
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
});
