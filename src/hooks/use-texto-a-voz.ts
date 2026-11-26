/**
 * Texto a voz para el oyente: lee en voz alta lo que el sordo firmó con el
 * guante. No se usa para la voz del oyente (esa solo se transcribe).
 *
 * Con EXPO_PUBLIC_FISH_API_KEY (en .env.local) la voz sale de Fish Audio; si no
 * hay clave, internet o Fish tarda/falla, habla la voz del teléfono (expo-speech).
 *
 * Para que responda rápido:
 * - `preparar(texto)` pide el audio apenas lo firmado se queda quieto, durante la
 *   pausa de 2 s que espera el turno para cerrarse; al cerrarse ya está listo.
 * - Un mismo texto nunca se pide dos veces a la vez (hablar reusa lo que preparar pidió).
 * - Cada frase queda en la caché: la segunda vez suena al instante y sin gastar cuota.
 * - latency "balanced" y MP3 de 64 kbps: Fish empieza a mandar en ~0.7 s en vez de ~1.7 s
 *   y el archivo pesa la mitad (medido con esta voz).
 */

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

const FISH_CLAVE = process.env.EXPO_PUBLIC_FISH_API_KEY ?? '';
const FISH_VOZ = process.env.EXPO_PUBLIC_FISH_VOZ ?? '';
const FISH_MODELO = process.env.EXPO_PUBLIC_FISH_MODELO || 's2.1-pro-free';
// Más que esto esperando a Fish (desde que se pidió hablar) y es mejor que hable el teléfono.
const FISH_ESPERA_MS = 5000;
// Tope de un pedido a Fish, aunque nadie lo esté esperando (los de preparar).
const FISH_TOPE_MS = 15000;
const usarFish = FISH_CLAVE !== '' && Platform.OS !== 'web';

export interface TextoAVoz {
  hablar: (texto: string) => void;
  /** Pide el audio por adelantado (sin reproducirlo) para que `hablar` suene al instante. */
  preparar: (texto: string) => void;
  detener: () => void;
  hablando: boolean;
}

/** "ESTOY BIEN. ¿Y TÚ?" -> "Estoy bien. ¿Y tú?": en mayúsculas algunas voces leen siglas o suenan rígidas. */
export function paraLeer(texto: string): string {
  const limpio = texto.trim();
  if (limpio !== limpio.toUpperCase()) return limpio; // ya viene con mayúsculas y minúsculas (Qwen)
  return limpio.toLowerCase().replace(/(^|[.!?¿¡]\s*)(\p{L})/gu, (_, antes, letra) => antes + letra.toUpperCase());
}

/** Nombre de archivo estable para la frase, la voz y los ajustes (FNV-1a de 32 bits). */
function archivoDe(texto: string): File {
  let h = 0x811c9dc5;
  for (const c of `${FISH_MODELO}|${FISH_VOZ}|64|${texto}`) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return new File(Paths.cache, `fish-${(h >>> 0).toString(16)}.mp3`);
}

async function pedirAFish(texto: string, archivo: File): Promise<File> {
  const control = new AbortController();
  const tope = setTimeout(() => control.abort(), FISH_TOPE_MS);
  try {
    const respuesta = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FISH_CLAVE}`,
        'Content-Type': 'application/json',
        model: FISH_MODELO,
      },
      body: JSON.stringify({
        text: texto,
        format: 'mp3',
        mp3_bitrate: 64,
        latency: 'balanced',
        language: 'es',
        ...(FISH_VOZ ? { reference_id: FISH_VOZ } : {}),
      }),
      signal: control.signal,
    });
    if (!respuesta.ok) throw new Error(`Fish ${respuesta.status}: ${await respuesta.text()}`);
    const bytes = await respuesta.bytes();
    archivo.create({ overwrite: true });
    try {
      await archivo.write(bytes);
    } catch (e) {
      if (archivo.exists) archivo.delete(); // que un archivo a medias no quede como caché
      throw e;
    }
    return archivo;
  } finally {
    clearTimeout(tope);
  }
}

// Pedidos en camino, por archivo: preparar y hablar del mismo texto comparten uno solo.
const enCamino = new Map<string, Promise<File>>();

function audioDe(texto: string): Promise<File> {
  const archivo = archivoDe(texto);
  if (archivo.exists && archivo.size > 0) return Promise.resolve(archivo);
  let promesa = enCamino.get(archivo.uri);
  if (!promesa) {
    promesa = pedirAFish(texto, archivo).finally(() => enCamino.delete(archivo.uri));
    enCamino.set(archivo.uri, promesa);
  }
  return promesa;
}

function conPlazo<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error(`Fish tardó más de ${ms} ms`)), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolver(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        rechazar(e);
      },
    );
  });
}

export function useTextoAVoz(): TextoAVoz {
  const [hablando, setHablando] = useState(false);
  const reproductor = useRef<AudioPlayer | null>(null);
  const turno = useRef(0); // cada hablar/detener invalida lo que estaba en camino

  const delTelefono = useCallback((texto: string, miTurno: number) => {
    if (miTurno !== turno.current) return;
    // Sin `voice` ni `language`: usa la voz elegida en Ajustes > Salida de texto a voz,
    // la misma de "Escuchar un ejemplo". Elegir otra por código sonaba peor.
    void Speech.speak(texto, {
      rate: 0.95,
      onStart: () => setHablando(true),
      onDone: () => setHablando(false),
      onStopped: () => setHablando(false),
      onError: () => setHablando(false),
    });
  }, []);

  const callar = useCallback(() => {
    turno.current += 1;
    reproductor.current?.pause();
    void Speech.stop();
  }, []);

  const preparar = useCallback((texto: string) => {
    const limpio = paraLeer(texto);
    if (!usarFish || !limpio) return;
    audioDe(limpio).catch(() => {}); // si falla, hablar lo vuelve a intentar o usa el teléfono
  }, []);

  const hablar = useCallback(
    (texto: string) => {
      const limpio = paraLeer(texto);
      if (!limpio) return;

      callar();
      const miTurno = turno.current;
      const r = reproductor.current;
      if (!usarFish || !r) {
        delTelefono(limpio, miTurno);
        return;
      }

      setHablando(true);
      conPlazo(audioDe(limpio), FISH_ESPERA_MS)
        .then((archivo) => {
          if (miTurno !== turno.current) return;
          r.replace(archivo.uri);
          r.play();
        })
        .catch((e: unknown) => {
          if (miTurno !== turno.current) return; // lo cortó detener() o una frase nueva
          console.warn('[voz] Fish no respondió; habla el teléfono:', e);
          delTelefono(limpio, miTurno);
        });
    },
    [callar, delTelefono],
  );

  const detener = useCallback(() => {
    callar();
    setHablando(false);
  }, [callar]);

  useEffect(() => {
    if (usarFish) {
      // Listo desde el principio: crear el reproductor recién al hablar suma demora.
      const r = createAudioPlayer(null);
      r.volume = 1;
      const sub = r.addListener('playbackStatusUpdate', (estado) => {
        if (estado.didJustFinish) setHablando(false);
      });
      reproductor.current = r;
      // Que suene aunque el teléfono esté en silencio o vibración: es la voz de la persona sorda.
      void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
      return () => {
        turno.current += 1;
        void Speech.stop();
        sub.remove();
        r.remove();
        reproductor.current = null;
      };
    }
    return () => {
      turno.current += 1;
      void Speech.stop();
    };
  }, []);

  return { hablar, preparar, detener, hablando };
}
