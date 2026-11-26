/**
 * Cliente BLE del guante — implement el flujo de conexión definido en
 * SPEC_PROTOCOL.md (Apéndice A, v1.1 — protocolo de texto del firmware
 * `guante_senas`, Nordic UART):
 *   permisos → estado del adaptador → escaneo (nombre + UUID de servicio)
 *   → conexión → descubrimiento → suscripción (Notify) → reconexión con backoff.
 *
 * El firmware envía LÍNEAS de texto (UTF-8; pueden partirse entre
 * notificaciones): se acumulan los BYTES hasta '\n' y recién entonces se
 * decodifica la línea completa como Frame.
 *
 * No guarda texto: cada frame se entrega al callback `events.onFrame`
 * y el estado vive en la app (useState — HU-06).
 */

import { BleManager, Device, State, Subscription } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

import { parseLine } from './protocol';
import type { Frame, PerfilBle } from './protocol';
import { decodeBase64ABytes, decodeUtf8 } from './utf8';

export { decodeBase64ATexto } from './utf8';

export type ConnectionPhase =
  | 'inicial'
  | 'verificando'
  | 'bt-apagado'
  | 'ble-no-disponible'
  | 'permiso-denegado'
  | 'escaneando'
  | 'no-encontrado'
  | 'conectando'
  | 'conectado'
  | 'operativo'
  | 'reconectando'
  | 'desconectado';

/** SPEC §6.5: 1 s → 2 s → 4 s, máx. 5 intentos */
const DELAYS_RECONEXION_MS = [1000, 2000, 4000, 4000, 4000];
const TIMEOUT_ESCANEO_MS = 15_000;
const BLE_CHUNK = 20; // MTU mínimo: HM-10 no negocia más

// ble-plx exige UN solo BleManager para toda la app.
let managerCompartido: BleManager | null = null;
// Android solo permite un escaneo a la vez: los dispositivos hacen cola.
let colaEscaneo: Promise<unknown> = Promise.resolve();

export interface GuanteEvents {
  onPhase(phase: ConnectionPhase, detalle?: string): void;
  onFrame(frame: Frame, linea: string): void;
}

/** Cliente de un dispositivo BLE de texto por líneas (el cerebro o un guante suelto). */
export class DispositivoBle {
  private readonly manager = (managerCompartido ??= new BleManager());
  private idDispositivo: string | null = null;
  private subDesconexion: Subscription | null = null;
  private subMonitor: Subscription | null = null;
  private desconectManual = false;
  private intentosReconexion = 0;
  /** Bytes pendientes de una línea (no texto: un UTF-8 puede partirse). */
  private bufferLinea: number[] = [];
  private primeraNotificacion = false;
  /** Corta el escaneo en curso de ESTE dispositivo (sin tocar la cola). */
  private cancelarEscaneo: (() => void) | null = null;
  private events: GuanteEvents;
  private perfil: PerfilBle;

  constructor(perfil: PerfilBle, events: GuanteEvents) {
    this.perfil = perfil;
    this.events = events;
  }

  /** Tiene dispositivo asignado (operativo o reconectando). */
  get conectado(): boolean {
    return this.idDispositivo !== null;
  }

  /** Envía una línea (se agrega '\n'), en trozos de 20 bytes. */
  async enviar(linea: string): Promise<void> {
    const id = this.idDispositivo;
    if (!id) throw new Error('Dispositivo no conectado');
    const bytes = new TextEncoder().encode(linea + '\n');
    for (let i = 0; i < bytes.length; i += BLE_CHUNK) {
      const trozo = String.fromCharCode(...bytes.subarray(i, i + BLE_CHUNK));
      await this.manager.writeCharacteristicWithoutResponseForDevice(
        id,
        this.perfil.servicio,
        this.perfil.rx,
        btoa(trozo),
      );
    }
  }

  /** Flujo completo de conexión desde cero (escaneo incluido). */
  async conectar(): Promise<void> {
    this.desconectManual = false;
    this.intentosReconexion = 0;
    this.bufferLinea = [];
    this.events.onPhase('verificando');

    if (Platform.OS !== 'android') {
      this.events.onPhase(
        'ble-no-disponible',
        'La conexión BLE solo está disponible en Android. En web no hay Bluetooth.',
      );
      return;
    }
    if (!(await this.pedirPermisos())) return;

    const estado = await this.manager.state();
    if (estado !== State.PoweredOn) {
      this.events.onPhase('bt-apagado');
      return;
    }

    this.events.onPhase('escaneando');
    const busqueda = colaEscaneo.then(() => (this.desconectManual ? null : this.buscar()));
    colaEscaneo = busqueda;
    const id = await busqueda;
    if (!id) return;
    await this.conectarEASubscribirse(id);
  }

  /** Desconexión manual (el texto en memoria se conserva — SPEC §6.5). */
  async desconectar(): Promise<void> {
    this.desconectManual = true;
    this.cancelarEscaneo?.();
    this.limpiarSuscripciones();
    this.bufferLinea = [];
    if (this.idDispositivo) {
      await this.manager.cancelDeviceConnection(this.idDispositivo).catch(() => {});
      this.idDispositivo = null;
    }
    this.events.onPhase('inicial');
  }

  /** Limpieza al desmontar la app (mata listeners, no el texto). */
  cleanup(): void {
    this.desconectManual = true;
    this.cancelarEscaneo?.();
    this.limpiarSuscripciones();
    this.bufferLinea = [];
  }

