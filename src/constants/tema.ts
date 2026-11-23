/**
 * Sistema visual de la app. Dos voces, dos colores:
 *   cian  → lo que firma el guante
 *   ámbar → lo que dice la voz
 * Todo lo demás (superficies, texto) es neutro para que el color siempre
 * signifique "quién habla".
 */

export const COLOR = {
  abismo: '#060A11',
  capa: 'rgba(16, 26, 42, 0.62)',
  capaFuerte: 'rgba(20, 32, 52, 0.88)',
  borde: 'rgba(170, 205, 255, 0.14)',
  brillo: 'rgba(255, 255, 255, 0.16)',
  texto: '#EDF3FA',
  suave: '#9AA9BD',
  tenue: '#66768C',
  guante: '#29D9F2',
  guanteSuave: 'rgba(41, 217, 242, 0.14)',
  guanteBorde: 'rgba(41, 217, 242, 0.42)',
  voz: '#FFB54A',
  vozSuave: 'rgba(255, 181, 74, 0.14)',
  vozBorde: 'rgba(255, 181, 74, 0.42)',
  coral: '#FF5D5D',
  coralSuave: 'rgba(255, 93, 93, 0.16)',
  verde: '#2FD08F',
} as const;

export const FUENTE = {
  normal: 'BricolageGrotesque_500Medium',
  negrita: 'BricolageGrotesque_700Bold',
  display: 'BricolageGrotesque_800ExtraBold',
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
    nombre: 'Guante',
  },
  voz: {
    color: COLOR.voz,
    suave: COLOR.vozSuave,
    borde: COLOR.vozBorde,
    nombre: 'Voz',
  },
};
