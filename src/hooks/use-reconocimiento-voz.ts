/**
 * Voz del oyente → texto. Usa el reconocedor de Android a través de
 * expo-speech-recognition. Es push-to-talk: tocar para hablar, tocar para
 * detener (o esperar el resultado final). El audio no se guarda.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';

const MENSAJES_ERROR: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
  'not-allowed': 'Permiso de micrófono denegado. Activalo en Ajustes.',
  'service-not-allowed':
    'El servicio de voz no está disponible. Instalá/actualizá "Voz" de Google.',
  'language-not-supported':
    'El reconocedor no tiene español instalado. Descargalo en Ajustes > Idioma.',
  network: 'Sin conexión para el reconocimiento de voz.',
  'no-speech': 'No se escuchó nada. Probá de nuevo.',
  'speech-timeout': 'No se escuchó nada. Probá de nuevo.',
  busy: 'El reconocedor está ocupado. Esperá un segundo.',
  'audio-capture': 'No se pudo acceder al micrófono.',
  'too-many-requests': 'Demasiadas solicitudes seguidas. Esperá un momento.',
};

export interface ReconocimientoVoz {
  escuchando: boolean;
  transcripcion: string;
  parcial: string;
  error: string | null;
  iniciar: () => Promise<void>;
  detener: () => void;
  limpiar: () => void;
}

export function useReconocimientoVoz(): ReconocimientoVoz {
  const [escuchando, setEscuchando] = useState(false);
  const [transcripcion, setTranscripcion] = useState('');
  const [parcial, setParcial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const activoRef = useRef(false);

  useSpeechRecognitionEvent('result', (event) => {
    const texto = event.results[0]?.transcript?.trim() ?? '';
    if (!texto) return;

    if (event.isFinal) {
      setTranscripcion((previo) => (previo ? `${previo} ${texto}` : texto));
      setParcial('');
      // continuous = false: el reconocedor termina con el resultado final.
      activoRef.current = false;
      setEscuchando(false);
    } else {
      setParcial(texto);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    activoRef.current = false;
    setEscuchando(false);
    setParcial('');
    setError(MENSAJES_ERROR[event.error] ?? `Error de voz: ${event.error}`);
  });

  useSpeechRecognitionEvent('end', () => {
    activoRef.current = false;
    setEscuchando(false);
    setParcial('');
  });

  const iniciar = useCallback(async () => {
    if (activoRef.current) return;

    setError(null);
    setTranscripcion('');
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

      activoRef.current = true;
      setEscuchando(true);
      ExpoSpeechRecognitionModule.start({
        lang: 'es-PE',
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        addsPunctuation: true,
        requiresOnDeviceRecognition: false,
      });
    } catch {
      activoRef.current = false;
      setEscuchando(false);
      setError('No se pudo iniciar el micrófono.');
    }
  }, []);

  const detener = useCallback(() => {
    if (!activoRef.current) return;
    activoRef.current = false;
    setEscuchando(false);
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const limpiar = useCallback(() => {
    setTranscripcion('');
    setParcial('');
    setError(null);
  }, []);

  // Si se sale de la pantalla, cortar el micrófono.
  useEffect(
    () => () => {
      ExpoSpeechRecognitionModule.abort();
    },
    [],
  );

  return { escuchando, transcripcion, parcial, error, iniciar, detener, limpiar };
}
