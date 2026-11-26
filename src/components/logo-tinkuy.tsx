/**
 * Logo de Tinkuy: la mano de 21 puntos (como la ve la cámara), con huesos grises
 * y articulaciones amarillas. Es el mismo dibujo del ícono de la app.
 */

import Svg, { Circle, G, Line } from 'react-native-svg';

import { COLOR } from '@/constants/tema';

// Muñeca, pulgar(4), índice(4), medio(4), anular(4), meñique(4), en una caja de 100x100.
const P: readonly (readonly [number, number])[] = [
  [50, 77.1],
  [42.2, 71.8], [36.3, 65.2], [32, 59.8], [28.5, 54.7],
  [43.6, 54.3], [42.2, 44.7], [41.4, 38.9], [40.8, 33.4],
  [50.6, 52.7], [50.8, 42], [50.9, 35.5], [51, 29.5],
  [57.4, 54.3], [59, 44.7], [59.8, 39.1], [60.4, 34.2],
  [63.3, 58.4], [66, 51], [67.4, 46.3], [68.7, 42],
];
const HUESOS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];
const PUNTAS = new Set([4, 8, 12, 16, 20]);

interface Props {
  tamano?: number;
  color?: string;
  hueso?: string;
}

export function LogoTinkuy({ tamano = 32, color = COLOR.guante, hueso = COLOR.hueso }: Props) {
  // Recorta el aire alrededor de la mano para que llene el espacio que se le da.
  return (
    <Svg width={tamano} height={tamano} viewBox="20.6 25.3 56 56">
      <G stroke={hueso} strokeWidth={1.7} strokeLinecap="round">
        {HUESOS.map(([a, b]) => (
          <Line key={`${a}-${b}`} x1={P[a][0]} y1={P[a][1]} x2={P[b][0]} y2={P[b][1]} />
        ))}
      </G>
      {P.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={PUNTAS.has(i) ? 3 : i === 0 ? 2.3 : 1.9} fill={color} />
      ))}
    </Svg>
  );
}
