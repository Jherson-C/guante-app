/**
 * Abecedario dactilológico español (27 letras) para el modo práctica.
 *
 * En el guante real, con los 5 flex y sin modelo entrenado, solo se pueden
 * distinguir poses estáticas. Las letras J, Ñ y Z se trazan en el aire:
 * necesitan el giroscopio y una ventana de movimiento, no una plantilla de
 * pose. Aquí se incluyen igual para poder construir y probar frases completas
 * sin depender del dataset.
 */

export type TipoArticulacion = 'estatica' | 'movimiento';

export interface LetraAbecedario {
  letra: string;
  tipo: TipoArticulacion;
  /** Solo en las letras que se trazan en el aire. */
  nota?: string;
}

export const ABECEDARIO: readonly LetraAbecedario[] = [
  { letra: 'A', tipo: 'estatica' },
  { letra: 'B', tipo: 'estatica' },
  { letra: 'C', tipo: 'estatica' },
  { letra: 'D', tipo: 'estatica' },
  { letra: 'E', tipo: 'estatica' },
  { letra: 'F', tipo: 'estatica' },
  { letra: 'G', tipo: 'estatica' },
  { letra: 'H', tipo: 'estatica' },
  { letra: 'I', tipo: 'estatica' },
  { letra: 'J', tipo: 'movimiento', nota: 'Se traza en el aire' },
  { letra: 'K', tipo: 'estatica' },
  { letra: 'L', tipo: 'estatica' },
  { letra: 'M', tipo: 'estatica' },
  { letra: 'N', tipo: 'estatica' },
  { letra: 'Ñ', tipo: 'movimiento', nota: 'Como la N, con movimiento' },
  { letra: 'O', tipo: 'estatica' },
  { letra: 'P', tipo: 'estatica' },
  { letra: 'Q', tipo: 'estatica' },
  { letra: 'R', tipo: 'estatica' },
  { letra: 'S', tipo: 'estatica' },
  { letra: 'T', tipo: 'estatica' },
  { letra: 'U', tipo: 'estatica' },
  { letra: 'V', tipo: 'estatica' },
  { letra: 'W', tipo: 'estatica' },
  { letra: 'X', tipo: 'estatica' },
  { letra: 'Y', tipo: 'estatica' },
  { letra: 'Z', tipo: 'movimiento', nota: 'Se traza en el aire' },
];

export const LETRAS = ABECEDARIO.map((l) => l.letra);

export const LETRAS_ESTATICAS = ABECEDARIO.filter(
  (l) => l.tipo === 'estatica',
).map((l) => l.letra);

export const LETRAS_MOVIMIENTO = ABECEDARIO.filter(
  (l) => l.tipo === 'movimiento',
).map((l) => l.letra);

/** Signos que no son letras pero hacen falta para escribir frases. */
export const SIGNOS = ['¿', '?', '¡', '!', ',', '.'] as const;

export const TOTAL_LETRAS = ABECEDARIO.length;
