import {type RefObject} from 'react'
import {Pressable, StyleSheet, Text, View} from 'react-native'
import type {CameraRef, MapRef} from '@maplibre/maplibre-react-native'

import {colors, radius, spacing} from '@/theme/theme'

type Props = {
  mapRef: RefObject<MapRef | null>
  cameraRef: RefObject<CameraRef | null>
  /** Ниже не опускаемся: дальше карта Азербайджана теряет смысл. */
  minZoom?: number
  /** Выше CARTO плиток не отдаёт. */
  maxZoom?: number
}

/**
 * Кнопки приближения и отдаления для карты.
 *
 * ⚠️ Масштаб СПРАШИВАЕТСЯ У КАРТЫ каждый раз (`getZoom`), а не хранится рядом.
 * Хранить нельзя: карту двигают ещё и пальцами, и запомненное значение разошлось
 * бы с настоящим — первое же нажатие после щипка прыгало бы неизвестно куда.
 *
 * ⚠️ Карт в приложении три (выбор точки при подаче, карта объявления, карта со
 * всеми объявлениями), и каждая заводит свои `Map` и `Camera`. Общего родителя у
 * них нет, поэтому кнопки вынесены сюда и вставляются в каждую: иначе пришлось
 * бы писать одно и то же трижды и следить, чтобы не разъехалось.
 */
export function MapZoomControls({mapRef, cameraRef, minZoom = 4, maxZoom = 18}: Props) {
  const step = async (delta: number) => {
    const current = await mapRef.current?.getZoom()
    if (typeof current !== 'number') return

    const next = Math.min(Math.max(current + delta, minZoom), maxZoom)
    if (next === current) return

    cameraRef.current?.zoomTo(next, {duration: 200})
  }

  return (
    // pointerEvents="box-none" обязателен: иначе прозрачная обёртка перехватила
    // бы касания карты под собой, и метку нельзя было бы поставить рядом.
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        style={({pressed}) => [styles.button, styles.top, pressed && styles.pressed]}
        onPress={() => step(1)}
        hitSlop={4}
        accessibilityLabel="+"
      >
        <Text style={styles.sign}>+</Text>
      </Pressable>
      <Pressable
        style={({pressed}) => [styles.button, pressed && styles.pressed]}
        onPress={() => step(-1)}
        hitSlop={4}
        accessibilityLabel="−"
      >
        <Text style={styles.sign}>−</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    borderRadius: radius.base,
    overflow: 'hidden',
    backgroundColor: colors.white,
    // Тень лёгкая: кнопки лежат на карте, а не над содержимым страницы.
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1}
  },
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  top: {borderBottomWidth: 1, borderBottomColor: colors.gray200},
  pressed: {backgroundColor: colors.gray100},
  sign: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.text
  }
})
