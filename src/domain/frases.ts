/**
 * Catálogo de frases y motor de sugerencias del guante.
 *
 * La idea de la etapa estática: el guante puede mandar letras sueltas
 * (`S:A|95`) o una seña ya aprendida que representa una palabra/frase
 * (`S:BUENOS DÍAS|97`). La app acumula el texto y, mientras se escribe,
 * propone frases del catálogo. Al tocar una sugerencia se completa con la
 * versión correcta (tildes, signos de apertura, mayúsculas).
 *
 * Nada de esto persiste: es estado en memoria, igual que el resto del MVP.
 */

export type CategoriaFrase =
  | 'saludo'
  | 'pregunta'
  | 'respuesta'
  | 'despedida'
  | 'cortesia'
  | 'ayuda';

export interface Frase {
  id: string;
  texto: string;
  categoria: CategoriaFrase;
  /** Otras formas de nombrar la misma frase (se normalizan antes de comparar). */
  alias?: readonly string[];
}

export const CATEGORIAS: readonly CategoriaFrase[] = [
  'saludo',
  'pregunta',
  'respuesta',
  'despedida',
  'cortesia',
  'ayuda',
];

export const ETIQUETAS_CATEGORIA: Record<CategoriaFrase, string> = {
  saludo: 'Saludos',
  pregunta: 'Preguntas',
  respuesta: 'Respuestas',
  despedida: 'Despedidas',
  cortesia: 'Cortesía',
  ayuda: 'Ayuda',
};

export const FRASES: readonly Frase[] = [
  // Saludos
  { id: 'hola', texto: 'HOLA', categoria: 'saludo' },
  { id: 'buenos-dias', texto: 'BUENOS DÍAS', categoria: 'saludo' },
  { id: 'buenas-tardes', texto: 'BUENAS TARDES', categoria: 'saludo' },
  { id: 'buenas-noches', texto: 'BUENAS NOCHES', categoria: 'saludo' },
  { id: 'como-estas', texto: '¿CÓMO ESTÁS?', categoria: 'saludo' },
  { id: 'que-tal', texto: '¿QUÉ TAL?', categoria: 'saludo' },
  { id: 'gusto-conocerte', texto: 'GUSTO EN CONOCERTE', categoria: 'saludo' },

  // Preguntas
  { id: 'estas-bien', texto: '¿ESTÁS BIEN?', categoria: 'pregunta' },
  { id: 'necesitas-ayuda', texto: '¿NECESITAS AYUDA?', categoria: 'pregunta' },
  { id: 'puedes-repetir', texto: '¿PUEDES REPETIR?', categoria: 'pregunta' },
  { id: 'que-hora-es', texto: '¿QUÉ HORA ES?', categoria: 'pregunta' },
  { id: 'donde-bano', texto: '¿DÓNDE ESTÁ EL BAÑO?', categoria: 'pregunta' },
  { id: 'me-entiendes', texto: '¿ME ENTIENDES?', categoria: 'pregunta' },
  { id: 'tienes-hambre', texto: '¿TIENES HAMBRE?', categoria: 'pregunta' },

  // Respuestas
  { id: 'estoy-bien', texto: 'ESTOY BIEN', categoria: 'respuesta' },
  {
    id: 'estoy-bien-gracias',
    texto: 'ESTOY BIEN, GRACIAS',
    categoria: 'respuesta',
  },
  { id: 'no-entiendo', texto: 'NO ENTIENDO', categoria: 'respuesta' },
  { id: 'si', texto: 'SÍ', categoria: 'respuesta' },
  { id: 'no', texto: 'NO', categoria: 'respuesta' },
  {
    id: 'un-momento',
    texto: 'UN MOMENTO, POR FAVOR',
    categoria: 'respuesta',
  },
  { id: 'tengo-pregunta', texto: 'TENGO UNA PREGUNTA', categoria: 'respuesta' },

  // Despedidas
  { id: 'adios', texto: 'ADIÓS', categoria: 'despedida' },
  { id: 'hasta-luego', texto: 'HASTA LUEGO', categoria: 'despedida' },
  { id: 'nos-vemos', texto: 'NOS VEMOS', categoria: 'despedida' },
  { id: 'hasta-manana', texto: 'HASTA MAÑANA', categoria: 'despedida' },

  // Cortesía
  { id: 'gracias', texto: 'GRACIAS', categoria: 'cortesia' },
  { id: 'por-favor', texto: 'POR FAVOR', categoria: 'cortesia' },
  { id: 'perdon', texto: 'PERDÓN', categoria: 'cortesia' },
  { id: 'de-nada', texto: 'DE NADA', categoria: 'cortesia' },

  // Ayuda
  { id: 'necesito-ayuda', texto: 'NECESITO AYUDA', categoria: 'ayuda' },
  { id: 'llamen-medico', texto: 'LLAMEN A UN MÉDICO', categoria: 'ayuda' },
  { id: 'estoy-perdido', texto: 'ESTOY PERDIDO', categoria: 'ayuda' },
  { id: 'tengo-dolor', texto: 'TENGO DOLOR', categoria: 'ayuda' },
  { id: 'no-puedo-hablar', texto: 'NO PUEDO HABLAR', categoria: 'ayuda' },
];

export const FRASES_POR_ID: ReadonlyMap<string, Frase> = new Map(
  FRASES.map((f) => [f.id, f]),
);

/** Equivalencias sin tildes. Evita depender de String.normalize en Hermes. */
const SIN_TILDE: Record<string, string> = {
  Á: 'A',
  É: 'E',
  Í: 'I',
  Ó: 'O',
  Ú: 'U',
  Ü: 'U',
  Ñ: 'N',
};

