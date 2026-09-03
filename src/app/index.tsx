import {useCallback, useEffect, useState} from 'react'
import {ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'

import type {Property} from '@birklik/core/types'

import {PropertyCard} from '@/components/property-card'
import {
  getPromotedProperties,
  getPropertiesPage,
  type PropertyCursor
} from '@/services/property-service'
import {colors, fontSize, spacing} from '@/theme/theme'

// Витрина. Порядок тот же, что на сайте: сначала платные объявления, следом
// обычные страницами по двадцать.
export default function HomeScreen() {
  const [items, setItems] = useState<Property[]>([])
  const [cursor, setCursor] = useState<PropertyCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [promoted, page] = await Promise.all([
        getPromotedProperties(),
        getPropertiesPage(null)
      ])
      // Платное объявление приходит обоими запросами — оставляем верхнее.
      const promotedIds = new Set(promoted.map(p => p.id))
      setItems([...promoted, ...page.properties.filter(p => !promotedIds.has(p.id))])
      setCursor(page.cursor)
    } catch {
      setError('Elanları yükləmək alınmadı')
    }
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const loadMore = useCallback(async () => {
    // Курсора нет — выдача кончилась. Второе условие спасает от повторного
    // запроса, пока предыдущий ещё идёт: FlatList зовёт onEndReached щедро.
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await getPropertiesPage(cursor)
      setItems(prev => {
        const seen = new Set(prev.map(p => p.id))
        return [...prev, ...page.properties.filter(p => !seen.has(p.id))]
      })
      setCursor(page.cursor)
    } catch {
      // Молча: список уже показан, обрывать его сообщением об ошибке хуже,
      // чем просто не дозагрузить. Потянет вниз ещё раз — попробуем снова.
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={property => property.id}
        renderItem={({item}) => <PropertyCard property={item} language="az" />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>{error ?? 'Hələ elan yoxdur'}</Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footer} color={colors.primary} />
          ) : null
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.gray50
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.gray50
  },
  list: {
    padding: spacing.md,
    gap: spacing.md
  },
  empty: {
    fontSize: fontSize.base,
    color: colors.neutral,
    textAlign: 'center'
  },
  footer: {
    marginVertical: spacing.md
  }
})
