/**
 * Texto que se muestra "por turnos": a medida que llega texto nuevo se agrega
 * a lo visible, y si pasa `ms` sin cambios se borra solo. El texto original
 * (el estado global del guante) no se toca; esto es solo la vista.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface TextoTransitorio {
  visible: string;
  limpiar: () => void;
}

export function useTextoTransitorio(texto: string, ms = 8000): TextoTransitorio {
  const [visible, setVisible] = useState('');
  const offsetRef = useRef(texto.length);

  useEffect(() => {
    if (texto.length < offsetRef.current) {
      // Se borró o reemplazó el texto: empezar de cero sin mostrar el historial.
      offsetRef.current = texto.length;
      setVisible('');
      return;
    }

    if (texto.length > offsetRef.current) {
      const nuevo = texto.slice(offsetRef.current);
      offsetRef.current = texto.length;
      setVisible((previo) => previo + nuevo);
    }
  }, [texto]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setVisible('');
      offsetRef.current = texto.length;
    }, ms);
    return () => clearTimeout(timer);
  }, [visible, texto.length, ms]);

  const limpiar = useCallback(() => {
    setVisible('');
    offsetRef.current = texto.length;
  }, [texto.length]);

  return { visible, limpiar };
}
