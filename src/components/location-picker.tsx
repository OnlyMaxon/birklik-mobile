import {useMemo, useState} from 'react'
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native'
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  type StyleSpecification
} from '@maplibre/maplibre-react-native'

import {basemap} from '@birklik/core/utils/basemap'

import {useLanguage} from '@/i18n/language-provider'
import {DEFAULT_COORDINATES, geocode, reverseGeocode} from '@/services/listing-service'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

type Coordinates = {lat: number; lng: number}

type Props = {
  /** Текущая точка. Пусто — метки ещё нет, карта стоит на Баку. */
  value: Coordinates | null
  onChange: (value: Coordinates) => void
  /** Что отдать геокодеру по кнопке: адрес, район и город одной строкой. */
  query: string
  /**
   * Адрес, найденный по точке на карте. Пусто не приходит — вызывается только
   * когда обратный геокодер действительно ответил.
   */
  onAddressFound: (address: string) => void
}

/**
 * Выбор точки объявления на карте.
 *
 * ⚠️ До этого приложение точку не спрашивало вовсе: координаты брал геокодер по
 * адресу, а при его отказе подставлялся центр Баку. Объявление из посёлка
 * оказывалось в столице, и поправить это было нечем — на сайте такая карта есть
 * с самого начала.
 *
 * Повторяет `LocationMap` сайта, вплоть до обеих сторон связи: кнопка ищет точку
 * по адресу, касание карты ищет адрес по точке. Вторая половина нужна не для
 * красоты — иначе метку переставили бы, а подпись осталась бы от прежнего места,
 * и объявление врало бы о себе.
 *
 * Карта та же, что у `PropertyMap`: MapLibre с растровыми тайлами CARTO. Свой
 * стиль здесь не заводится — ключ, подпись и поведение обязаны совпадать.
 */
export function LocationPicker({value, onChange, query, onAddressFound}: Props) {
  const {t} = useLanguage()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Камера двигается ТОЛЬКО по кнопке поиска. Если привязать её к `value`, карта
  // подпрыгивала бы под пальцем на каждом касании — человек ставит метку в
  // стороне от центра, и это нормально.
  const [focus, setFocus] = useState<[number, number] | null>(null)

  const start = value ?? DEFAULT_COORDINATES

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

  const search = async () => {
    if (!query.trim() || busy) return

    setBusy(true)
    setError('')
    try {
      const found = await geocode(query)
      onChange(found)
      setFocus([found.lng, found.lat])

      // ⚠️ Геокодер НИКОГДА не отказывает явно: не найдя места, он отдаёт Баку.
      // Молча оставить метку в столице нельзя — человек решит, что нашлось.
      if (found.lat === DEFAULT_COORDINATES.lat && found.lng === DEFAULT_COORDINATES.lng) {
        setError(t.dashboard.locationSearchFailed)
      }
    } finally {
      setBusy(false)
    }
  }

  const place = async (lng: number, lat: number) => {
    const point = {lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6))}
    onChange(point)
    setError('')

    // Адрес подтягиваем следом и только при удаче: написанное человеком важнее
    // того, что вернул справочник.
    const address = await reverseGeocode(point.lat, point.lng)
    if (address) onAddressFound(address)
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.label}>{t.property.location}</Text>
        <Pressable
          onPress={search}
          disabled={busy}
          style={({pressed}) => [styles.search, pressed && styles.searchPressed]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.searchText}>{t.buttons.findOnMap}</Text>
          )}
        </Pressable>
      </View>

      <MapLibreMap
        style={styles.map}
        mapStyle={style}
        attribution={false}
        logo={false}
        onPress={event => {
          const lngLat = event.nativeEvent?.lngLat
          if (!lngLat) return
          void place(lngLat[0], lngLat[1])
        }}
      >
        <Camera
          initialViewState={{center: [start.lng, start.lat], zoom: 14}}
          {...(focus ? {center: focus, zoom: 15} : {})}
        />
        {value ? (
          <Marker lngLat={[value.lng, value.lat]}>
            <View style={styles.pin} />
          </Marker>
        ) : null}
      </MapLibreMap>

      {/* Подпись обязательна по условиям OpenStreetMap и CARTO — как у
          `PropertyMap`, встроенная отключена ради оформления. */}
      <Text style={styles.attribution}>{attribution}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.xs},
  head: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  label: {fontSize: fontSize.sm, color: colors.gray600, fontWeight: '600'},
  search: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.gray50,
    minWidth: 110,
    alignItems: 'center'
  },
  searchPressed: {opacity: 0.6},
  searchText: {fontSize: fontSize.sm, color: colors.primary, fontWeight: '600'},
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
  error: {fontSize: fontSize.xs, color: colors.error}
})
