// Dark mode detection and state persistence
const savedTheme = localStorage.getItem('theme');
const systemPrefersDark = window.matchMedia(
  '(prefers-color-scheme: dark)',
).matches;
if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
  document.documentElement.setAttribute('data-theme', 'dark');
} else {
  document.documentElement.setAttribute('data-theme', 'light');
}

document.addEventListener('DOMContentLoaded', () => {
  // Theme toggle icon logic
  const themeBtn = document.getElementById('theme-toggle');
  const moonIcon = document.getElementById('moon-icon');
  const sunIcon = document.getElementById('sun-icon');

  function updateIcons() {
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
      moonIcon.style.display = 'none';
      sunIcon.style.display = 'block';
    } else {
      moonIcon.style.display = 'block';
      sunIcon.style.display = 'none';
    }
  }

  updateIcons();

  themeBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateIcons();
  });

  // 1. Update command section based on detected OS
  const commandElement = document.getElementById('command');
  const ua = window.navigator.userAgent;
  let os = 'unknown';

  if (ua.indexOf('Win') !== -1) os = 'windows';
  else if (ua.indexOf('Mac') !== -1) os = 'mac';
  else if (ua.indexOf('Linux') !== -1) os = 'linux';

  switch (os) {
    case 'windows':
      commandElement.innerText =
        'powershell -Command "& {Invoke-WebRequest -Uri \'https://dandanilyuk.github.io/wifi_qr_generator/wifi_gen.sh\' -OutFile \\"$env:TEMP\\wifi_gen.sh\\"; bash \\"$env:TEMP\\wifi_gen.sh\\"}"';
      break;
    case 'linux':
      commandElement.innerText =
        'bash <(curl -fsSL https://dandanilyuk.github.io/wifi_qr_generator/wifi_gen.sh)';
      break;
    case 'mac':
    default:
      commandElement.innerText =
        '/bin/bash -c "$(curl -fsSL https://dandanilyuk.github.io/wifi_qr_generator/wifi_gen.sh)"';
      break;
  }

  // 2. Form & URL Parameter Setup
  const urlParams = new URLSearchParams(window.location.search);
  const securityParam = urlParams.get('security');
  const ssidParam = urlParams.get('ssid');
  const passwordParam = urlParams.get('password');
  const hiddenParam = urlParams.get('hidden');

  if (ssidParam) document.getElementById('ssid').value = ssidParam;
  if (securityParam) document.getElementById('security').value = securityParam;
  if (passwordParam) document.getElementById('password').value = passwordParam;
  if (hiddenParam)
    document.getElementById('hidden').checked = hiddenParam === 'true';

  const qrForm = document.getElementById('qr-form');
  const qrcodeContainer = document.getElementById('qrcode');
  const resultCard = document.querySelector('.result-card');

  // Strip old inline styles from previous JS logic
  qrcodeContainer.style.margin = '';
  qrcodeContainer.style.textAlign = '';

  const qrcode = new QRCode(qrcodeContainer, {
    width: 280, // Optimized for mobile screens
    height: 280,
    colorDark: '#000000',
    colorLight: '#ffffff',
  });

  const buildWifiString = (security, ssid, password, hidden) =>
    `WIFI:T:${security};S:${ssid};P:${password};H:${hidden};;`;

  // Helper to show the result card and smoothly scroll to it
  const revealResults = () => {
    resultCard.style.display = 'flex';
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // 3. Logic: Auto-generate from URL vs Manual Input
  if (ssidParam && securityParam) {
    qrForm.style.display = 'none'; // Hide form if populated via URL
    const wifiString = buildWifiString(
      securityParam,
      ssidParam,
      passwordParam || '',
      hiddenParam || 'false',
    );
    qrcode.makeCode(wifiString);
    revealResults();
  } else {
    // Show form (using 'flex' to preserve new CSS layout)
    qrForm.style.display = 'flex';
    resultCard.style.display = 'none'; // Ensure result card starts hidden

    document.getElementById('generate').addEventListener('click', () => {
      const security = document.getElementById('security').value;
      const ssid = document.getElementById('ssid').value;
      const password = document.getElementById('password').value;
      const hidden = document.getElementById('hidden').checked
        ? 'true'
        : 'false';

      if (!ssid) {
        alert('Please provide a Network Name (SSID)');
        return;
      }

      const wifiString = buildWifiString(security, ssid, password, hidden);
      qrcode.makeCode(wifiString);
      revealResults();
    });
  }

  // 4. Copy Command Logic
  document.getElementById('copy-command').addEventListener('click', () => {
    const commandText = commandElement.innerText.trim();
    navigator.clipboard
      .writeText(commandText)
      .then(() => {
        const copyButton = document.getElementById('copy-command');
        copyButton.textContent = 'Copied!';
        setTimeout(() => (copyButton.textContent = 'Copy Command'), 2000);
      })
      .catch(err => console.error('Failed to copy command:', err));
  });

  // 5. Download QR Code Logic
  document.getElementById('download-qr').addEventListener('click', () => {
    const ssid = document.getElementById('ssid').value || 'Network';
    const canvas = qrcodeContainer.querySelector('canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `${ssid}_WiFi_QR.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // 6. PDF Generation Logic
  document.getElementById('generate-pdf').addEventListener('click', () => {
    const ssid = document.getElementById('ssid').value || 'Network';
    const password = document.getElementById('password').value;

    const canvas = qrcodeContainer.querySelector('canvas');
    if (!canvas) return;

    const truncate = (str, max) =>
      str.length > max ? str.slice(0, max - 1) + '…' : str;

    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();

    const lX = 35;
    const rX = W - 35;

    // ── Title ─────────────────────────────────────────────────────────
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(36);
    pdf.setTextColor(15, 15, 15);
    pdf.text('Wi-Fi', W / 2, 34, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.setTextColor(160, 160, 160);
    pdf.text(truncate(ssid, 44), W / 2, 46, { align: 'center' });

    pdf.setDrawColor(220, 220, 220);
    pdf.setLineWidth(0.3);
    pdf.line(lX, 55, rX, 55);

    // ── QR Code ───────────────────────────────────────────────────────
    const qrSize = 120;
    const qrX = (W - qrSize) / 2;
    const qrY = 65;

    pdf.addImage(imgData, 'PNG', qrX, qrY, qrSize, qrSize);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(185, 185, 185);
    pdf.text('Point your camera here to connect', W / 2, qrY + qrSize + 10, {
      align: 'center',
    });

    // ── Divider ───────────────────────────────────────────────────────
    const divY = qrY + qrSize + 20;
    pdf.setDrawColor(220, 220, 220);
    pdf.setLineWidth(0.3);
    pdf.line(lX, divY, rX, divY);

    // ── Network row ───────────────────────────────────────────────────
    const r1Y = divY + 16;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(175, 175, 175);
    pdf.text('NETWORK', lX, r1Y);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(20, 20, 20);
    pdf.text(truncate(ssid, 36), rX, r1Y, { align: 'right' });

    pdf.setDrawColor(235, 235, 235);
    pdf.setLineWidth(0.2);
    pdf.line(lX, r1Y + 6, rX, r1Y + 6);

    // ── Password row ──────────────────────────────────────────────────
    const r2Y = r1Y + 20;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(175, 175, 175);
    pdf.text('PASSWORD', lX, r2Y);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(20, 20, 20);
    pdf.text(password ? truncate(password, 36) : '—', rX, r2Y, {
      align: 'right',
    });

    pdf.save(`${ssid}_WiFi_QR.pdf`);
  });
});
