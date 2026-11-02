/**
 * Fila de sugerencias de frases. Se usa en la sesión real y en el modo
 * práctica: el motor de `domain/frases` no sabe de dónde viene el texto.
 */

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Frase, SugerenciaFrase } from '@/domain/frases';

interface Props {
  sugerencias: SugerenciaFrase[];
  onElegir: (frase: Frase) => void;
}

export function SugerenciasFrases({ sugerencias, onElegir }: Props) {
  if (sugerencias.length === 0) return null;

  return (
    <View style={styles.bloque}>
      <Text style={styles.titulo}>Sugerencias</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.fila}
      >
        {sugerencias.map(({ frase, tipo }) => (
          <Pressable
            key={frase.id}
            onPress={() => onElegir(frase)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPulsado]}
            accessibilityRole="button"
            accessibilityLabel={`Completar con ${frase.texto}`}
          >
            <Text style={styles.chipTexto}>{frase.texto}</Text>
            <Text style={styles.chipTipo}>
              {tipo === 'frase' ? 'frase' : 'palabra'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bloque: {
    gap: 6,
  },
  titulo: {
    color: '#7a7a7a',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fila: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#3b3b3b',
    backgroundColor: '#161616',
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipPulsado: {
    backgroundColor: '#262626',
  },
  chipTexto: {
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: '600',
  },
  chipTipo: {
    color: '#7f8c8d',
    fontSize: 10,
    textTransform: 'uppercase',
  },
});
