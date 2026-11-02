/**
 * Estado del modo práctica: mismo texto en memoria que la sesión real, pero
 * alimentado por toques en pantalla en vez de notificaciones BLE.
 *
 * No simula sensores ni confianza real: la confianza es un número estable
 * derivado de la letra/frase, solo para que la UI tenga algo coherente que
 * mostrar. La etiqueta "SIMULADO" de la pantalla lo deja claro.
 */

import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';

import {
  agregarFrase,
  completarConFrase,
  sugerirFrases,
  type Frase,
  type SugerenciaFrase,
} from '@/domain/frases';
import { aplicarEspacio, aplicarLetra, borrarUltimo } from '@/domain/transcripcion';

export interface PracticaEstado {
  texto: string;
  confianza: number | null;
  ultimoEvento: string | null;
  sugerencias: SugerenciaFrase[];
  pulsarLetra: (letra: string) => void;
  pulsarEspacio: () => void;
  pulsarBorrar: () => void;
  limpiar: () => void;
  enviarFrase: (frase: Frase) => void;
  completar: (frase: Frase) => void;
}

function vibrar(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Pseudo-confianza 93–99 %, estable para la misma letra/frase. */
function confianzaDe(semilla: string): number {
  let suma = 0;
  for (let i = 0; i < semilla.length; i += 1) {
    suma += semilla.charCodeAt(i);
  }
  return 93 + (suma % 7);
}

export function usePractica(): PracticaEstado {
  const [texto, setTexto] = useState('');
  const [confianza, setConfianza] = useState<number | null>(null);
  const [ultimoEvento, setUltimoEvento] = useState<string | null>(null);

  const pulsarLetra = useCallback((letra: string) => {
    setTexto((previo) => aplicarLetra(previo, letra));
    const valor = confianzaDe(letra);
    setConfianza(valor);
    setUltimoEvento(`Letra ${letra.toUpperCase()} · ${valor}% (simulada)`);
    vibrar();
  }, []);

  const pulsarEspacio = useCallback(() => {
    setTexto((previo) => aplicarEspacio(previo));
    setUltimoEvento('Espacio');
    vibrar();
  }, []);

  const pulsarBorrar = useCallback(() => {
    setTexto((previo) => borrarUltimo(previo));
    setUltimoEvento('Borrar');
    vibrar();
  }, []);

  const limpiar = useCallback(() => {
    setTexto('');
    setConfianza(null);
    setUltimoEvento('Texto borrado');
  }, []);

  const enviarFrase = useCallback((frase: Frase) => {
    setTexto((previo) => agregarFrase(previo, frase));
    const valor = confianzaDe(frase.id);
    setConfianza(valor);
    setUltimoEvento(`Frase «${frase.texto}» · ${valor}% (simulada)`);
    vibrar();
  }, []);

  const completar = useCallback((frase: Frase) => {
    setTexto((previo) => completarConFrase(previo, frase));
    const valor = confianzaDe(frase.id);
    setConfianza(valor);
    setUltimoEvento(`Sugerencia «${frase.texto}» · ${valor}% (simulada)`);
    vibrar();
  }, []);

  const sugerencias = useMemo(() => sugerirFrases(texto), [texto]);

  return {
    texto,
    confianza,
    ultimoEvento,
    sugerencias,
    pulsarLetra,
    pulsarEspacio,
    pulsarBorrar,
    limpiar,
    enviarFrase,
    completar,
  };
}
