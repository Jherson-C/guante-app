/**
 * Etiquetas legibles de las fases de conexión (SPEC §6.3).
 * Cada fase tiene respuesta de UI: nunca solo color, y siempre
 * una acción de reintento cuando corresponde.
 */

import type { ConnectionPhase } from '@/ble/guante';
import { COLOR } from '@/constants/tema';

export const ETIQUETAS_FASE: Record<ConnectionPhase, string> = {
  inicial: 'Sin conectar',
  verificando: 'Verificando permisos y Bluetooth…',
  'bt-apagado': 'Bluetooth apagado — actívalo y reintenta',
  'ble-no-disponible': 'Bluetooth BLE no disponible en esta plataforma',
  'permiso-denegado': 'Permisos de Bluetooth denegados',
  escaneando: 'Buscando la placa…',
  'no-encontrado': 'No se encontró la placa — ¿está encendida?',
  conectando: 'Conectando…',
  conectado: 'Conectado — preparando transmisión…',
  operativo: 'Placa conectada y lista',
  reconectando: 'Conexión perdida — reconectando…',
  desconectado: 'Desconectado',
};

/** Versión corta para chips de estado en barras estrechas. */
export const ETIQUETAS_CORTAS: Record<ConnectionPhase, string> = {
  inicial: 'Sin conectar',
  verificando: 'Verificando…',
  'bt-apagado': 'Bluetooth apagado',
  'ble-no-disponible': 'Sin BLE',
  'permiso-denegado': 'Sin permisos',
  escaneando: 'Buscando…',
  'no-encontrado': 'No encontrado',
  conectando: 'Conectando…',
  conectado: 'Preparando…',
  operativo: 'Placa lista',
  reconectando: 'Reconectando…',
  desconectado: 'Desconectado',
};

/** Colores semánticos asociados a cada fase (apoyo visual, no único canal). */
export const COLORES_FASE: Record<ConnectionPhase, string> = {
  inicial: COLOR.tenue,
  verificando: COLOR.guante,
  'bt-apagado': COLOR.coral,
  'ble-no-disponible': COLOR.aviso,
  'permiso-denegado': COLOR.coral,
  escaneando: COLOR.guante,
  'no-encontrado': COLOR.coral,
  conectando: COLOR.guante,
  conectado: COLOR.guante,
  operativo: COLOR.verde,
  reconectando: COLOR.aviso,
  desconectado: COLOR.coral,
};
