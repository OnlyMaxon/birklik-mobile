import {useMemo} from 'react'
import {Linking, Platform, Pressable, StyleSheet, Text, View} from 'react-native'
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  type StyleSpecification
} from '@maplibre/maplibre-react-native'

import {basemap} from '@birklik/core/utils/basemap'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

type Props = {
  latitude: number
  longitude: number
  /** Подпись для стороннего приложения карт, куда уходим по кнопке. */
  label: string
}

/**
 * Карта объявления.
 *
 * Взят MapLibre, а не `react-native-maps`. Причина простая: последний на
 * Android требует ключ Google Maps, которого у проекта нет и заводить его
 * незачем — сайт рисует карту растровыми тайлами CARTO, и приложение берёт те
 * же самые. Одна картинка на оба клиента, один ключ, никакого нового счёта.
 *
 * Стиль задаётся целиком объектом, а не сборкой из `RasterSource` и `Layer`:
 * так короче и не зависит от того, как в текущей версии называются
 * составляющие.
 *
 * `{r}` в шаблоне адреса не запрашиваем: его подставляет Leaflet на сайте, а
 * MapLibre такого не умеет и отправил бы фигурные скобки прямо в адрес.
 */
export function PropertyMap({latitude, longitude, label}: Props) {
  const {t} = useLanguage()

  const {style, attribution} = useMemo(() => {
    const tiles = basemap(process.env.EXPO_PUBLIC_CARTO_API_KEY, false)
    const spec: StyleSpecification = {
      version: 8,
      sources: {
        basemap: {
          type: 'raster',
          tiles: [tiles.url],
          tileSize: 256,
          attribution: tiles.attributionText
        }
      },
      layers: [{id: 'basemap', type: 'raster', source: 'basemap'}]
    }
    return {style: spec, attribution: tiles.attributionText}
  }, [])

  const openInMaps = () => {
    // Ссылка на стороннее приложение карт: на iOS своё, на Android общий
    // географический адрес, который перехватывает установленное приложение.
    const url =
      Platform.OS === 'ios'
        ? `maps://?ll=${latitude},${longitude}&q=${encodeURIComponent(label)}`
        : `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label)})`
    void Linking.openURL(url)
  }

  return (
    <View style={styles.wrap}>
      <MapLibreMap style={styles.map} mapStyle={style} attribution={false} logo={false}>
        <Camera initialViewState={{center: [longitude, latitude], zoom: 14}} />
        <Marker lngLat={[longitude, latitude]}>
          <View style={styles.pin} />
        </Marker>
      </MapLibreMap>

      {/* Подпись обязательна по условиям и OpenStreetMap, и CARTO. Рисуем свою:
          встроенную отключили, чтобы она не спорила с оформлением. */}
      <Text style={styles.attribution}>{attribution}</Text>

      <Pressable style={styles.button} onPress={openInMaps}>
        <Text style={styles.buttonText}>{t.buttons.findOnMap}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.sm},
  map: {
    height: 220,
    borderRadius: radius.base,
    overflow: 'hidden',
    backgroundColor: colors.gray100
  },
  pin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.white
  },
  attribution: {fontSize: 10, color: colors.gray400},
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.gray50
  },
  buttonText: {fontSize: fontSize.sm, color: colors.primary, fontWeight: '600'}
})
