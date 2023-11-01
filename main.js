const urlParams = new URLSearchParams(window.location.search);
const securityParam = urlParams.get('security');
const ssidParam = urlParams.get('ssid');
const passwordParam = urlParams.get('password');
const hiddenParam = urlParams.get('hidden');

document.addEventListener('DOMContentLoaded', () => {
  const qrForm = document.getElementById('qr-form');
  const qrcode = new QRCode(document.getElementById('qrcode'), {
    width: 400,
    height: 400,
  });

  if (securityParam && ssidParam && passwordParam) {
    qrForm.style.display = 'none';
    const wifiString = `WIFI:T:${securityParam};S:${ssidParam};P:${passwordParam};H:${hiddenParam};;`;
    qrcode.makeCode(wifiString);
  } else {
    qrForm.style.display = 'block';
    document.getElementById('generate').addEventListener('click', () => {
      const security = document.getElementById('security').value;
      const ssid = document.getElementById('ssid').value;
      const password = document.getElementById('password').value;
      const hidden = document.getElementById('hidden').checked ? 'true' : 'false';
      const wifiString = `WIFI:T:${security};S:${ssid};P:${password};H:${hidden};;`;
      qrcode.makeCode(wifiString);
    });
  }

  document.getElementById('copy-command').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('command').innerText);
  });
});
