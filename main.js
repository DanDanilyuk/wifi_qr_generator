// Dark mode detection and state persistence
const savedTheme = localStorage.getItem('theme');
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
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

  // 5. PDF Generation Logic
  document.getElementById('generate-pdf').addEventListener('click', () => {
    const security = document.getElementById('security').value;
    const ssid = document.getElementById('ssid').value || 'Network';
    const password = document.getElementById('password').value;
    const hidden = document.getElementById('hidden').checked ? 'Yes' : 'No';

    const canvas = qrcodeContainer.querySelector('canvas');
    if (!canvas) return;

    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    const pageWidth = pdf.internal.pageSize.getWidth();

    pdf.setFontSize(18);
    pdf.text('Wi-Fi Configuration Details', pageWidth / 2, 20, {
      align: 'center',
    });

    pdf.setFontSize(12);
    pdf.text(`SSID: ${ssid}`, pageWidth / 2, 40, { align: 'center' });
    pdf.text(`Security: ${security}`, pageWidth / 2, 50, { align: 'center' });
    pdf.text(`Password: ${password}`, pageWidth / 2, 60, { align: 'center' });
    pdf.text(`Hidden Network: ${hidden}`, pageWidth / 2, 70, {
      align: 'center',
    });

    const imgWidth = 80;
    const imgHeight = 80;
    const imgX = (pageWidth - imgWidth) / 2;
    pdf.addImage(imgData, 'PNG', imgX, 80, imgWidth, imgHeight);

    pdf.text(
      'If scanning fails, use the above details to connect manually.',
      pageWidth / 2,
      170,
      { align: 'center' },
    );

    // Dynamically names the PDF based on the Wi-Fi name
    pdf.save(`${ssid}_WiFi_Details.pdf`);
  });
});
