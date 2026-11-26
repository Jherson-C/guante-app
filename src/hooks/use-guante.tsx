/**
 * Estado del guante en memoria — HU-06: únicamente `useState`, sin SQLite,
 * sin nube, sin persistencia. Al destruirse el proceso este texto desaparece,
 * y es aceptado y comunicado en la UI (SPEC §6).
 *
 * Maneja una conexión BLE: el cerebro UNO Q, que recibe los guantes (escriben
 * el texto) y mueve el servo de la base giratoria (recibe comandos G:<grados>).
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { PropsWithChildren } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { DispositivoBle } from '@/ble/guante';
import type { ConnectionPhase } from '@/ble/guante';
import { PERFILES, parseLine } from '@/ble/protocol';
import type { Frame, IdDispositivo, Telemetria } from '@/ble/protocol';
import { textoDeReconocimiento } from '@/domain/frases';
import {
  aplicarEspacio,
  borrarUltimo as quitarUltimo,
} from '@/domain/transcripcion';

export interface FrameDebug {
  id: number;
  texto: string;
  confianza: number | null;
}

export interface EstadoDispositivo {
  fase: ConnectionPhase;
  detalle: string | null;
}

const MAX_DEBUG_FRAMES = 12;
const MAX_INFO_LINES = 8;
const IDS: IdDispositivo[] = ['guantes'];

const ESTADOS_INICIALES = Object.fromEntries(
  IDS.map((id) => [id, { fase: 'inicial', detalle: null }]),
) as Record<IdDispositivo, EstadoDispositivo>;

interface GuanteEstado {
  /** Estado de los guantes (las pantallas de chat lo usan tal cual). */
  fase: ConnectionPhase;
  detalle: string | null;
  /** Estado individual de cada dispositivo. */
  dispositivos: Record<IdDispositivo, EstadoDispositivo>;
  texto: string;
  /** Confianza del último reconocimiento ("S:nombre|conf" — v1.1). */
  confianza: number | null;
  /** Los guantes están operativos. */
  activo: boolean;
  debugFrames: FrameDebug[];
  totalFrames: number;
  framesInvalidos: number;
  /** Últimos mensajes informativos del cerebro (OK:..., WARN:...). */
  infoLineas: string[];
  /** Última telemetría "D:" de los guantes. */
  tele: Telemetria | null;
  /** Telemetría de cada guante por separado. */
  teles: Partial<Record<IdDispositivo, Telemetria>>;
  /** El firmware se identificó como simulado (`HELLO:...:SIM` / `INFO:DEMO`). */
  simulado: boolean;
  /** Conecta, uno tras otro, los dispositivos que falten. */
  conectar: () => void;
  /** Desconecta todo. */
  desconectar: () => void;
  conectarDispositivo: (id: IdDispositivo) => void;
  desconectarDispositivo: (id: IdDispositivo) => void;
  /** Manda un comando de la base giratoria (G:<grados>) al cerebro (se le agrega '\n'). */
  enviarBase: (linea: string) => Promise<void>;
  limpiarTexto: () => void;
  /** Extensión de edición: espacio, borrado y reemplazo desde la UI. */
  agregarEspacio: () => void;
  borrarUltimo: () => void;
  /** Procesa una línea del protocolo como si la hubiera mandado el guante (demo/pruebas). */
  inyectarLinea: (linea: string) => void;
  /** Acepta una función para trabajar sobre el texto más reciente (el guante sigue escribiendo). */
  reemplazarTexto: (texto: string | ((previo: string) => string)) => void;
}

const GuanteContext = createContext<GuanteEstado | null>(null);

