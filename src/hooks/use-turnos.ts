/**
 * El hilo de la conversación: une lo que firma el guante y lo que dice la voz
 * en una sola lista de turnos, en el orden en que ocurrieron.
 *
 * - Guante: el estado global `texto` solo crece letra a letra. Se muestra como
 *   turno "vivo" lo escrito desde el último cierre y, tras una pausa sin señas
 *   (o apenas alguien empieza a hablar), ese texto pasa al historial.
 * - Voz: cada frase final del reconocedor es un turno; lo parcial es el turno vivo.
 *
 * El turno vivo se deriva con `texto.slice(inicio)` en vez de acumular diferencias,
 * así las correcciones de tildes y signos que hace `aplicarEspacio` se ven bien.
 * Todo queda en memoria.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Fuente } from '@/constants/tema';

export interface Turno {
  id: number;
  fuente: Fuente;
  texto: string;
  hora: number;
}

const MAX_TURNOS = 40;
const PAUSA_GUANTE_MS = 2000;

interface Opciones {
  /** Texto acumulado por el guante (`useGuante().texto`). */
  texto: string;
  /** Lo que dice la voz en este momento, sin cerrar. */
  parcial: string;
  /** Se llama cuando un turno del guante pasa al historial. */
  alCerrarGuante?: (texto: string) => void;
}

export interface HiloTurnos {
  turnos: Turno[];
  guanteVivo: string;
  agregarVoz: (texto: string) => void;
  cerrarGuante: () => void;
  limpiar: () => void;
}

export function useTurnos({ texto, parcial, alCerrarGuante }: Opciones): HiloTurnos {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [inicio, setInicio] = useState(0);
  const siguienteId = useRef(0);
  const alCerrarRef = useRef(alCerrarGuante);

  useEffect(() => {
    alCerrarRef.current = alCerrarGuante;
  });

  // El texto del guante se borró por fuera (LIMPIAR / BORRAR): reajusta el inicio
  // durante el render, para no mostrar un cuadro con datos viejos.
  if (texto.length < inicio) setInicio(texto.length);

  const guanteVivo = texto.length < inicio ? '' : texto.slice(inicio).trim();

  const agregar = useCallback((fuente: Fuente, contenido: string) => {
    const limpio = contenido.trim();
    if (!limpio) return;
    siguienteId.current += 1;
    const turno: Turno = {
      id: siguienteId.current,
      fuente,
      texto: limpio,
      hora: Date.now(),
    };
    setTurnos((previos) => [...previos, turno].slice(-MAX_TURNOS));
  }, []);

  const agregarVoz = useCallback((contenido: string) => agregar('voz', contenido), [agregar]);

  const longitud = texto.length;
  const cerrarGuante = useCallback(() => {
    if (guanteVivo) {
      agregar('guante', guanteVivo);
      alCerrarRef.current?.(guanteVivo);
    }
    setInicio(longitud);
  }, [guanteVivo, longitud, agregar]);

  const limpiar = useCallback(() => {
    setTurnos([]);
    setInicio(longitud);
  }, [longitud]);

  // El turno vivo del guante pasa al historial tras una pausa sin señas, o de
  // inmediato si alguien empieza a hablar (para que los turnos no se mezclen).
  useEffect(() => {
    if (!guanteVivo) return;
    const timer = setTimeout(cerrarGuante, parcial ? 0 : PAUSA_GUANTE_MS);
    return () => clearTimeout(timer);
  }, [guanteVivo, parcial, cerrarGuante]);

  return { turnos, guanteVivo, agregarVoz, cerrarGuante, limpiar };
}
