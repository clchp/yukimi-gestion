import { qrSvg } from './qr-code';

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function fitText(value: string, maximum = 42) {
  const trimmed = value.trim();
  return trimmed.length <= maximum ? trimmed : `${trimmed.slice(0, maximum - 1)}…`;
}

export function productLabelSvg(title: string, subtitle: string, payload: string) {
  const qr = qrSvg(payload, 348);
  const nestedQr = qr.replace('<svg ', '<svg x="66" y="122" preserveAspectRatio="xMidYMid meet" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="620" viewBox="0 0 480 620">
    <rect x="1" y="1" width="478" height="618" rx="24" fill="#fff" stroke="#242124" stroke-width="2"/>
    <text x="240" y="52" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#111">${escapeXml(fitText(title, 34))}</text>
    <text x="240" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#222">${escapeXml(fitText(subtitle, 52))}</text>
    ${nestedQr}
    <rect x="38" y="520" width="404" height="32" rx="8" fill="#f4e9f2"/>
    <text x="240" y="541" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Consolas, monospace" font-size="13" fill="#6f3b68">${escapeXml(fitText(payload, 58))}</text>
    <text x="240" y="586" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#6b626b">Etiqueta de inventario · Yukimi Gestión</text>
  </svg>`;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function downloadProductLabelPng(
  filename: string,
  title: string,
  subtitle: string,
  payload: string,
) {
  const svg = productLabelSvg(title, subtitle, payload);
  const source = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 1240;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('El navegador no pudo preparar la etiqueta.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error('No se pudo generar el archivo PNG.')),
        'image/png',
        1,
      );
    });
    downloadBlob(filename.replace(/\.svg$/i, '.png'), blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function printProductLabel(title: string, subtitle: string, payload: string) {
  const popup = window.open('', '_blank', 'width=620,height=760');
  if (!popup)
    throw new Error(
      'El navegador bloqueó la ventana de impresión. Habilita ventanas emergentes para este sitio.',
    );
  const svg = productLabelSvg(title, subtitle, payload);
  popup.document.write(
    `<!doctype html><html lang="es"><head><title>Etiqueta ${escapeXml(subtitle)}</title><meta charset="utf-8"><style>html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;background:white}body{display:grid;place-items:center;padding:18px;box-sizing:border-box}svg{width:min(100%,480px);height:auto}@media print{body{padding:0}svg{width:100%;max-height:100vh}}</style></head><body>${svg}<script>window.addEventListener('load',()=>window.print())</script></body></html>`,
  );
  popup.document.close();
}