  private async pedirPermisos(): Promise<boolean> {
    // Con neverForLocation (config plugin) Android 12+ no exige ubicación;
    // en Android ≤ 11 el escaneo BLE sí exige ACCESS_FINE_LOCATION.
    const permisos: string[] = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ];
    if (Number(Platform.Version) < 31) {
      permisos.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
    const resultados = await PermissionsAndroid.requestMultiple(
      permisos as Parameters<typeof PermissionsAndroid.requestMultiple>[0],
    );
    const concedidos = Object.values(resultados).every(
      (v) => v === PermissionsAndroid.RESULTS.GRANTED,
    );
    if (!concedidos) {
      this.events.onPhase('permiso-denegado');
      return false;
    }
    return true;
  }

  private buscar(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      let resuelto = false;
      this.cancelarEscaneo = () => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(timeout);
        this.manager.stopDeviceScan();
        resolve(null);
      };

      const timeout = setTimeout(() => {
        if (resuelto) return;
        resuelto = true;
        this.manager.stopDeviceScan();
        this.events.onPhase('no-encontrado');
        resolve(null);
      }, TIMEOUT_ESCANEO_MS);

      // Sin filtro de servicio: varios clones HM-10 no anuncian FFE0. Se filtra por nombre.
      this.manager.startDeviceScan(null, null, (error, device) => {
        if (resuelto) return;
        if (error) {
          resuelto = true;
          clearTimeout(timeout);
          this.manager.stopDeviceScan();
          this.events.onPhase('no-encontrado', error.message);
          resolve(null);
          return;
        }
        const nombres = this.perfil.nombres;
        if (device && (nombres.includes(device.name ?? '') || nombres.includes(device.localName ?? ''))) {
          resuelto = true;
          clearTimeout(timeout);
          this.manager.stopDeviceScan();
          resolve(device.id);
        }
      });
    }).finally(() => {
      this.cancelarEscaneo = null;
    });
  }

  private async conectarEASubscribirse(id: string): Promise<void> {
    this.events.onPhase('conectando');
    try {
      const device = await this.manager.connectToDevice(id, { autoConnect: false });
      this.events.onPhase('conectado');
      await device.discoverAllServicesAndCharacteristics();
      this.idDispositivo = id;
      this.primeraNotificacion = true;
      this.registrarDesconexion(device);
      this.suscribir(device);
      // La fase "operativo" se marca al recibir la PRIMERA notificación
      // (el HELLO del firmware): confirma que la suscripción quedó viva.
    } catch (e) {
      this.events.onPhase('desconectado', e instanceof Error ? e.message : String(e));
    }
  }

  private registrarDesconexion(device: Device): void {
    this.subDesconexion = device.onDisconnected((error) => {
      this.alDesconectar(error ?? undefined);
    });
  }

  private alDesconectar(error?: unknown): void {
    this.limpiarSuscripciones();
    if (this.desconectManual) {
      this.events.onPhase('desconectado');
      return;
    }
    this.events.onPhase('reconectando', error instanceof Error ? error.message : undefined);
    void this.reintentar();
  }

  private async reintentar(): Promise<void> {
    if (!this.idDispositivo || this.intentosReconexion >= DELAYS_RECONEXION_MS.length) {
      this.events.onPhase('desconectado');
      return;
    }
    const delay = DELAYS_RECONEXION_MS[this.intentosReconexion++];
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    if (this.desconectManual) return;
    try {
      const device = await this.manager.connectToDevice(this.idDispositivo, {
        autoConnect: false,
      });
      await device.discoverAllServicesAndCharacteristics();
      this.intentosReconexion = 0;
      this.primeraNotificacion = true;
      this.registrarDesconexion(device);
      this.suscribir(device);
    } catch {
      void this.reintentar();
    }
  }

  private suscribir(device: Device): void {
    this.subMonitor?.remove();
    this.subMonitor = device.monitorCharacteristicForService(
      this.perfil.servicio,
      this.perfil.tx,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        if (this.primeraNotificacion) {
          this.primeraNotificacion = false;
          this.events.onPhase('operativo');
        }
        this.entrarBytes(decodeBase64ABytes(characteristic.value));
      },
      `monitor-${this.perfil.nombres[0]}`,
    );
    // El cerebro no saluda solo: su respuesta al saludo (OK:PONG) marca "operativo".
    if (this.perfil.saludo) this.enviar(this.perfil.saludo).catch(() => {});
  }

  /**
   * Acumula BYTES hasta '\n'. Se decodifica recién cuando la línea está
   * completa: si el firmware parte una tilde o un '¿' entre dos notificaciones,
   * decodificar cada chunk por separado lo corrompería.
   */
  private entrarBytes(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i += 1) {
      this.bufferLinea.push(bytes[i]);
    }

    let salto = this.bufferLinea.indexOf(0x0a);
    while (salto !== -1) {
      const lineaBytes = this.bufferLinea.slice(0, salto);
      this.bufferLinea = this.bufferLinea.slice(salto + 1);
      const linea = decodeUtf8(new Uint8Array(lineaBytes));
      if (linea.trim()) this.events.onFrame(parseLine(linea), linea.trim());
      salto = this.bufferLinea.indexOf(0x0a);
    }

    if (this.bufferLinea.length > 512) this.bufferLinea = []; // saneamiento
  }

  private limpiarSuscripciones(): void {
    this.subDesconexion?.remove();
    this.subDesconexion = null;
    this.subMonitor?.remove();
    this.subMonitor = null;
  }
}


