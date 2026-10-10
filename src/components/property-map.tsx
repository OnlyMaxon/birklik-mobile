import {useMemo, useRef, useState} from 'react'
import {Linking, Platform, Pressable, StyleSheet, Text, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'
import {
  Camera,
  Map as MapLibreMap,
  type CameraRef,
  type MapRef,
  Marker,
  type StyleSpecification
} from '@maplibre/maplibre-react-native'

import {basemap} from '@birklik/core/utils/basemap'

import {MapZoomControls} from '@/components/map-zoom-controls'
import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Route = {
  key: string
  name: string
  icon: keyof typeof Ionicons.glyphMap
  url: string
}

type Props = {
  latitude: number
  longitude: number
  /** Подпись для стороннего приложения карт и шапка окна метки. */
  label: string
  /** Место — та же строка, что страница показывает под названием. */
  place?: string
  /** Цена за ночь — та же строка, что на странице. */
  price?: string
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
 *
 * Нажатие на метку открывает окно с объявлением и выбором приложения карт —
 * как всплывающее окно Leaflet на сайте. Раньше под картой стояла одна кнопка,
 * и она сразу бросала человека в системный выбор: куда он попадёт, до нажатия
 * было неизвестно.
 */
export function PropertyMap({latitude, longitude, label, place, price}: Props) {
  const mapRef = useRef<MapRef>(null)
  const cameraRef = useRef<CameraRef>(null)

  const [open, setOpen] = useState(false)

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

  /**
   * Куда ведут кнопки окна.
   *
   * Google Maps и Waze — те же самые адреса, что на сайте. Оба обычные
   * `https`, и это важно: такую ссылку Android отдаёт установленному
   * приложению, а если его нет — открывает сайт. Своих схем (`comgooglemaps:`)
   * здесь нет намеренно: проверять их через `canOpenURL` на Android 11 и выше
   * можно только объявив приложение в манифесте, а молча не открывающаяся
   * кнопка хуже страницы в браузере.
   *
   * ⚠️ Третья кнопка РАЗНАЯ по платформам, и это не недоделка. Apple Maps на
   * Android ведёт в никуда, поэтому там на её месте системный выбор `geo:` —
   * ровно то, что делала прежняя единственная кнопка под картой. Через него
   * открываются и Yandex Maps, и 2GIS, которыми в Азербайджане пользуются не
   * меньше. На iOS третья кнопка — Apple Maps, как на сайте.
   */
  const routes = useMemo(() => {
    const point = `${latitude},${longitude}`
    const title = encodeURIComponent(label)

    const list: Route[] = [
      {
        key: 'google',
        name: 'Google Maps',
        icon: 'logo-google',
        url: `https://www.google.com/maps/search/?api=1&query=${point}`
      },
      {
        key: 'waze',
        name: 'Waze',
        icon: 'navigate-outline',
        url: `https://waze.com/ul?ll=${latitude}%2C${longitude}&navigate=yes`
      }
    ]

    if (Platform.OS === 'ios') {
      list.push({
        key: 'apple',
        name: 'Apple Maps',
        icon: 'logo-apple',
        url: `https://maps.apple.com/?ll=${point}&q=${title}`
      })
    } else {
      list.push({
        key: 'other',
        name: t.property.otherMapApp,
        icon: 'map-outline',
        url: `geo:${point}?q=${point}(${title})`
      })
    }

    return list
  }, [latitude, longitude, label, t])

  return (
    <View style={styles.wrap}>
      <View style={styles.mapBox}>
        <MapLibreMap ref={mapRef} style={styles.map} mapStyle={style} attribution={false} logo={false}>
          <Camera ref={cameraRef} initialViewState={{center: [longitude, latitude], zoom: 14}} />

          {/* ⚠️ Нажатие висит на самой метке, а не на `Pressable` внутри неё:
              метка на Android — нативный вид поверх карты, и вложенные в неё
              элементы касаний не получают вовсе. */}
          <Marker lngLat={[longitude, latitude]} onPress={() => setOpen(value => !value)}>
            <View style={styles.pin} />
          </Marker>
        </MapLibreMap>

        <MapZoomControls mapRef={mapRef} cameraRef={cameraRef} />

        {/* Окно закрывается только крестиком. Закрывать его нажатием по карте
            было бы привычнее, но нажатие по метке на Android доходит и до
            карты: окно открылось бы и тут же закрылось. */}
        {open ? (
          <View style={styles.popup}>
            <View style={styles.popupHead}>
              <Text style={styles.popupTitle} numberOfLines={1}>
                {label}
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel={t.buttons.close}>
                <Ionicons name="close" size={18} color={colors.gray500} />
              </Pressable>
            </View>

            {place || price ? (
              <View style={styles.popupMeta}>
                {place ? (
                  <Text style={styles.popupPlace} numberOfLines={1}>
                    {place}
                  </Text>
                ) : null}
                {price ? <Text style={styles.popupPrice}>{price}</Text> : null}
              </View>
            ) : null}

            <Text style={styles.popupLabel}>{t.property.openInMaps}</Text>

            {/* Перенос обязателен: три подписи в один ряд на узком экране не
                помещаются, а обрезанное «Google Ma…» ничего не объясняет. */}
            <View style={styles.routes}>
              {routes.map(route => (
                <Pressable
                  key={route.key}
                  style={({pressed}) => [styles.route, pressed && styles.routePressed]}
                  onPress={() => void Linking.openURL(route.url)}
                >
                  <Ionicons name={route.icon} size={14} color={colors.primary} />
                  <Text style={styles.routeText}>{route.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {/* Подпись обязательна по условиям и OpenStreetMap, и CARTO. Рисуем свою:
          встроенную отключили, чтобы она не спорила с оформлением. */}
      <Text style={styles.attribution}>{attribution}</Text>

      {/* Второй путь к тому же окну. Метка — цель мелкая, и человек, не
          догадавшийся по ней нажать, остался бы без маршрута вообще. */}
      <Pressable style={styles.button} onPress={() => setOpen(true)}>
        <Text style={styles.buttonText}>{t.buttons.findOnMap}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.sm},
  // ⚠️ Обёртка нужна для кнопок масштаба и окна метки: они позиционируются от
  // неё. Внутрь самой карты их класть нельзя — MapLibre считает своих детей
  // слоями и метками, а обычный вид там ведёт себя непредсказуемо.
  mapBox: {position: 'relative'},

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
  popup: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.sm,
    gap: 4,
    ...shadow.md
  },
  popupHead: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  popupTitle: {flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.text},
  popupMeta: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  popupPlace: {flex: 1, fontSize: fontSize.xs, color: colors.gray500},
  popupPrice: {fontSize: fontSize.xs, fontWeight: '700', color: colors.primary},
  popupLabel: {fontSize: 10, color: colors.gray400, marginTop: 2},
  routes: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
    backgroundColor: colors.gray50
  },
  routePressed: {backgroundColor: colors.gray100},
  routeText: {fontSize: 11, fontWeight: '600', color: colors.primary},
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
