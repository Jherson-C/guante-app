/**
 * Iconos vectoriales propios (trazo de 2 px, esquinas redondeadas). Una sola
 * gramática para toda la app en lugar de emojis, que cambian según el teléfono.
 */

import Svg, { Path, Rect } from 'react-native-svg';

import { COLOR } from '@/constants/tema';

export type NombreIcono =
  | 'atras'
  | 'mic'
  | 'voz'
  | 'borrar'
  | 'apagar'
  | 'mano'
  | 'senales'
  | 'parar'
  | 'cerrar';

const TRAZOS: Record<Exclude<NombreIcono, 'parar'>, readonly string[]> = {
  atras: ['M19 12H5', 'M12 19l-7-7 7-7'],
  mic: [
    'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z',
    'M19 10v2a7 7 0 0 1-14 0v-2',
    'M12 19v3',
  ],
  voz: [
    'M11 5 6 9H2v6h4l5 4V5Z',
    'M15.54 8.46a5 5 0 0 1 0 7.07',
    'M19.07 4.93a10 10 0 0 1 0 14.14',
  ],
  borrar: [
    'M3 6h18',
    'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6',
    'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2',
    'M10 11v6',
    'M14 11v6',
  ],
  apagar: ['M18.36 6.64a9 9 0 1 1-12.73 0', 'M12 2v10'],
  mano: [
    'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2',
    'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2',
    'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8',
    'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  ],
  senales: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  cerrar: ['M18 6 6 18', 'M6 6l12 12'],
};

interface Props {
  nombre: NombreIcono;
  tamano?: number;
  color?: string;
  grosor?: number;
}

export function Icono({ nombre, tamano = 22, color = COLOR.texto, grosor = 2 }: Props) {
  return (
    <Svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {nombre === 'parar' ? (
        <Rect x={6} y={6} width={12} height={12} rx={2.5} fill={color} />
      ) : (
        TRAZOS[nombre].map((d) => <Path key={d} d={d} />)
      )}
    </Svg>
  );
}
