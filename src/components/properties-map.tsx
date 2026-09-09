import {useMemo} from 'react'
import {StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  type StyleSpecification
} from '@maplibre/maplibre-react-native'

import {basemap} from '@birklik/core/utils/basemap'
import type {Property} from '@birklik/core/types'

import {colors, radius, spacing} from '@/theme/theme'

type Props = {
  properties: Property[]
}

// Тот же вид по умолчанию, что у карты на сайте: Баку и окрестности.
// Применяется, когда показывать нечего.
const BAKU: [number, number] = [49.8671, 40.4093]
const BAKU_ZOOM = 8.5

/**
 * Карта всех объявлений выдачи — то же, что даёт кнопка «Показать карту» на сайте.
 *
 * Метки берутся из уже отфильтрованного списка, поэтому карта и перечень всегда
 * показывают одно и то же. Нажатие на метку открывает объявление.
 *
 * Охват подгоняется под метки, а не задаётся числом: объявления разбросаны от
 * Габалы до Лерика, и любое фиксированное приближение либо резало бы часть, либо
 * показывало пустое море. Считаем середину и подбираем масштаб по размаху
 * координат — `fitBounds` в этой обвязке доступен только через ссылку на карту,
 * а результат тот же.
 */
export function PropertiesMap({properties}: Props) {
  const style = useMemo<StyleSpecification>(() => {
    const tiles = basemap(process.env.EXPO_PUBLIC_CARTO_API_KEY, false)
    return {
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
  }, [])

  const attribution = useMemo(
    () => basemap(process.env.EXPO_PUBLIC_CARTO_API_KEY, false).attributionText,
    []
  )

  // Координаты есть не у всех записей: тип их требует, но в базе попадаются
  // старые объявления без них, и метка в точке (0, 0) уехала бы в Атлантику.
  const points = useMemo(
    () =>
      properties.filter(
        property =>
          typeof property.coordinates?.lat === 'number' &&
          typeof property.coordinates?.lng === 'number' &&
          (property.coordinates.lat !== 0 || property.coordinates.lng !== 0)
      ),
    [properties]
  )

  const view = useMemo(() => {
    if (points.length === 0) return {center: BAKU, zoom: BAKU_ZOOM}

    const lats = points.map(p => p.coordinates.lat)
    const lngs = points.map(p => p.coordinates.lng)
    const center: [number, number] = [
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
      (Math.min(...lats) + Math.max(...lats)) / 2
    ]

    if (points.length === 1) return {center, zoom: 13}

    // Приближение от размаха: чем шире разброс, тем дальше отходим.
    // Числа подобраны по боевой географии — от одного города до всей страны.
    const spread = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs))
    const zoom = spread > 2 ? 6.5 : spread > 1 ? 7.5 : spread > 0.4 ? 9 : spread > 0.1 ? 11 : 13

    return {center, zoom}
  }, [points])

  return (
    <View style={styles.wrap}>
      <MapLibreMap style={styles.map} mapStyle={style} attribution={false} logo={false}>
        {/* Ключ пересоздаёт камеру при смене выдачи: иначе после фильтра метки
            меняются, а вид остаётся от прошлого набора. */}
        <Camera
          key={`${view.center[0]},${view.center[1]},${view.zoom}`}
          initialViewState={{center: view.center, zoom: view.zoom}}
        />

        {points.map(property => (
          // ⚠️ Нажатие вешается на саму метку, а не на `Pressable` внутри.
          // Метка на Android — нативный вид поверх карты, и вложенные в неё
          // элементы касаний не получают: первая попытка через `Pressable`
          // молча ничего не делала, а нажатие уходило в карту.
          <Marker
            key={property.id}
            lngLat={[property.coordinates.lng, property.coordinates.lat]}
            onPress={() => router.push(`/property/${property.id}`)}
          >
            <View style={styles.pin}>
              {/* На метке цена за ночь — по ней объявления и сравнивают.
                  Валюту не пишем: на метке в полсотни точек ей нет места, а в
                  базе она у всех одна. */}
              <Text style={styles.pinText}>{property.price?.daily ?? ''}</Text>
            </View>
          </Marker>
        ))}
      </MapLibreMap>

      {/* Подпись обязательна по условиям OpenStreetMap и CARTO. */}
      <Text style={styles.attribution}>{attribution}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.xs},
  map: {
    height: 320,
    borderRadius: radius.base,
    overflow: 'hidden',
    backgroundColor: colors.gray100
  },
  pin: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white
  },
  pinText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700'
  },
  attribution: {fontSize: 10, color: colors.gray400, paddingLeft: spacing.xs}
})
