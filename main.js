// Check if URL parameters are present
const urlParams = new URLSearchParams(window.location.search);
const securityParam = urlParams.get('security');
const ssidParam = urlParams.get('ssid');
const passwordParam = urlParams.get('password');
const hiddenParam = urlParams.get('hidden');

document.addEventListener('DOMContentLoaded', function() {
  if (securityParam && ssidParam && passwordParam) {
    // If parameters are present, hide the form and generate the QR code
    document.getElementById('qr-form').style.display = 'none';

    const wifiString = `WIFI:T:${securityParam};S:${ssidParam};P:${passwordParam};H:${hiddenParam};;`;

    const qrcode = new QRCode(document.getElementById('qrcode'), {
      text: wifiString,
      width: 400,
      height: 400,
    });
  } else {
    // If parameters are not present, show the form
    document.getElementById('qr-form').style.display = 'block';
  }

  document.getElementById('generate').addEventListener('click', function () {
    const security = document.getElementById('security').value;
    const ssid = document.getElementById('ssid').value;
    const password = document.getElementById('password').value;
    const hidden = document.getElementById('hidden').checked ? 'true' : 'false';

    const wifiString = `WIFI:T:${security};S:${ssid};P:${password};H:${hidden};;`;

    const qrcode = new QRCode(document.getElementById('qrcode'), {
      text: wifiString,
      width: 128,
      height: 128,
    });
  });

  document.getElementById('copy-command').addEventListener('click', function () {
    const command = document.getElementById('command');
    const range = document.createRange();
    range.selectNode(command);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
  });
});
