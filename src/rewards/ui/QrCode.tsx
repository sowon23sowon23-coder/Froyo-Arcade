'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** Renders the QR on the device, so showing it needs no further network after the server says go. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((markup) => live && setSvg(markup))
      .catch(() => live && setSvg(''));
    return () => {
      live = false;
    };
  }, [value]);

  return <div className="rw-qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
