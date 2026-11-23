/**
 * Operaciones puras sobre el texto transcrito (espacio y borrado).
 */

import { buscarFraseExacta, type Frase } from './frases';

interface Coincidencia {
  inicio: number;
  frase: Frase;
}

/**
 * Busca el sufijo más largo que sea una frase exacta del catálogo. Solo mira
 * límites de palabra: "HOLA BUENOS DIAS" encuentra "BUENOS DIAS", no "DIAS".
 */
function fraseAlFinal(texto: string): Coincidencia | null {
  for (let i = 0; i < texto.length; i += 1) {
    if (i > 0 && texto[i - 1] !== ' ') continue;
    const sufijo = texto.slice(i);
    if (!sufijo) continue;
    const frase = buscarFraseExacta(sufijo);
    if (!frase) continue;

    // No borrar un '¿' o '¡' que el usuario escribió si la frase del catálogo
    // no lo lleva: "¿HOLA" debe quedar "¿HOLA", no "HOLA".
    if (
      (sufijo.startsWith('¿') || sufijo.startsWith('¡')) &&
      !frase.texto.startsWith(sufijo[0])
    ) {
      continue;
    }

    return { inicio: i, frase };
  }
  return null;
}

/**
 * Corrige tildes, signos de apertura y mayúsculas de las frases del catálogo
 * que estén al final del texto, conservando lo que haya antes. Es recursivo
 * porque un texto puede terminar en varias frases: "BUENOS DIAS COMO ESTAS"
 * se convierte en "BUENOS DÍAS ¿CÓMO ESTÁS?".
 */
function normalizarSufijos(texto: string): string {
  const recortado = texto.replace(/\s+$/, '');
  if (!recortado) return '';

  const encontrada = fraseAlFinal(recortado);
  if (!encontrada) return recortado;

  const prefijo = recortado.slice(0, encontrada.inicio);
  const prefijoLimpio = prefijo.replace(/\s+$/, '');
  const separador = prefijo.slice(prefijoLimpio.length);

  return `${prefijoLimpio ? normalizarSufijos(prefijoLimpio) : ''}${separador}${
    encontrada.frase.texto
  }`;
}

/**
 * Agrega un espacio, sin duplicarlo si ya hay uno al final. Antes de cerrar la
 * palabra, si lo escrito coincide con una frase del catálogo, la completa con
 * su forma correcta: "BUENOS DIAS" + espacio → "BUENOS DÍAS ".
 */
export function aplicarEspacio(texto: string): string {
  if (!texto || texto.endsWith(' ')) return texto;

  const recortado = texto.replace(/\s+$/, '');
  // Preserva la puntuación que escribió el usuario. Si la frase del catálogo
  // ya termina con ese signo (¿CÓMO ESTÁS?), no lo duplica.
  const fin = recortado.match(/[.,;:?!]+$/)?.[0] ?? '';
  const cuerpo = fin ? recortado.slice(0, -fin.length) : recortado;
  const normalizado = normalizarSufijos(cuerpo);

  if (!fin) return `${normalizado} `;
  const repetido = normalizado.endsWith(fin);
  return `${normalizado}${repetido ? '' : fin} `;
}

/** Borra el último carácter (incluido un espacio). */
export function borrarUltimo(texto: string): string {
  return texto.slice(0, -1);
}
