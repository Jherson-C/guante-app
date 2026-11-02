/**
 * Contrato v1.1 — protocolo de TEXTO del firmware `guante_senas` (Nordic UART).
 * Líneas de texto terminadas en '\n' (UTF-8 desde 2026-11-02; v1.1 era ASCII).
 * Documento: SPEC_PROTOCOL.md (Apéndice A).
 *
 *   S:nombre|conf   → reconocimiento (1 letra o palabra aprendida)
 *   D:f1..f5,roll,pitch,gyro → telemetría en vivo (flex %, grados, deg/s)
 *   L:nombre|C|F, LEND, OK:..., ERR:..., WARN:..., R:..., HELLO:...
 *
 * Extensión de edición (app + `guante_simulado`): una seña llamada ESPACIO,
 * BORRAR o LIMPIAR no se escribe: se aplica al texto. Así se pueden deletrear
 * frases sin depender de un gesto de espacio en el hardware.
 *
 * La app NO envía comandos en este MVP (CAL/LEARN/DEL quedan en Serial
 * por ahora — decisión: canal de escritura post-demo).
 */

/** UUIDs del firmware adoptado (Nordic UART Service) */
export const GUANTE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const GUANTE_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // salida (NOTIFY)
export const GUANTE_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // entrada (no usada en MVP)
export const GUANTE_NAME = 'GuanteLSP';

export interface Telemetria {
  flex: number[];   // 5 valores 0–100 %
  roll: number;     // grados
  pitch: number;    // grados
  gyro: number;     // |ω| deg/s
}

export type AccionControl = 'espacio' | 'borrar' | 'limpiar';

export type Frame =
  | { kind: 'texto'; texto: string; nombre: string; confianza: number | null }
  | { kind: 'telemetria'; tele: Telemetria }
  | { kind: 'info'; texto: string }
  | { kind: 'invalido'; texto: string }
  | { kind: 'control'; accion: AccionControl };

/** Señas de edición que la app interpreta como acciones, no como texto. */
const CONTROLES: Record<string, AccionControl> = {
  ESPACIO: 'espacio',
  SPACE: 'espacio',
  BORRAR: 'borrar',
  BACKSPACE: 'borrar',
  DEL: 'borrar',
  LIMPIAR: 'limpiar',
  CLEAR: 'limpiar',
};

/** Parsea una línea completa del protocolo (sin el '\n'). */
export function parseLine(line: string): Frame {
  const l = line.trim();
  if (!l) return { kind: 'invalido', texto: l };

  if (l.startsWith('S:')) {
    const cuerpo = l.slice(2);
    const sep = cuerpo.indexOf('|');
    const nombre = (sep === -1 ? cuerpo : cuerpo.slice(0, sep)).trim();
    if (!nombre) return { kind: 'invalido', texto: l };

    const control = CONTROLES[nombre.toUpperCase()];
    if (control) return { kind: 'control', accion: control };

    let conf: number | null = null;
    if (sep !== -1) {
      const n = parseInt(cuerpo.slice(sep + 1), 10);
      conf = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
    }
    // Convención: nombre de 1 carácter = letra → se concatena tal cual;
    // nombre compuesto = palabra aprendida → se concatena con espacio.
    const texto = nombre.length === 1 ? nombre.toUpperCase() : nombre + ' ';
    return { kind: 'texto', texto, nombre, confianza: conf };
  }

  if (l.startsWith('D:')) {
    const partes = l.slice(2).split(',').map((s) => parseFloat(s));
    if (partes.length < 8 || partes.some((v) => !Number.isFinite(v))) {
      return { kind: 'invalido', texto: l };
    }
    return {
      kind: 'telemetria',
      tele: {
        flex: [partes[0], partes[1], partes[2], partes[3], partes[4]],
        roll: partes[5],
        pitch: partes[6],
        gyro: partes[7],
      },
    };
  }

  // HELLO / OK / ERR / WARN / L / LEND / R → informativos (panel debug)
  return { kind: 'info', texto: l };
}
