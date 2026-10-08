import {useCallback, useEffect, useState} from 'react'
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View} from 'react-native'
import {Stack} from 'expo-router'

import type {Booking, Property} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {AccountBookings} from '@/components/account/account-bookings'
import {useLanguage} from '@/i18n/language-provider'
import {getOwnerBookings, getUserBookings} from '@/services/booking-service'
import {getOwnerProperties, getProperty} from '@/services/property-service'
import {colors, spacing} from '@/theme/theme'

/** Брони с обеих сторон: свои поездки и заявки на свои объявления. */
export default function BookingsScreen() {
  const {t} = useLanguage()
  const {user} = useAuth()

  const [mine, setMine] = useState<Booking[]>([])
  const [requests, setRequests] = useState<Booking[]>([])
  const [properties, setProperties] = useState<Map<string, Property>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const [own, incoming] = await Promise.allSettled([
      getUserBookings(user.uid),
      getOwnerBookings(user.uid)
    ])
    const ownList = own.status === 'fulfilled' ? own.value : []
    const incomingList = incoming.status === 'fulfilled' ? incoming.value : []
    if (own.status === 'fulfilled') setMine(ownList)
    if (incoming.status === 'fulfilled') setRequests(incomingList)

    /**
     * Объявления — чтобы в карточке брони были снимок и название.
     *
     * В самой броне их нет: `Booking` несёт только `propertyId`, и карточка
     * показывала голый идентификатор. Понять по нему, к какому дому заявка,
     * нельзя.
     *
     * ⚠️ Два источника, и это не прихоть. Заявки приходят на СВОИ объявления —
     * их забирает один запрос `getOwnerProperties`. А свои поездки оформлены на
     * ЧУЖИЕ объявления, и в этот список они не попадают никак; их приходится
     * добирать поштучно. Поштучно — только недостающие, чтобы не слать запрос
     * на каждую бронь.
     */
    const ownProperties = await getOwnerProperties(user.uid).catch(() => [] as Property[])
    const byId = new Map(ownProperties.map(property => [property.id, property]))

    // Чужие объявления добираем по одному — и каждое по одному разу. Без `Set`
    // две брони на один дом дали бы два одинаковых запроса.
    const missing = [...new Set(
      [...ownList, ...incomingList].map(booking => booking.propertyId).filter(Boolean)
    )].filter(id => !byId.has(id))

    const fetched = await Promise.all(missing.map(id => getProperty(id).catch(() => null)))
    for (const property of fetched) {
      if (property) byId.set(property.id, property)
    }

    setProperties(byId)
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
          <AccountBookings
            mine={mine}
            requests={requests}
            properties={properties}
            onChanged={load}
          />
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
