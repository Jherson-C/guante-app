/**
 * Etiquetas legibles de las fases de conexión (SPEC §6.3).
 * Cada fase tiene respuesta de UI: nunca solo color, y siempre
 * una acción de reintento cuando corresponde.
 */

import type { ConnectionPhase } from '@/ble/guante';

export const ETIQUETAS_FASE: Record<ConnectionPhase, string> = {
  inicial: 'Sin conectar',
  verificando: 'Verificando permisos y Bluetooth…',
  'bt-apagado': 'Bluetooth apagado — actívalo y reintenta',
  'ble-no-disponible': 'Bluetooth BLE no disponible en esta plataforma',
  'permiso-denegado': 'Permisos de Bluetooth denegados',
  escaneando: 'Buscando el guante…',
  'no-encontrado': 'No se encontró el guante — ¿está encendido?',
  conectando: 'Conectando…',
  conectado: 'Conectado — preparando transmisión…',
  operativo: 'Guante conectado y listo',
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
  operativo: 'Guante listo',
  reconectando: 'Reconectando…',
  desconectado: 'Desconectado',
};

/** Colores semánticos asociados a cada fase (apoyo visual, no único canal). */
export const COLORES_FASE: Record<ConnectionPhase, string> = {
  inicial: '#8a8a8a',
  verificando: '#c9b458',
  'bt-apagado': '#e05a4e',
  'ble-no-disponible': '#e0b34e',
  'permiso-denegado': '#e05a4e',
  escaneando: '#c9b458',
  'no-encontrado': '#e05a4e',
  conectando: '#c9b458',
  conectado: '#c9b458',
  operativo: '#4caf7d',
  reconectando: '#e08b4e',
  desconectado: '#e05a4e',
};
