/**
 * Sistema visual de Tinkuy (misma paleta grafito + amarillo que guante-nexa.netlify.app).
 * Dos voces, dos colores:
 *   amarillo → lo que firma la persona sorda (los puntos de la mano del logo)
 *   acero azul → lo que dice la voz del oyente
 * Todo lo demás (superficies grafito, texto) es neutro para que el color siempre
 * signifique "quién habla".
 */

export const COLOR = {
  abismo: '#0F1012',
  capa: 'rgba(24, 25, 28, 0.72)',
  capaFuerte: 'rgba(24, 25, 28, 0.94)',
  borde: 'rgba(255, 255, 255, 0.09)',
  brillo: 'rgba(255, 255, 255, 0.22)',
  punto: 'rgba(255, 255, 255, 0.07)',
  hueso: '#8A8F99',
  texto: '#ECEEF1',
  suave: '#9EA4AE',
  tenue: '#6E747E',
  guante: '#F5B800',
  guanteSuave: 'rgba(245, 184, 0, 0.13)',
  guanteBorde: 'rgba(245, 184, 0, 0.45)',
  sobreGuante: '#17191D',
  voz: '#9DB2D6',
  vozSuave: 'rgba(157, 178, 214, 0.14)',
  vozBorde: 'rgba(157, 178, 214, 0.45)',
  aviso: '#FFB067',
  coral: '#FF6B5E',
  coralSuave: 'rgba(255, 107, 94, 0.16)',
  coralBorde: 'rgba(255, 107, 94, 0.4)',
  verde: '#3DD68C',
} as const;

export const FUENTE = {
  normal: 'SchibstedGrotesk_500Medium',
  negrita: 'SchibstedGrotesk_700Bold',
  display: 'SchibstedGrotesk_800ExtraBold',
} as const;

export type Fuente = 'guante' | 'voz';

export const ACENTO: Record<
  Fuente,
  { color: string; suave: string; borde: string; nombre: string }
> = {
  guante: {
    color: COLOR.guante,
    suave: COLOR.guanteSuave,
    borde: COLOR.guanteBorde,
    nombre: 'Señas',
  },
  voz: {
    color: COLOR.voz,
    suave: COLOR.vozSuave,
    borde: COLOR.vozBorde,
    nombre: 'Voz',
  },
};
