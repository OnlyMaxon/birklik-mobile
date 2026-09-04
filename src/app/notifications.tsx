import {useCallback, useEffect, useState} from 'react'
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'

import type {Notification} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {getNotifications, markAllAsRead, markAsRead} from '@/services/notifications-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

export default function NotificationsScreen() {
  const {t} = useLanguage()
  const {user} = useAuth()

  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    try {
      setItems(await getNotifications(user.uid))
    } catch {
      setItems([])
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      router.replace('/')
      return
    }
    load().finally(() => setLoading(false))
  }, [user, load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  const open = async (item: Notification) => {
    if (!user) return

    if (!item.read) {
      // Отметка ставится сразу на экране: ждать сети, чтобы убрать точку,
      // незачем. Не прошло — вернётся при следующем обновлении списка.
      setItems(current => current.map(n => (n.id === item.id ? {...n, read: true} : n)))
      void markAsRead(user.uid, item.id).catch(() => undefined)
    }

    // Уведомления о брони ведут в кабинет, остальные — на объявление.
    // `relatedId` у комментариев и оценок это идентификатор объявления.
    if (item.type === 'booking' || item.type === 'bookingApproved' || item.type === 'bookingRejected') {
      router.push('/account')
    } else if (item.relatedId) {
      router.push(`/property/${item.relatedId}`)
    }
  }

  const readAll = async () => {
    if (!user) return
    setItems(current => current.map(n => ({...n, read: true})))
    try {
      await markAllAsRead(user.uid)
    } catch {
      await load()
    }
  }

  const unread = items.filter(item => !item.read).length

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <FlatList
      style={styles.screen}
      data={items}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        unread > 0 ? (
          <Pressable onPress={readAll} style={styles.readAll}>
            <Text style={styles.readAllText}>
              {t.buttons.markAllAsRead} · {unread}
            </Text>
          </Pressable>
        ) : null
      }
      renderItem={({item}) => (
        <Pressable
          onPress={() => open(item)}
          style={({pressed}) => [styles.card, !item.read && styles.cardUnread, pressed && styles.cardPressed]}
        >
          <View style={styles.cardHead}>
            {!item.read && <View style={styles.dot} />}
            <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
          </View>
          <Text style={styles.message}>{item.message}</Text>
          <Text style={styles.date}>{item.createdAt?.slice(0, 10)}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>{t.notifications.empty}</Text>}
    />
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.gray50},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray50},
  list: {padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl},
  readAll: {alignSelf: 'flex-end', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm},
  readAllText: {color: colors.primary, fontSize: fontSize.sm, fontWeight: '600'},
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.xs,
    ...shadow.sm
  },
  cardUnread: {borderLeftWidth: 3, borderLeftColor: colors.primary},
  cardPressed: {opacity: 0.75},
  cardHead: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent},
  title: {flex: 1, fontSize: fontSize.base, color: colors.gray700},
  titleUnread: {fontWeight: '700', color: colors.text},
  message: {fontSize: fontSize.sm, color: colors.gray600, lineHeight: 20},
  date: {fontSize: fontSize.xs, color: colors.gray400},
  empty: {
    fontSize: fontSize.base,
    color: colors.neutral,
    textAlign: 'center',
    paddingVertical: spacing.xxl
  }
})
