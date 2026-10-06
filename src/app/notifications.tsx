import {useCallback, useEffect, useMemo, useState} from 'react'
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'

import type {Notification, NotificationType, Property} from '@birklik/core/types'

import {Ionicons} from '@expo/vector-icons'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {getNotifications, markAllAsRead, markAsRead, remove} from '@/services/notifications-service'
import {getOwnerProperties} from '@/services/property-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

/** Значок по виду уведомления — чтобы вид читался до текста. */
const ICONS: Record<NotificationType, React.ComponentProps<typeof Ionicons>['name']> = {
  booking: 'calendar-outline',
  bookingApproved: 'checkmark-circle-outline',
  bookingRejected: 'close-circle-outline',
  comment: 'chatbubble-outline',
  favorite: 'heart-outline',
  reply: 'arrow-undo-outline',
  premium: 'diamond-outline',
  commentReport: 'flag-outline',
  rating: 'star-outline',
  cancellationRequest: 'calendar-outline',
  cancellationApproved: 'checkmark-circle-outline',
  cancellationRejected: 'close-circle-outline',
  listingRejected: 'close-circle-outline',
  invoiceSent: 'document-text-outline'
}

/**
 * Виды, которые относятся к бронированию.
 *
 * Все они ведут в «Брони» кабинета, а не на объявление: принять, отклонить или
 * отменить заявку можно ТОЛЬКО там. На странице объявления брони не видно
 * вообще — раньше такое уведомление открывало корень кабинета, и до нужного
 * экрана человек добирался сам.
 */
const BOOKING_KINDS: NotificationType[] = [
  'booking',
  'bookingApproved',
  'bookingRejected',
  'cancellationRequest',
  'cancellationApproved',
  'cancellationRejected'
]

/** `2026-10-12` → `12.10`. Год не показываем: брони ближние. */
function shortDate(iso?: string): string {
  if (!iso || iso.length < 10) return ''
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
}

export default function NotificationsScreen() {
  const {language, t} = useLanguage()
  const {user} = useAuth()

  const [items, setItems] = useState<Notification[]>([])
  const [own, setOwn] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    try {
      // Свои объявления нужны ради НАЗВАНИЯ: уведомление о брони несёт только
      // `propertyId`, а владельцу важно, на какое из его объявлений заявка.
      // Один запрос на весь список — дешевле, чем по запросу на карточку.
      const [notifications, properties] = await Promise.all([
        getNotifications(user.uid),
        getOwnerProperties(user.uid).catch(() => [] as Property[])
      ])
      setItems(notifications)
      setOwn(properties)
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

  /** Название своего объявления по идентификатору. */
  const titleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const property of own) {
      map.set(property.id, property.title?.[language] || property.title?.az || '')
    }
    return map
  }, [own, language])

  const propertyName = (item: Notification): string => {
    // `propertyTitle` кладут уведомления о чужом объявлении (гостю об ответе),
    // свой справочник закрывает уведомления о собственных.
    if (item.propertyTitle) return item.propertyTitle
    const id = item.propertyId ?? item.relatedId
    return id ? (titleById.get(id) ?? '') : ''
  }

  const open = async (item: Notification) => {
    if (!user) return

    if (!item.read) {
      // Отметка ставится сразу на экране: ждать сети, чтобы убрать точку,
      // незачем. Не прошло — вернётся при следующем обновлении списка.
      setItems(current => current.map(n => (n.id === item.id ? {...n, read: true} : n)))
      void markAsRead(user.uid, item.id).catch(() => undefined)
    }

    if (BOOKING_KINDS.includes(item.type)) {
      router.push('/account/bookings')
      return
    }

    // ⚠️ У жалобы на комментарий `relatedId` — это КОММЕНТАРИЙ, а не
    // объявление: по нему открылась бы несуществующая страница. Объявление у
    // неё лежит отдельно, в `propertyId`.
    const target = item.type === 'commentReport' ? item.propertyId : (item.propertyId ?? item.relatedId)
    if (target) router.push(`/property/${target}`)
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

  /**
   * Удаление — отдельное действие, не «прочитано».
   *
   * Без подтверждения, как и в вебе: кнопка маленькая и отдельная от карточки,
   * промахнуться мимо неё трудно, а лишний вопрос на каждое уведомление
   * раздражает сильнее, чем помогает.
   *
   * Убираем с экрана сразу, не дожидаясь сети. Не прошло — возвращаем список с
   * сервера, чтобы на экране не осталось того, чего на самом деле нет, и
   * наоборот.
   */
  const drop = async (item: Notification) => {
    if (!user) return
    setItems(current => current.filter(n => n.id !== item.id))
    try {
      await remove(user.uid, item.id)
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
        <NotificationCard
          item={item}
          property={propertyName(item)}
          onOpen={() => open(item)}
          onDrop={() => drop(item)}
        />
      )}
      ListEmptyComponent={<Text style={styles.empty}>{t.notifications.empty}</Text>}
    />
  )
}

