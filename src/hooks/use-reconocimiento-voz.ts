/**
 * Voz del oyente → texto, en modo manos libres.
 *
 * Al activar la escucha el reconocedor se reinicia solo después de cada frase,
 * así la conversación fluye sin tocar el micrófono en cada turno. Cada frase
 * final se entrega por `onFinal`; lo que se va diciendo se expone en `parcial`.
 * Si pasan varios ciclos seguidos en silencio, la escucha se pausa para no
 * gastar batería. El audio no se guarda en la app (lo procesa el reconocedor
 * de Android).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

const MENSAJES_ERROR: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  'not-allowed': 'Permiso de micrófono denegado. Actívalo en Ajustes.',
  'service-not-allowed':
    'El servicio de voz no está disponible. Instala o actualiza "Voz" de Google.',
  'language-not-supported':
    'El reconocedor no tiene español instalado. Descárgalo en Ajustes > Idioma.',
  network: 'Sin conexión para el reconocimiento de voz.',
  busy: 'El reconocedor está ocupado. Espera un segundo.',
  'audio-capture': 'No se pudo acceder al micrófono.',
};

/** Errores que son parte normal de escuchar: se reintenta sin avisar. */
const ERRORES_SILENCIOSOS: readonly ExpoSpeechRecognitionErrorCode[] = [
  'no-speech',
  'speech-timeout',
  'aborted',
];

const MAX_CICLOS_EN_SILENCIO = 6;
const ESPERA_REINICIO_MS = 250;

export interface ReconocimientoVoz {
  escuchando: boolean;
  /** Lo que se está diciendo ahora (aún sin cerrar). */
  parcial: string;
  error: string | null;
  iniciar: () => Promise<void>;
  detener: () => void;
}

export function useReconocimientoVoz(onFinal: (texto: string) => void): ReconocimientoVoz {
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState('');
  const [error, setError] = useState<string | null>(null);

  const quiereRef = useRef(false);
  const ciclosSilencioRef = useRef(0);
  const reinicioRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  });

  const arrancar = useCallback(() => {
    ExpoSpeechRecognitionModule.start({
      lang: 'es-PE',
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      addsPunctuation: true,
      requiresOnDeviceRecognition: false,
    });
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    const texto = event.results[0]?.transcript?.trim() ?? '';
    if (!texto) return;
    ciclosSilencioRef.current = 0;

    if (event.isFinal) {
      setParcial('');
      onFinalRef.current(texto);
    } else {
      setParcial(texto);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (ERRORES_SILENCIOSOS.includes(event.error)) return; // 'end' decide si reinicia
    quiereRef.current = false;
    setEscuchando(false);
    setParcial('');
    setError(MENSAJES_ERROR[event.error] ?? `Error de voz: ${event.error}`);
  });

  useSpeechRecognitionEvent('end', () => {
    setParcial('');
    if (!quiereRef.current) {
      setEscuchando(false);
      return;
    }

    ciclosSilencioRef.current += 1;
    if (ciclosSilencioRef.current > MAX_CICLOS_EN_SILENCIO) {
      quiereRef.current = false;
      setEscuchando(false);
      setError('Micrófono en pausa por silencio. Tócalo para seguir escuchando.');
      return;
    }

    reinicioRef.current = setTimeout(() => {
      if (!quiereRef.current) return;
      try {
        arrancar();
      } catch {
        quiereRef.current = false;
        setEscuchando(false);
        setError('No se pudo reiniciar el micrófono.');
      }
    }, ESPERA_REINICIO_MS);
  });

  const iniciar = useCallback(async () => {
    if (quiereRef.current) return;
    setError(null);
    setParcial('');

    try {
      const permiso = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permiso.granted) {
        setError(MENSAJES_ERROR['not-allowed'] ?? 'Permiso denegado.');
        return;
      }
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError('Este teléfono no tiene un servicio de reconocimiento de voz.');
        return;
      }

      quiereRef.current = true;
      ciclosSilencioRef.current = 0;
      setEscuchando(true);
      arrancar();
    } catch {
      quiereRef.current = false;
      setEscuchando(false);
      setError('No se pudo iniciar el micrófono.');
    }
  }, [arrancar]);

  const detener = useCallback(() => {
    quiereRef.current = false;
    if (reinicioRef.current) clearTimeout(reinicioRef.current);
    setEscuchando(false);
    setParcial('');
    ExpoSpeechRecognitionModule.stop();
  }, []);

  // Si se sale de la pantalla, cortar el micrófono.
  useEffect(
    () => () => {
      quiereRef.current = false;
      if (reinicioRef.current) clearTimeout(reinicioRef.current);
      ExpoSpeechRecognitionModule.abort();
    },
    [],
  );

  return { escuchando, parcial, error, iniciar, detener };
}
