/**
 * Estado del guante en memoria — HU-06: únicamente `useState`, sin SQLite,
 * sin nube, sin persistencia. Al destruirse el proceso este texto desaparece,
 * y es aceptado y comunicado en la UI (SPEC §6).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { GuanteClient } from '@/ble/guante';
import type { ConnectionPhase } from '@/ble/guante';
import type { Frame, Telemetria } from '@/ble/protocol';
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

const MAX_DEBUG_FRAMES = 12;
const MAX_INFO_LINES = 8;

interface GuanteEstado {
  fase: ConnectionPhase;
  detalle: string | null;
  texto: string;
  /** Confianza del último reconocimiento ("S:nombre|conf" — v1.1). */
  confianza: number | null;
  activo: boolean;
  debugFrames: FrameDebug[];
  totalFrames: number;
  framesInvalidos: number;
  /** Últimos mensajes informativos del firmware (OK/ERR/WARN/HELLO/L…). */
  infoLineas: string[];
  /** Última telemetría "D:" recibida (flex %, roll, pitch, gyro). */
  tele: Telemetria | null;
  /** El firmware se identificó como simulado (`HELLO:...:SIM` / `INFO:DEMO`). */
  simulado: boolean;
  conectar: () => void;
  desconectar: () => void;
  limpiarTexto: () => void;
  /** Extensión de edición: espacio, borrado y reemplazo desde la UI. */
  agregarEspacio: () => void;
  borrarUltimo: () => void;
  reemplazarTexto: (texto: string) => void;
}

const GuanteContext = createContext<GuanteEstado | null>(null);

export function GuanteProvider({ children }: PropsWithChildren) {
  const [fase, setFase] = useState<ConnectionPhase>('inicial');
  const [detalle, setDetalle] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [confianza, setConfianza] = useState<number | null>(null);
  const [debugFrames, setDebugFrames] = useState<FrameDebug[]>([]);
  const [totalFrames, setTotalFrames] = useState(0);
  const [framesInvalidos, setFramesInvalidos] = useState(0);
  const [infoLineas, setInfoLineas] = useState<string[]>([]);
  const [tele, setTele] = useState<Telemetria | null>(null);
  const [simulado, setSimulado] = useState(false);

  const clientRef = useRef<GuanteClient | null>(null);
  const frameId = useRef(0);

  /** Aplica una línea del protocolo al estado de la app (v1.1). */
  const interpretarFrame = useCallback((frame: Frame) => {
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
      case 'telemetria':
        // 10 Hz: solo actualiza el panel de debug, nunca el texto.
        setTele(frame.tele);
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

  const conectar = useCallback(() => {
    if (Platform.OS !== 'android') {
      setFase('ble-no-disponible');
      setDetalle(
        'La conexión BLE solo está disponible en Android. En web usá el modo práctica o prueba_edwin.html.',
      );
      return;
    }

    setSimulado(false);
    try {
      if (!clientRef.current) {
        clientRef.current = new GuanteClient({
          onPhase: (p, d) => {
            setFase(p);
            setDetalle(d ?? null);
          },
          onFrame: interpretarFrame,
        });
      }
      void clientRef.current.conectar();
    } catch {
      // Expo Go o un build sin el módulo nativo: new BleManager() puede
      // lanzar antes de que el flujo normal muestre un estado.
      setFase('ble-no-disponible');
      setDetalle(
        'No se pudo iniciar el Bluetooth. En Android usá el APK/development build: Expo Go no incluye BLE.',
      );
    }
  }, [interpretarFrame]);

  const desconectar = useCallback(() => {
    void clientRef.current?.desconectar();
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

  const reemplazarTexto = useCallback((nuevo: string) => {
    setTexto(nuevo);
  }, []);

  // Aviso háptico cuando la conexión se pierde sin acción del usuario.
  useEffect(() => {
    if (fase === 'desconectado') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }, [fase]);

  const estado: GuanteEstado = {
    fase,
    detalle,
    texto,
    confianza,
    activo: fase === 'operativo',
    debugFrames,
    totalFrames,
    framesInvalidos,
    infoLineas,
    tele,
    simulado,
    conectar,
    desconectar,
    limpiarTexto,
    agregarEspacio,
    borrarUltimo,
    reemplazarTexto,
  };

  return <GuanteContext.Provider value={estado}>{children}</GuanteContext.Provider>;
}

export function useGuante(): GuanteEstado {
  const ctx = useContext(GuanteContext);
  if (!ctx) throw new Error('useGuante debe usarse dentro de <GuanteProvider>');
  return ctx;
}
