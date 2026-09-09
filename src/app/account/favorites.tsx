import {useCallback, useEffect, useState} from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import {Stack} from 'expo-router'

import type {Property} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {PropertyCard} from '@/components/property-card'
import {useLanguage} from '@/i18n/language-provider'
import {getFavoriteProperties} from '@/services/property-service'
import {colors, fontSize, spacing} from '@/theme/theme'

/** Сохранённое. Снятые с витрины сюда не попадают — служба их отсеивает. */
export default function FavoritesScreen() {
  const {t} = useLanguage()
  const {user} = useAuth()

  const [items, setItems] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    try {
      setItems(await getFavoriteProperties(user.uid))
    } catch {
      setItems([])
    }
  }, [user])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  return (
    <>
      <Stack.Screen options={{title: t.dashboard.favorites}} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {items.length === 0 ? (
            <Text style={styles.empty}>{t.dashboard.bookmarkProperties}</Text>
          ) : (
            items.map(property => <PropertyCard key={property.id} property={property} />)
          )}
        </ScrollView>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.gray50},
  content: {padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray50},
  empty: {fontSize: fontSize.sm, color: colors.neutral, paddingVertical: spacing.lg}
})
