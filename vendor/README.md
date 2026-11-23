# Vendored libraries

These ship with the site instead of loading from a CDN, so the app makes no
third-party requests, works offline, and keeps working if a CDN is blocked or
drops a file. They are unmodified copies; do not edit them.

| File | Library | Version | License | Source |
| --- | --- | --- | --- | --- |
| `qrcode-generator.js` | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | 2.0.4 | MIT | npm `qrcode-generator@2.0.4`, `dist/qrcode.mjs` |
| `jsQR.js` | [jsQR](https://github.com/cozmo/jsQR) | 1.4.0 | Apache-2.0 | npm `jsqr@1.4.0`, `dist/jsQR.js` |
| `jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | MIT | cdnjs `jspdf/2.5.1/jspdf.umd.min.js` |

`jsQR.LICENSE` is the Apache-2.0 license text that jsQR requires to travel with
it. The other two carry their license notice at the top of the file.

## Checking or updating a copy

```bash
shasum -a 384 vendor/*.js
```

| File | SHA-384 |
| --- | --- |
| `qrcode-generator.js` | `c47b6c6538b470e8538a16b8925a060d44797b903c8b190ab05d4c9a9aaaded903a4086403860e2880ee6bf4dcd0471d` |
| `jsQR.js` | `6f961ae01ab7a82cb3dfd9b621287ee03c6300896375e1702bf06c5cbba3f60ba068dc00723fe26b5e5fc4d64bf4d971` |
| `jspdf.umd.min.js` | `25c9ec8d43cfca59dad6cd5fbe2d6ed765f9aa363938be7a8b24a1ef915db6bc213bf4965e0323a15a9c2b220858e2e4` |

To update one, replace the file with the new release, update both tables, fix
the path in `ASSETS` in `service-worker.js` if the name changed, and run
`npm test`.
