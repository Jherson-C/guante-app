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

/** "ESTOY BIEN. ¿Y TÚ?" -> "Estoy bien. ¿Y tú?": en mayúsculas algunas voces leen siglas o suenan rígidas. */
export function paraLeer(texto: string): string {
  const limpio = texto.trim();
  if (limpio !== limpio.toUpperCase()) return limpio; // ya viene con mayúsculas y minúsculas (Qwen)
  return limpio.toLowerCase().replace(/(^|[.!?¿¡]\s*)(\p{L})/gu, (_, antes, letra) => antes + letra.toUpperCase());
}

export function useTextoAVoz(): TextoAVoz {
  const [hablando, setHablando] = useState(false);

  const hablar = useCallback((texto: string) => {
    const limpio = paraLeer(texto);
    if (!limpio) return;

    void Speech.stop();
    // Sin `voice` ni `language`: usa la voz elegida en Ajustes > Salida de texto a voz,
    // la misma de "Escuchar un ejemplo". Elegir otra por código sonaba peor.
    void Speech.speak(limpio, {
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