/**
 * Normaliza para comparar: mayúsculas, sin tildes, sin signos, espacios
 * simples. No se usa para mostrar: el texto bonito vive en `Frase.texto`.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÜÑ]/g, (c) => SIN_TILDE[c] ?? c)
    .replace(/[¿?¡!.,;:()"'\-–—\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const INDICE_FRASES: ReadonlyMap<string, Frase> = (() => {
  const indice = new Map<string, Frase>();
  for (const frase of FRASES) {
    indice.set(normalizarTexto(frase.texto), frase);
    for (const alias of frase.alias ?? []) {
      indice.set(normalizarTexto(alias), frase);
    }
  }
  return indice;
})();

/** Devuelve la frase del catálogo que coincide exactamente (sin tildes/signos). */
export function buscarFraseExacta(texto: string): Frase | null {
  return INDICE_FRASES.get(normalizarTexto(texto)) ?? null;
}

export function frasePorId(id: string): Frase | null {
  return FRASES_POR_ID.get(id) ?? null;
}

/**
 * Convierte el nombre que llega en `S:...` al fragmento que se agrega al texto.
 * - Letra suelta -> una letra.
 * - Palabra/frase aprendida -> la versión bonita del catálogo + un espacio.
 */
export function textoDeReconocimiento(nombre: string): string {
  const limpio = nombre.trim();
  if (!limpio) return '';
  if (limpio.length === 1) return limpio.toUpperCase();
  const frase = buscarFraseExacta(limpio);
  return `${frase ? frase.texto : limpio} `;
}

export type TipoSugerencia = 'frase' | 'palabra';

export interface SugerenciaFrase {
  frase: Frase;
  /** `frase`: lo escrito ya es prefijo; `palabra`: coincide una palabra. */
  tipo: TipoSugerencia;
}

/**
 * Sugerencias para el texto que se está escribiendo.
 *
 * - Si el texto completo ya es prefijo de una frase, se ofrece completarla.
 * - Si la última palabra escrita coincide con el inicio de alguna palabra de
 *   la frase, también se ofrece (así "BUE" sugiere "BUENOS DÍAS").
 * - Si el texto ya coincide pero le faltan tildes/signos, se ofrece la versión
 *   correcta del catálogo.
 */
export function sugerirFrases(texto: string, limite = 4): SugerenciaFrase[] {
  const normalizado = normalizarTexto(texto);
  if (normalizado.length < 2) return [];

  const palabras = normalizado.split(' ').filter(Boolean);
  const ultima = palabras[palabras.length - 1] ?? '';
  if (ultima.length < 2) return [];

  const candidatas: { sugerencia: SugerenciaFrase; puntaje: number; orden: number }[] = [];

  FRASES.forEach((frase, orden) => {
    const objetivo = normalizarTexto(frase.texto);

    if (objetivo === normalizado) {
      // Misma frase pero el texto visible no tiene tildes/signos: ofrecer arreglo.
      if (frase.texto !== texto.trim()) {
        candidatas.push({
          sugerencia: { frase, tipo: 'frase' },
          puntaje: 200,
          orden,
        });
      }
      return;
    }

    let puntaje = 0;
    let tipo: TipoSugerencia = 'palabra';

    if (normalizado.length >= 3 && objetivo.startsWith(normalizado)) {
      puntaje = 150 + normalizado.length;
      tipo = 'frase';
    } else if (objetivo.split(' ').some((palabra) => palabra.startsWith(ultima))) {
      puntaje = 50 + ultima.length;
    }

    if (puntaje > 0) {
      candidatas.push({ sugerencia: { frase, tipo }, puntaje, orden });
    }
  });

  candidatas.sort((a, b) => b.puntaje - a.puntaje || a.orden - b.orden);
  return candidatas.slice(0, limite).map((c) => c.sugerencia);
}

/**
 * Reemplaza la última palabra por la frase elegida, conservando lo anterior.
 * Si todo el texto ya era prefijo de la frase, la reemplaza completa.
 */
export function completarConFrase(texto: string, frase: Frase): string {
  const normalizado = normalizarTexto(texto);
  const objetivo = normalizarTexto(frase.texto);

  if (normalizado.length >= 2 && objetivo.startsWith(normalizado)) {
    return `${frase.texto} `;
  }

  const inicioUltima = texto.search(/\S*$/);
  const prefijo = inicioUltima > 0 ? texto.slice(0, inicioUltima) : '';
  return `${prefijo}${frase.texto} `;
}

/** Agrega una frase completa al final, sin duplicar el espacio separador. */
export function agregarFrase(texto: string, frase: Frase): string {
  const base = texto.replace(/\s+$/, '');
  return `${base ? `${base} ` : ''}${frase.texto} `;
}

export interface Guion {
  id: string;
  titulo: string;
  descripcion: string;
  /** Ids de `FRASES`, en el orden en que se van a "deletrear". */
  frases: readonly string[];
}

export const GUIONES: readonly Guion[] = [
  {
    id: 'saludo',
    titulo: 'Saludo',
    descripcion: 'Buenos días → ¿Cómo estás? → ¿Estás bien?',
    frases: ['buenos-dias', 'como-estas', 'estas-bien'],
  },
  {
    id: 'conversacion',
    titulo: 'Conversación',
    descripcion: 'Saludo, respuesta y despedida',
    frases: ['hola', 'como-estas', 'estoy-bien-gracias', 'adios'],
  },
  {
    id: 'ayuda',
    titulo: 'Pedir ayuda',
    descripcion: 'Frases de emergencia',
    frases: ['necesito-ayuda', 'llamen-medico', 'tengo-dolor'],
  },
];
