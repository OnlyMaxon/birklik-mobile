import {useCallback, useEffect, useState} from 'react'
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View} from 'react-native'
import {Stack} from 'expo-router'

import type {Booking} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {AccountBookings} from '@/components/account/account-bookings'
import {useLanguage} from '@/i18n/language-provider'
import {getOwnerBookings, getUserBookings} from '@/services/booking-service'
import {colors, spacing} from '@/theme/theme'

/** Брони с обеих сторон: свои поездки и заявки на свои объявления. */
export default function BookingsScreen() {
  const {t} = useLanguage()
  const {user} = useAuth()

  const [mine, setMine] = useState<Booking[]>([])
  const [requests, setRequests] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const [own, incoming] = await Promise.allSettled([
      getUserBookings(user.uid),
      getOwnerBookings(user.uid)
    ])
    if (own.status === 'fulfilled') setMine(own.value)
    if (incoming.status === 'fulfilled') setRequests(incoming.value)
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
      <Stack.Screen options={{title: t.dashboard.bookings}} />
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
          <AccountBookings mine={mine} requests={requests} onChanged={load} />
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
