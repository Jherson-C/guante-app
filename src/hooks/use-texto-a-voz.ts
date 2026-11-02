/**
 * Texto a voz para el oyente: lee en voz alta lo que el sordo firmó con el
 * guante. No se usa para la voz del oyente (esa solo se transcribe).
 */

import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';

export interface TextoAVoz {
  hablar: (texto: string) => void;
  detener: () => void;
  hablando: boolean;
}

export function useTextoAVoz(): TextoAVoz {
  const [hablando, setHablando] = useState(false);

  const hablar = useCallback((texto: string) => {
    const limpio = texto.trim();
    if (!limpio) return;

    void Speech.stop();
    void Speech.speak(limpio, {
      language: 'es-PE',
      rate: 0.95,
      onStart: () => setHablando(true),
      onDone: () => setHablando(false),
      onStopped: () => setHablando(false),
      onError: () => setHablando(false),
    });
  }, []);

  const detener = useCallback(() => {
    void Speech.stop();
    setHablando(false);
  }, []);

  useEffect(
    () => () => {
      void Speech.stop();
    },
    [],
  );

  return { hablar, detener, hablando };
}