export function GuanteProvider({ children }: PropsWithChildren) {
  const [dispositivos, setDispositivos] = useState(ESTADOS_INICIALES);
  const [texto, setTexto] = useState('');
  const [confianza, setConfianza] = useState<number | null>(null);
  const [debugFrames, setDebugFrames] = useState<FrameDebug[]>([]);
  const [totalFrames, setTotalFrames] = useState(0);
  const [framesInvalidos, setFramesInvalidos] = useState(0);
  const [infoLineas, setInfoLineas] = useState<string[]>([]);
  const [teles, setTeles] = useState<Partial<Record<IdDispositivo, Telemetria>>>({});
  const [simulado, setSimulado] = useState(false);

  const clientes = useRef<Partial<Record<IdDispositivo, DispositivoBle>>>({});
  const frameId = useRef(0);
  const ultimaTele = useRef<Partial<Record<IdDispositivo, number>>>({});

  const ponerFase = useCallback((id: IdDispositivo, fase: ConnectionPhase, detalle?: string) => {
    setDispositivos((prev) => ({ ...prev, [id]: { fase, detalle: detalle ?? null } }));
  }, []);

  /** Aplica una línea del protocolo al estado de la app (v1.1). */
  const interpretarFrame = useCallback((frame: Frame, origen: IdDispositivo = 'guantes') => {
    // La telemetría llega a ~10 Hz: no cuenta como "reconocimiento" y se limita
    // a 2 Hz por guante para no re-renderizar todas las pantallas 10 veces por segundo.
    if (frame.kind === 'telemetria') {
      const ahora = Date.now();
      if (ahora - (ultimaTele.current[origen] ?? 0) >= 500) {
        ultimaTele.current[origen] = ahora;
        setTeles((prev) => ({ ...prev, [origen]: frame.tele }));
      }
      return;
    }
    setTotalFrames((t) => t + 1);
    switch (frame.kind) {
      case 'texto': {
        // Una seña de varias letras puede ser una palabra/frase aprendida:
        // se muestra con la forma bonita del catálogo (tildes y signos).
        setTexto((prev) => prev + textoDeReconocimiento(frame.nombre));
        setConfianza(frame.confianza);
        const id = ++frameId.current;
        setDebugFrames((prev) =>
          [{ id, texto: frame.texto.trim(), confianza: frame.confianza }, ...prev].slice(
            0,
            MAX_DEBUG_FRAMES,
          ),
        );
        // Feedback no visual por reconocimiento (accesibilidad — SPEC §6.3)
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        break;
      }
      case 'control':
        // Extensión app/firmware simulado: ESPACIO, BORRAR y LIMPIAR llegan
        // como señas y se aplican al texto en vez de escribirse literalmente.
        setTexto((prev) => {
          switch (frame.accion) {
            case 'espacio':
              return aplicarEspacio(prev);
            case 'borrar':
              return quitarUltimo(prev);
            case 'limpiar':
              return '';
          }
        });
        if (frame.accion === 'limpiar') setConfianza(null);
        Haptics.selectionAsync().catch(() => {});
        break;
      case 'info':
        if (frame.texto.includes(':SIM') || frame.texto.startsWith('INFO:DEMO:')) {
          setSimulado(true);
        }
        setInfoLineas((prev) => [frame.texto, ...prev].slice(0, MAX_INFO_LINES));
        break;
      case 'invalido':
        setFramesInvalidos((prev) => prev + 1);
        break;
    }
  }, []);

  /** Crea (una sola vez) el cliente BLE de un dispositivo; null si no hay BLE. */
  const cliente = useCallback(
    (id: IdDispositivo): DispositivoBle | null => {
      if (Platform.OS !== 'android') {
        ponerFase(
          id,
          'ble-no-disponible',
          'La conexión BLE solo está disponible en Android. En web no hay Bluetooth.',
        );
        return null;
      }
      try {
        clientes.current[id] ??= new DispositivoBle(PERFILES[id], {
          onPhase: (p, d) => {
            ponerFase(id, p, d);
            // Aviso háptico cuando la conexión se pierde sin acción del usuario.
            if (p === 'desconectado') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            }
          },
          onFrame: (frame) => interpretarFrame(frame, id),
        });
        return clientes.current[id];
      } catch {
        // Expo Go o un build sin el módulo nativo: new BleManager() puede
        // lanzar antes de que el flujo normal muestre un estado.
        ponerFase(
          id,
          'ble-no-disponible',
          'No se pudo iniciar el Bluetooth. En Android usá el APK/development build: Expo Go no incluye BLE.',
        );
        return null;
      }
    },
    [interpretarFrame, ponerFase],
  );

  const conectarDispositivo = useCallback(
    (id: IdDispositivo) => {
      setSimulado(false);
      void cliente(id)?.conectar();
    },
    [cliente],
  );

  const conectar = useCallback(() => {
    setSimulado(false);
    // En serie: un solo diálogo de permisos a la vez y un escaneo a la vez.
    void (async () => {
      for (const id of IDS) {
        const c = cliente(id);
        if (c && !c.conectado) await c.conectar();
      }
    })();
  }, [cliente]);

  const desconectarDispositivo = useCallback((id: IdDispositivo) => {
    void clientes.current[id]?.desconectar();
  }, []);

  const desconectar = useCallback(() => {
    for (const id of IDS) void clientes.current[id]?.desconectar();
  }, []);

  const enviarBase = useCallback(async (linea: string) => {
    const cerebro = clientes.current.guantes; // el servo de la base cuelga del cerebro UNO Q
    if (!cerebro) throw new Error('Placa no conectada');
    await cerebro.enviar(linea);
  }, []);

  const limpiarTexto = useCallback(() => {
    setTexto('');
    setConfianza(null);
  }, []);

  const agregarEspacio = useCallback(() => {
    setTexto((prev) => aplicarEspacio(prev));
  }, []);

  const borrarUltimo = useCallback(() => {
    setTexto((prev) => quitarUltimo(prev));
  }, []);

  const inyectarLinea = useCallback(
    (linea: string) => interpretarFrame(parseLine(linea)),
    [interpretarFrame],
  );

  const reemplazarTexto = useCallback((nuevo: string | ((previo: string) => string)) => {
    setTexto(nuevo);
  }, []);

  const principal = dispositivos.guantes;

  const estado: GuanteEstado = {
    fase: principal.fase,
    detalle: principal.detalle,
    dispositivos,
    texto,
    confianza,
    activo: principal.fase === 'operativo',
    debugFrames,
    totalFrames,
    framesInvalidos,
    infoLineas,
    tele: teles.guantes ?? null,
    teles,
    simulado,
    conectar,
    desconectar,
    conectarDispositivo,
    desconectarDispositivo,
    enviarBase,
    limpiarTexto,
    agregarEspacio,
    borrarUltimo,
    inyectarLinea,
    reemplazarTexto,
  };

  return <GuanteContext.Provider value={estado}>{children}</GuanteContext.Provider>;
}

export function useGuante(): GuanteEstado {
  const ctx = useContext(GuanteContext);
  if (!ctx) throw new Error('useGuante debe usarse dentro de <GuanteProvider>');
  return ctx;
}
