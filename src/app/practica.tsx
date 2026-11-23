/**
 * Modo práctica: la etapa estática de la app.
 *
 * No usa Bluetooth ni sensores. Sirve para tres cosas mientras el guante no
 * está soldado:
 *   1. Probar el abecedario completo (27 letras) y los signos de puntuación.
 *   2. Probar frases completas, tanto deletreadas como enviadas de una sola vez.
 *   3. Reproducir un guion de conversación letra por letra para una demo.
 *
 * El texto y la confianza son simulados; la pantalla lo dice explícitamente
 * para que nadie confunda esto con un reconocimiento real.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cristal } from '@/components/cristal';
import { Fondo } from '@/components/fondo';
import { Icono } from '@/components/icono';
import { SugerenciasFrases } from '@/components/sugerencias-frases';
import { COLOR, FUENTE } from '@/constants/tema';
import { ABECEDARIO, LETRAS_MOVIMIENTO, SIGNOS } from '@/domain/abecedario';
import {
  CATEGORIAS,
  ETIQUETAS_CATEGORIA,
  FRASES,
  GUIONES,
  frasePorId,
  type Frase,
  type Guion,
} from '@/domain/frases';
import { usePractica } from '@/hooks/use-practica';

type Pestana = 'letras' | 'frases' | 'guion';

const PESTANAS: readonly { valor: Pestana; etiqueta: string }[] = [
  { valor: 'letras', etiqueta: 'Letras' },
  { valor: 'frases', etiqueta: 'Frases' },
  { valor: 'guion', etiqueta: 'Guion' },
];

interface TokenReproduccion {
  cancelado: boolean;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function Practica() {
  const {
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
  } = usePractica();

  const [pestana, setPestana] = useState<Pestana>('letras');
  const [reproduciendoId, setReproduciendoId] = useState<string | null>(null);
  const tokenRef = useRef<TokenReproduccion | null>(null);

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const columnas = 6;
  const anchoUtil = Math.max(240, Math.min(width - 40 - insets.left - insets.right, 520));
  const anchoTecla = Math.min(
    56,
    Math.max(38, Math.floor((anchoUtil - 6 * (columnas - 1)) / columnas)),
  );

  const grupos = useMemo(
    () =>
      CATEGORIAS.map((categoria) => ({
        categoria,
        frases: FRASES.filter((frase) => frase.categoria === categoria),
      })).filter((grupo) => grupo.frases.length > 0),
    [],
  );

  const detener = useCallback(() => {
    if (tokenRef.current) tokenRef.current.cancelado = true;
    tokenRef.current = null;
    setReproduciendoId(null);
  }, []);

  const escribir = useCallback(
    (accion: () => void) => {
      if (tokenRef.current) detener();
      accion();
    },
    [detener],
  );

  const reproducir = useCallback(
    async (guion: Guion) => {
      detener();
      const token: TokenReproduccion = { cancelado: false };
      tokenRef.current = token;
      setReproduciendoId(guion.id);
      limpiar();
      await esperar(450);

      for (const id of guion.frases) {
        if (token.cancelado) return;
        const frase = frasePorId(id);
        if (!frase) continue;

        for (const caracter of frase.texto) {
          if (token.cancelado) return;
          if (caracter === ' ') pulsarEspacio();
          else pulsarLetra(caracter);
          await esperar(180);
        }
        // Cierra la frase con un espacio y normaliza tildes/signos.
        pulsarEspacio();
        await esperar(1100);
      }

      if (token.cancelado) return;
      tokenRef.current = null;
      setReproduciendoId(null);
    },
    [detener, limpiar, pulsarEspacio, pulsarLetra],
  );

  // Si se sale de la pantalla, el guion en curso no debe seguir escribiendo.
  useEffect(
    () => () => {
      if (tokenRef.current) tokenRef.current.cancelado = true;
    },
    [],
  );

  const salir = useCallback(() => {
    detener();
    router.replace('/');
  }, [detener]);

  return (
    <View style={styles.raiz}>
      <Fondo activo={texto ? 'guante' : null} />

      <View
        style={[
          styles.marco,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 14),
            paddingLeft: Math.max(insets.left, 16),
            paddingRight: Math.max(insets.right, 16),
          },
        ]}
      >
        <View style={styles.cabecera}>
          <Pressable
            onPress={salir}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Salir del modo práctica"
          >
            <Cristal style={styles.redondo}>
              <Icono nombre="atras" tamano={20} />
            </Cristal>
          </Pressable>
          <Cristal style={styles.insignia}>
            <View style={styles.puntoSimulado} />
            <Text style={styles.insigniaTexto}>Práctica · simulado</Text>
          </Cristal>
        </View>

        <Cristal fuerte tinte={COLOR.guanteBorde} style={styles.textoZona}>
          <Text
            style={styles.texto}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.35}
            accessibilityLabel="Texto de práctica"
          >
            {texto || '…'}
          </Text>
        </Cristal>

        <View style={styles.estado}>
          <Text style={styles.estadoTexto} numberOfLines={1}>
            {ultimoEvento ?? 'Toca una letra o una frase para empezar'}
          </Text>
          {confianza !== null ? <Text style={styles.confianza}>{confianza}%</Text> : null}
        </View>

        <SugerenciasFrases
          sugerencias={sugerencias}
          onElegir={(frase: Frase) => escribir(() => completar(frase))}
        />

        <View style={styles.tabs}>
          {PESTANAS.map(({ valor, etiqueta }) => (
            <Pressable
              key={valor}
              onPress={() => {
                detener();
                setPestana(valor);
              }}
              style={[styles.tab, pestana === valor && styles.tabActiva]}
              accessibilityRole="tab"
              accessibilityState={{ selected: pestana === valor }}
              accessibilityLabel={`Ver ${etiqueta.toLowerCase()}`}
            >
              <Text style={[styles.tabTexto, pestana === valor && styles.tabTextoActivo]}>
                {etiqueta}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.panel}>
          {pestana === 'letras' ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollLetras}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.leyenda}>Abecedario completo · 27 letras</Text>
              <View style={styles.grilla}>
                {ABECEDARIO.map(({ letra, tipo, nota }) => (
                  <Pressable
                    key={letra}
                    onPress={() => escribir(() => pulsarLetra(letra))}
                    style={({ pressed }) => [
                      styles.tecla,
                      { width: anchoTecla, height: anchoTecla },
                      pressed && styles.teclaPulsada,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Letra ${letra}${
                      tipo === 'movimiento' ? `, ${nota ?? 'requiere movimiento'}` : ''
                    }`}
                  >
                    <Text style={styles.teclaTexto}>{letra}</Text>
                    {tipo === 'movimiento' ? <View style={styles.puntoMovimiento} /> : null}
                  </Pressable>
                ))}
              </View>

              <View style={styles.filaSignos}>
                <Text style={styles.etiquetaPequena}>Signos</Text>
                {SIGNOS.map((signo) => (
                  <Pressable
                    key={signo}
                    onPress={() => escribir(() => pulsarLetra(signo))}
                    style={({ pressed }) => [styles.teclaSigno, pressed && styles.teclaPulsada]}
                    accessibilityRole="button"
                    accessibilityLabel={`Signo ${signo}`}
                  >
                    <Text style={styles.signoTexto}>{signo}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.leyenda}>
                El punto ámbar marca {LETRAS_MOVIMIENTO.join(', ')}: se trazan en el aire; el resto
                son poses estáticas. Aquí puedes usarlas todas para armar frases.
              </Text>
            </ScrollView>
          ) : null}

          {pestana === 'frases' ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollFrases}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.ayudaPanel}>
                Toca una frase para enviarla como una seña ya aprendida, como si el guante la
                mandara completa. También puedes deletrearla en la pestaña Letras.
              </Text>

              {grupos.map(({ categoria, frases }) => (
                <View key={categoria} style={styles.grupo}>
                  <Text style={styles.grupoTitulo}>{ETIQUETAS_CATEGORIA[categoria]}</Text>
                  <View style={styles.chips}>
                    {frases.map((frase) => (
                      <Pressable
                        key={frase.id}
                        onPress={() => escribir(() => enviarFrase(frase))}
                        style={({ pressed }) => [styles.chip, pressed && styles.chipPulsado]}
                        accessibilityRole="button"
                        accessibilityLabel={`Enviar frase ${frase.texto}`}
                      >
                        <Text style={styles.chipTexto}>{frase.texto}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {pestana === 'guion' ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollGuiones}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.ayudaPanel}>
                Reproduce una conversación completa letra por letra. Es la misma secuencia que
                podría generar el guante, pero sin hardware.
              </Text>

              {GUIONES.map((guion) => {
                const activo = reproduciendoId === guion.id;
                const frases = guion.frases
                  .map((id) => frasePorId(id)?.texto)
                  .filter((valor): valor is string => Boolean(valor));

                return (
                  <Cristal
                    key={guion.id}
                    tinte={activo ? COLOR.guanteBorde : undefined}
                    style={styles.tarjetaGuion}
                  >
                    <View style={styles.guionCabecera}>
                      <Text style={styles.guionTitulo}>{guion.titulo}</Text>
                      <Pressable
                        onPress={() => {
                          if (activo) detener();
                          else void reproducir(guion);
                        }}
                        style={[styles.botonGuion, activo && styles.botonGuionDetener]}
                        accessibilityRole="button"
                        accessibilityLabel={
                          activo ? `Detener ${guion.titulo}` : `Reproducir ${guion.titulo}`
                        }
                      >
                        <Text style={[styles.botonGuionTexto, activo && { color: COLOR.coral }]}>
                          {activo ? 'Detener' : 'Reproducir'}
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.guionDescripcion}>{guion.descripcion}</Text>
                    <Text style={styles.guionFrases}>{frases.join(' · ')}</Text>
                  </Cristal>
                );
              })}
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.pie}>
          {[
            { etiqueta: 'Espacio', descripcion: 'Agregar un espacio', accion: pulsarEspacio },
            { etiqueta: 'Borrar', descripcion: 'Borrar el último carácter', accion: pulsarBorrar },
          ].map(({ etiqueta, descripcion, accion }) => (
            <Pressable
              key={etiqueta}
              onPress={() => escribir(accion)}
              style={({ pressed }) => [styles.botonPie, pressed && styles.botonPiePulsado]}
              accessibilityRole="button"
              accessibilityLabel={descripcion}
            >
              <Text style={styles.botonPieTexto}>{etiqueta}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              detener();
              limpiar();
            }}
            style={({ pressed }) => [styles.botonPie, pressed && styles.botonPiePulsado]}
            accessibilityRole="button"
            accessibilityLabel="Limpiar todo el texto"
          >
            <Text style={styles.botonPieTexto}>Limpiar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
    backgroundColor: COLOR.abismo,
  },
  marco: {
    flex: 1,
    gap: 10,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  redondo: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insignia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
  },
  puntoSimulado: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLOR.verde,
  },
  insigniaTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 13,
    color: COLOR.texto,
  },
  textoZona: {
    minHeight: 96,
    maxHeight: 170,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 26,
  },
  texto: {
    fontFamily: FUENTE.display,
    color: COLOR.texto,
    fontSize: 48,
    textAlign: 'center',
    letterSpacing: -0.8,
    flexShrink: 1,
  },
  estado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 18,
  },
  estadoTexto: {
    fontFamily: FUENTE.normal,
    fontSize: 12,
    color: COLOR.suave,
    flex: 1,
  },
  confianza: {
    fontFamily: FUENTE.negrita,
    fontSize: 12,
    color: COLOR.guante,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLOR.borde,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActiva: {
    backgroundColor: COLOR.guanteSuave,
    borderColor: COLOR.guanteBorde,
  },
  tabTexto: {
    fontFamily: FUENTE.negrita,
    fontSize: 14,
    color: COLOR.suave,
  },
  tabTextoActivo: {
    color: COLOR.guante,
  },
  panel: {
    flex: 1,
    minHeight: 120,
  },
  scroll: {
    flex: 1,
  },
  scrollLetras: {
    paddingBottom: 10,
    gap: 12,
  },
  grilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  tecla: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLOR.borde,
    backgroundColor: COLOR.capa,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teclaPulsada: {
    backgroundColor: COLOR.guanteSuave,
    borderColor: COLOR.guanteBorde,
  },
  teclaTexto: {
    fontFamily: FUENTE.display,
    color: COLOR.texto,
    fontSize: 21,
  },
  puntoMovimiento: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLOR.voz,
  },
  filaSignos: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  etiquetaPequena: {
    fontFamily: FUENTE.normal,
    fontSize: 12,
    color: COLOR.tenue,
    marginRight: 2,
  },
  teclaSigno: {
    width: 38,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLOR.borde,
    backgroundColor: COLOR.capa,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signoTexto: {
    fontFamily: FUENTE.negrita,
    color: COLOR.texto,
    fontSize: 17,
  },
  leyenda: {
    fontFamily: FUENTE.normal,
    color: COLOR.tenue,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  scrollFrases: {
    paddingBottom: 14,
    gap: 16,
  },
  ayudaPanel: {
    fontFamily: FUENTE.normal,
    color: COLOR.suave,
    fontSize: 13,
    lineHeight: 19,
  },
  grupo: {
    gap: 8,
  },
  grupoTitulo: {
    fontFamily: FUENTE.negrita,
    color: COLOR.suave,
    fontSize: 13,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLOR.borde,
    backgroundColor: COLOR.capa,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  chipPulsado: {
    backgroundColor: COLOR.guanteSuave,
    borderColor: COLOR.guanteBorde,
  },
  chipTexto: {
    fontFamily: FUENTE.negrita,
    color: COLOR.texto,
    fontSize: 14,
  },
  scrollGuiones: {
    paddingBottom: 14,
    gap: 12,
  },
  tarjetaGuion: {
    padding: 16,
    gap: 6,
    borderRadius: 20,
  },
  guionCabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  guionTitulo: {
    fontFamily: FUENTE.display,
    color: COLOR.texto,
    fontSize: 19,
    letterSpacing: -0.3,
  },
  botonGuion: {
    borderRadius: 999,
    backgroundColor: COLOR.guanteSuave,
    borderWidth: 1,
    borderColor: COLOR.guanteBorde,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  botonGuionDetener: {
    backgroundColor: COLOR.coralSuave,
    borderColor: 'rgba(255,93,93,0.4)',
  },
  botonGuionTexto: {
    fontFamily: FUENTE.negrita,
    color: COLOR.guante,
    fontSize: 13,
  },
  guionDescripcion: {
    fontFamily: FUENTE.normal,
    color: COLOR.suave,
    fontSize: 14,
  },
  guionFrases: {
    fontFamily: FUENTE.normal,
    color: COLOR.tenue,
    fontSize: 12,
    lineHeight: 17,
  },
  pie: {
    flexDirection: 'row',
    gap: 8,
  },
  botonPie: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLOR.borde,
    backgroundColor: COLOR.capa,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botonPiePulsado: {
    backgroundColor: COLOR.guanteSuave,
  },
  botonPieTexto: {
    fontFamily: FUENTE.negrita,
    color: COLOR.texto,
    fontSize: 14,
  },
});