/**
 * Карточка уведомления.
 *
 * ⚠️ Заголовок берётся по ВИДУ, а не из документа: сервер пишет `title` и
 * `message` по-английски и языка читателя не знает. Подробности собираются из
 * полей документа — они лежали там всегда, но до 2026-10-06 не были описаны в
 * типе, и карточка показывала одну английскую строку.
 *
 * `message` остаётся запасным: у видов без подробностей (favorite, premium,
 * invoiceSent) показать больше нечего, и молчать там хуже, чем сказать
 * по-английски.
 */
function NotificationCard({
  item,
  property,
  onOpen,
  onDrop
}: {
  item: Notification
  property: string
  onOpen: () => void
  onDrop: () => void
}) {
  const {t} = useLanguage()

  /** Строки подробностей — только те, под которые в документе есть данные. */
  const details: string[] = []

  const who = item.bookerName ?? item.commenterName ?? item.raterName ?? item.relatedUserName
  if (who) details.push(`${t.dashboard.bookingGuest}: ${who}`)

  if (item.checkInDate && item.checkOutDate) {
    details.push(
      `${t.dashboard.bookingDates}: ${shortDate(item.checkInDate)} → ${shortDate(item.checkOutDate)}`
    )
  }

  if (item.bookerPhone) details.push(`${t.dashboard.bookingPhone}: ${item.bookerPhone}`)
  if (typeof item.ratingValue === 'number') details.push(`★ ${item.ratingValue}`)
  if (item.commentText) details.push(`«${item.commentText.slice(0, 80)}»`)
  if (item.rejectionReason) details.push(item.rejectionReason)

  return (
    <Pressable
      onPress={onOpen}
      style={({pressed}) => [styles.card, !item.read && styles.cardUnread, pressed && styles.cardPressed]}
    >
      <View style={styles.cardHead}>
        <Ionicons
          name={ICONS[item.type] ?? 'notifications-outline'}
          size={17}
          color={item.read ? colors.gray400 : colors.primary}
        />
        <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={1}>
          {t.notifications.titles[item.type] ?? item.title}
        </Text>
        {!item.read && <View style={styles.dot} />}
        {/* Кнопка внутри нажимаемой карточки: касание по ней до карточки не
            доходит, поэтому удаление не откроет заодно объявление. */}
        <Pressable
          onPress={onDrop}
          hitSlop={10}
          accessibilityLabel={t.buttons.delete}
          style={({pressed}) => [styles.drop, pressed && styles.dropPressed]}
        >
          <Ionicons name="trash-outline" size={16} color={colors.gray400} />
        </Pressable>
      </View>

      {property ? (
        <Text style={styles.property} numberOfLines={1}>
          {property}
        </Text>
      ) : null}

      {details.length > 0 ? (
        details.map((line, index) => (
          <Text key={index} style={styles.detail} numberOfLines={2}>
            {line}
          </Text>
        ))
      ) : (
        <Text style={styles.detail}>{item.message}</Text>
      )}

      <Text style={styles.date}>{item.createdAt?.slice(0, 10)}</Text>
    </Pressable>
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
  drop: {padding: 2},
  dropPressed: {opacity: 0.5},
  title: {flex: 1, fontSize: fontSize.base, color: colors.gray700},
  titleUnread: {fontWeight: '700', color: colors.text},
  property: {fontSize: fontSize.sm, fontWeight: '600', color: colors.text},
  detail: {fontSize: fontSize.sm, color: colors.gray600, lineHeight: 20},
  date: {fontSize: fontSize.xs, color: colors.gray400},
  empty: {
    fontSize: fontSize.base,
    color: colors.neutral,
    textAlign: 'center',
    paddingVertical: spacing.xxl
  }
})
