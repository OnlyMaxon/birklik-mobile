import {useCallback, useEffect, useMemo, useState} from 'react'
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'
import {Ionicons} from '@expo/vector-icons'

import {filterProperties} from '@birklik/core/data'
import type {Property} from '@birklik/core/types'
import {tierRank} from '@birklik/core/utils/premium-helper'

import {FilterSheet} from '@/components/filter-sheet'
import {PropertiesMap} from '@/components/properties-map'
import {PropertyCard} from '@/components/property-card'
import {SearchBar} from '@/components/search-bar'
import {useFilters, type Filters} from '@/filters/use-filters'
import {useLanguage} from '@/i18n/language-provider'
import {getAllForFilter} from '@/services/property-service'
import {colors, fontSize, spacing} from '@/theme/theme'

/**
 * Витрина.
 *
 * Объявления берутся разом и фильтруются на устройстве — функцией
 * `filterProperties` из общего пакета, той же, что применяет сайт. Так поиск,
 * тип, цена и вместимость работают по одним правилам в обоих приложениях, а не
 * по двум похожим.
 *
 * Порядок задаёт `tierRank`: платные выше обычных. На сайте это делают два
 * запроса, здесь достаточно сортировки — выборка и так вся на руках.
 */
export default function HomeScreen() {
  const {t} = useLanguage()
  const {filters, patch, reset, activeCount} = useFilters()

  const [all, setAll] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Карта по умолчанию скрыта. На сайте она тоже приходит свёрнутой на узких
  // экранах: карта тяжелее списка и на телефоне занимает его целиком.
  const [mapOpen, setMapOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setAll(await getAllForFilter())
    } catch {
      setError(t.messages.error)
    }
  }, [t])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  // Регионы для листа фильтров — только те, где объявления есть. Справочник
  // городов вчетверо шире реальной географии, и предлагать пустой регион
  // означает вести человека в никуда.
  const availableCities = useMemo(() => {
    const counts = new Map<string, number>()
    for (const property of all) {
      if (property.city) counts.set(property.city, (counts.get(property.city) ?? 0) + 1)
    }
    return [...counts]
      .map(([value, count]) => ({value, count}))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }, [all])

  const visible = useMemo(() => {
    const found = filterProperties(all, {
      search: filters.search || undefined,
      city: filters.city || undefined,
      type: filters.type || undefined,
      minPrice: filters.minPrice ?? undefined,
      maxPrice: filters.maxPrice ?? undefined,
      minGuests: filters.minGuests ?? undefined,
      // Кнопки подписаны «4+», то есть «вмещает не меньше четырёх». Общая
      // функция сравнивает ДИАПАЗОНЫ и при отсутствии верхней границы
      // подставляет 10 — тогда дом на двадцать человек (диапазон 15–20) в
      // выдачу бы не попал, потому что 10 меньше 15. Значение '10+'
      // разворачивается в 999 и делает верхнюю границу поиска бесконечной.
      maxGuests: filters.minGuests !== null ? '10+' : undefined
    })
    return [...found].sort((a, b) => tierRank(b) - tierRank(a))
  }, [all, filters])

  const apply = (next: Filters) => {
    patch(next)
    setSheetOpen(false)
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <SearchBar
          value={filters.search}
          onChangeText={search => patch({search})}
          onOpenFilters={() => setSheetOpen(true)}
          activeCount={activeCount}
        />
        <View style={styles.countRow}>
          <Text style={styles.count}>
            {visible.length} / {all.length}
          </Text>

          {/* Переключатель карты — как кнопка «Показать карту» на сайте.
              Подписи берём из общего пакета, свои не выдумываем. */}
          <Pressable
            onPress={() => setMapOpen(open => !open)}
            style={[styles.mapToggle, mapOpen && styles.mapToggleActive]}
            hitSlop={6}
          >
            <Ionicons
              name={mapOpen ? 'list-outline' : 'map-outline'}
              size={15}
              color={mapOpen ? colors.white : colors.primary}
            />
            <Text style={[styles.mapToggleText, mapOpen && styles.mapToggleTextActive]}>
              {mapOpen ? t.home.hideMap : t.home.showMap}
            </Text>
          </Pressable>
        </View>
      </View>

      {mapOpen && (
        <View style={styles.mapWrap}>
          <PropertiesMap properties={visible} />
        </View>
      )}

      <FlatList
        data={visible}
        keyExtractor={property => property.id}
        renderItem={({item}) => <PropertyCard property={item} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{error ?? t.messages.noResults}</Text>
            {!error && activeCount > 0 ? (
              <Text style={styles.emptyHint} onPress={reset}>
                {t.search.clearFilters}
              </Text>
            ) : null}
          </View>
        }
      />

      <FilterSheet
        visible={sheetOpen}
        filters={filters}
        availableCities={availableCities}
        onApply={apply}
        onClose={() => setSheetOpen(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.gray50},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray50
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
    gap: spacing.xs
  },
  count: {fontSize: fontSize.xs, color: colors.neutral, paddingLeft: spacing.xs},
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  mapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.base,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  mapToggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  mapToggleText: {fontSize: fontSize.xs, fontWeight: '700', color: colors.primary},
  mapToggleTextActive: {color: colors.white},
  mapWrap: {paddingHorizontal: spacing.md, paddingBottom: spacing.sm},
  list: {paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.md},
  empty: {alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm},
  emptyText: {fontSize: fontSize.base, color: colors.neutral, textAlign: 'center'},
  emptyHint: {fontSize: fontSize.sm, color: colors.primary, fontWeight: '600'}
})
