/**
 * Base64 + UTF-8 sin dependencias ni polyfills.
 *
 * ble-plx entrega cada notificación como base64. El protocolo v1.1 era ASCII,
 * pero las frases necesitan tildes, '¿', '¡' y 'ñ', que son multibyte. Decodificar
 * byte a byte con String.fromCharCode produce "DÃ\u008dAS"; por eso se acumulan
 * bytes y se decodifica UTF-8 recién al completar la línea.
 */

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodifica el base64 de ble-plx a bytes. Ignora '=' y saltos de línea. */
export function decodeBase64ABytes(b64: string): Uint8Array {
  const limpio = b64.replace(/=+$/, '').replace(/[\r\n]/g, '');
  const salida: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const c of limpio) {
    const idx = BASE64.indexOf(c);
    if (idx === -1) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      salida.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(salida);
}

/** Decodifica UTF-8 a mano (2, 3 y 4 bytes) sin TextDecoder. */
export function decodeUtf8(bytes: Uint8Array): string {
  let salida = '';
  let i = 0;

  while (i < bytes.length) {
    const b0 = bytes[i];
    i += 1;

    if (b0 < 0x80) {
      salida += String.fromCharCode(b0);
      continue;
    }

    if (b0 >= 0xc2 && b0 <= 0xdf) {
      if (i >= bytes.length) {
        salida += '\uFFFD';
        break;
      }
      const b1 = bytes[i];
      i += 1;
      if ((b1 & 0xc0) === 0x80) {
        salida += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
      } else {
        salida += '\uFFFD';
      }
      continue;
    }

    if (b0 >= 0xe0 && b0 <= 0xef) {
      if (i + 1 >= bytes.length) {
        salida += '\uFFFD';
        break;
      }
      const b1 = bytes[i];
      const b2 = bytes[i + 1];
      i += 2;
      if ((b1 & 0xc0) === 0x80 && (b2 & 0xc0) === 0x80) {
        const cp = ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f);
        salida += String.fromCharCode(cp);
      } else {
        salida += '\uFFFD';
      }
      continue;
    }

    if (b0 >= 0xf0 && b0 <= 0xf4) {
      if (i + 2 >= bytes.length) {
        salida += '\uFFFD';
        break;
      }
      const b1 = bytes[i];
      const b2 = bytes[i + 1];
      const b3 = bytes[i + 2];
      i += 3;
      if (
        (b1 & 0xc0) === 0x80 &&
        (b2 & 0xc0) === 0x80 &&
        (b3 & 0xc0) === 0x80
      ) {
        let cp =
          ((b0 & 0x07) << 18) |
          ((b1 & 0x3f) << 12) |
          ((b2 & 0x3f) << 6) |
          (b3 & 0x3f);
        cp -= 0x10000;
        salida += String.fromCharCode(
          0xd800 + (cp >> 10),
          0xdc00 + (cp & 0x3ff),
        );
      } else {
        salida += '\uFFFD';
      }
      continue;
    }

    salida += '\uFFFD';
  }

  return salida;
}

/** Atajo para quien solo necesita texto de una notificación completa. */
export function decodeBase64ATexto(b64: string): string {
  return decodeUtf8(decodeBase64ABytes(b64));
}
