import {useCallback, useEffect, useState} from 'react'
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View} from 'react-native'
import {Stack} from 'expo-router'

import type {Property} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {AccountListings} from '@/components/account/account-listings'
import {useLanguage} from '@/i18n/language-provider'
import {getOwnerProperties} from '@/services/property-service'
import {colors, spacing} from '@/theme/theme'

/** Свои объявления — все, включая снятые с витрины. */
export default function ListingsScreen() {
  const {t} = useLanguage()
  const {user} = useAuth()

  const [listings, setListings] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    try {
      setListings(await getOwnerProperties(user.uid))
    } catch {
      setListings([])
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
      <Stack.Screen options={{title: t.dashboard.myListings}} />
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
          <AccountListings listings={listings} />
        </ScrollView>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.gray50},
  content: {padding: spacing.md, paddingBottom: spacing.xxl},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray50}
})
