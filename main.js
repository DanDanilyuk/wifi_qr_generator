document.addEventListener('DOMContentLoaded', () => {
  // Get URL parameters for form pre-fill.
  const urlParams = new URLSearchParams(window.location.search);
  const securityParam = urlParams.get('security');
  const ssidParam = urlParams.get('ssid');
  const passwordParam = urlParams.get('password');
  const hiddenParam = urlParams.get('hidden');

  // Prefill fields if parameters are present.
  if (ssidParam) document.getElementById('ssid').value = ssidParam;
  if (securityParam) document.getElementById('security').value = securityParam;
  if (passwordParam) document.getElementById('password').value = passwordParam;
  if (hiddenParam) {
    document.getElementById('hidden').checked = hiddenParam === 'true';
  }

  const qrForm = document.getElementById('qr-form');
  const qrcodeContainer = document.getElementById('qrcode');

  // Center the QR code container via inline style
  qrcodeContainer.style.margin = '2rem auto';
  qrcodeContainer.style.textAlign = 'center';

  // Initialize the QRCode instance.
  const qrcode = new QRCode(qrcodeContainer, {
    width: 400,
    height: 400,
    colorDark: '#000000',
    colorLight: '#ffffff',
  });

  // Helper: Build the Wi-Fi string.
  const buildWifiString = (security, ssid, password, hidden) =>
    `WIFI:T:${security};S:${ssid};P:${password};H:${hidden};;`;

  // Generate QR code from URL parameters or when form is submitted.
  if (ssidParam && securityParam) {
    // Auto-generation using URL params.
    qrForm.style.display = 'none';
    const wifiString = buildWifiString(
      securityParam,
      ssidParam,
      passwordParam,
      hiddenParam
    );
    qrcode.makeCode(wifiString);
  } else {
    qrForm.style.display = 'block';
    document.getElementById('generate').addEventListener('click', () => {
      const security = document.getElementById('security').value;
      const ssid = document.getElementById('ssid').value;
      const password = document.getElementById('password').value;
      const hidden = document.getElementById('hidden').checked
        ? 'true'
        : 'false';
      const wifiString = buildWifiString(security, ssid, password, hidden);
      qrcode.makeCode(wifiString);
    });
  }

  // Copy command button functionality.
  document.getElementById('copy-command').addEventListener('click', () => {
    const commandText = document.getElementById('command').innerText.trim();
    navigator.clipboard
      .writeText(commandText)
      .then(() => {
        const copyButton = document.getElementById('copy-command');
        copyButton.textContent = 'Copied!';
        setTimeout(() => (copyButton.textContent = 'Copy Command'), 2000);
      })
      .catch(err => console.error('Failed to copy command:', err));
  });

  // Generate Full-Page PDF with Wi‑Fi details & QR code.
  document.getElementById('generate-pdf').addEventListener('click', () => {
    // Get current form values.
    const security = document.getElementById('security').value;
    const ssid = document.getElementById('ssid').value;
    const password = document.getElementById('password').value;
    const hidden = document.getElementById('hidden').checked ? 'Yes' : 'No';

    // Get the rendered canvas.
    const canvas = qrcodeContainer.querySelector('canvas');
    if (!canvas) {
      alert('Please generate the QR code first.');
      return;
    }
    const imgData = canvas.toDataURL('image/png');

    // Create a new PDF document.
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    const pageWidth = pdf.internal.pageSize.getWidth();

    // Add title.
    pdf.setFontSize(18);
    pdf.text('Wi-Fi Configuration Details', pageWidth / 2, 20, {
      align: 'center',
    });

    // Add Wi-Fi details in selectable text.
    pdf.setFontSize(12);
    pdf.text(`SSID: ${ssid}`, pageWidth / 2, 40, { align: 'center' });
    pdf.text(`Security: ${security}`, pageWidth / 2, 50, { align: 'center' });
    pdf.text(`Password: ${password}`, pageWidth / 2, 60, { align: 'center' });
    pdf.text(`Hidden Network: ${hidden}`, pageWidth / 2, 70, {
      align: 'center',
    });

    // Add the QR Code image.
    const imgWidth = 80;
    const imgHeight = 80;
    const imgX = (pageWidth - imgWidth) / 2;
    pdf.addImage(imgData, 'PNG', imgX, 80, imgWidth, imgHeight);

    pdf.text(
      'If scanning fails, use the above details to connect manually.',
      pageWidth / 2,
      170,
      { align: 'center' }
    );

    // Save the PDF.
    pdf.save('WiFi_Details.pdf');
  });
});
