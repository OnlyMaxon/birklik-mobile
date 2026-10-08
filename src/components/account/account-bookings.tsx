import {useState} from 'react'
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native'
import {Image} from 'expo-image'
import {Link} from 'expo-router'

import type {Booking, Property} from '@birklik/core/types'

import {useLanguage} from '@/i18n/language-provider'
import {cancelBooking, respondToBooking} from '@/services/booking-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  /** Брони, которые оформил сам человек. */
  mine: Booking[]
  /** Заявки на его объявления — то, на что ему отвечать. */
  requests: Booking[]
  /** Объявления по идентификатору — ради снимка и названия в карточке. */
  properties: Map<string, Property>
  onChanged: () => Promise<void>
}

/**
 * Брони в кабинете — обе стороны, как на сайте: свои поездки и заявки на свои
 * объявления.
 *
 * ⚠️ Статусы читаются из данных, а не из типа: в боевой базе попадаются брони
 * со статусом `active`, которого в типе `Booking` нет. Поэтому подпись
 * подбирается по известным значениям с запасным вариантом, а не жёстким
 * перебором — иначе такая запись осталась бы без подписи вовсе.
 */
export function AccountBookings({mine, requests, properties, onChanged}: Props) {
  const {t} = useLanguage()

  if (mine.length === 0 && requests.length === 0) {
    return <Text style={styles.empty}>{t.dashboard.bookingNoBookings}</Text>
  }

  return (
    <View style={styles.wrap}>
      {requests.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>
            {t.dashboard.bookingRequests} · {requests.length}
          </Text>
          {requests.map(booking => (
            <BookingRow
              key={booking.id}
              booking={booking}
              property={properties.get(booking.propertyId)}
              incoming
              onChanged={onChanged}
            />
          ))}
        </View>
      )}

      {mine.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>
            {t.dashboard.bookingMyBookings} · {mine.length}
          </Text>
          {mine.map(booking => (
            <BookingRow
              key={booking.id}
              booking={booking}
              property={properties.get(booking.propertyId)}
              onChanged={onChanged}
            />
          ))}
        </View>
      )}
    </View>
  )
}

function BookingRow({
  booking,
  property,
  incoming,
  onChanged
}: {
  booking: Booking
  property?: Property
  incoming?: boolean
  onChanged: () => Promise<void>
}) {
  const {language, t} = useLanguage()
  const [busy, setBusy] = useState(false)

  const status = booking.status as string
  const label =
    status === 'approved'
      ? t.dashboard.bookingApproved
      : status === 'rejected'
        ? t.dashboard.bookingRejected
        : status === 'pending'
          ? t.dashboard.bookingWaiting
          : status

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      await onChanged()
    } catch {
      Alert.alert(t.messages.error)
    } finally {
      setBusy(false)
    }
  }

  const confirmCancel = () =>
    Alert.alert(t.dashboard.bookingCancel, undefined, [
      {
        text: t.dashboard.bookingCancel,
        style: 'destructive',
        onPress: () => void run(() => cancelBooking(booking))
      },
      {text: t.buttons.cancel, style: 'cancel'}
    ])

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.dates}>
          {booking.checkInDate} → {booking.checkOutDate}
        </Text>
        <View style={[styles.badge, badgeStyle(status)]}>
          <Text style={styles.badgeText}>{label}</Text>
        </View>
      </View>

      <Text style={styles.meta}>
        {booking.nights} {t.booking.nights} · {booking.totalPrice} ₼
      </Text>

      {/* Владельцу показываем, кто просится, — иначе отвечать вслепую.
          Гостю имя и телефон не нужны: это его собственные данные. */}
      {incoming ? (
        <Text style={styles.meta}>
          {booking.userName}
          {booking.userPhone ? ` · ${booking.userPhone}` : ''}
        </Text>
      ) : null}

      {/* ⚠️ Раньше здесь стоял голый `#{propertyId}`. По идентификатору
          понять, к какому дому заявка, нельзя — а владельцу с несколькими
          объявлениями это первое, что нужно. Снимок узнаётся с одного
          взгляда, название подтверждает.

          Объявление может не прийти: его могли удалить, а бронь осталась.
          Тогда показываем то же, что и раньше, — всё лучше пустоты. */}
      <Link href={`/property/${booking.propertyId}`} asChild>
        <Pressable style={styles.property} hitSlop={6}>
          {property?.images?.[0] ? (
            <Image
              source={{uri: property.images[0]}}
              style={styles.thumb}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Text style={styles.thumbEmptyText}>{t.property.gallery}</Text>
            </View>
          )}
          <View style={styles.propertyText}>
            <Text style={styles.propertyTitle} numberOfLines={2}>
              {property
                ? property.title?.[language] || property.title?.az || ''
                : `#${booking.propertyId}`}
            </Text>
            {property ? (
              <Text style={styles.propertyPlace} numberOfLines={1}>
                {[property.city, property.district].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Link>

      {booking.rejectionReason ? (
        <Text style={styles.reason}>{booking.rejectionReason}</Text>
      ) : null}

      {incoming && status === 'pending' ? (
        <View style={styles.actions}>
          <Pressable
            style={[styles.button, styles.accept]}
            disabled={busy}
            onPress={() => void run(() => respondToBooking(booking.id, true))}
          >
            <Text style={styles.acceptText}>{t.dashboard.bookingAccept}</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.reject]}
            disabled={busy}
            onPress={() => void run(() => respondToBooking(booking.id, false))}
          >
            <Text style={styles.rejectText}>{t.dashboard.bookingReject}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Гость снимает ожидающую заявку сам, а подтверждённую только просит
          отменить — правила прямого перехода ему не дают. */}
      {!incoming && (status === 'pending' || status === 'approved') ? (
        <Pressable style={[styles.button, styles.cancel]} disabled={busy} onPress={confirmCancel}>
          <Text style={styles.cancelText}>{t.dashboard.bookingCancel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function badgeStyle(status: string) {
  if (status === 'approved') return styles.badgeApproved
  if (status === 'rejected' || status === 'cancelled') return styles.badgeRejected
  return styles.badgePending
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.base},
  group: {gap: spacing.sm},
  groupTitle: {fontSize: fontSize.sm, fontWeight: '700', color: colors.gray600},
  empty: {fontSize: fontSize.sm, color: colors.neutral, paddingVertical: spacing.lg},
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.xs,
    ...shadow.sm
  },
  cardHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm},
  dates: {flex: 1, fontSize: fontSize.sm, fontWeight: '700', color: colors.text},
  badge: {paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm},
  badgePending: {backgroundColor: colors.gray100},
  badgeApproved: {backgroundColor: '#e8f5ee'},
  badgeRejected: {backgroundColor: '#fdecea'},
  badgeText: {fontSize: fontSize.xs, fontWeight: '600', color: colors.gray700},
  meta: {fontSize: fontSize.sm, color: colors.gray600},
  // Объявление в карточке брони: снимок слева, название и место справа.
  property: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.base,
    backgroundColor: colors.gray100
  },
  thumbEmpty: {alignItems: 'center', justifyContent: 'center'},
  thumbEmptyText: {fontSize: 9, color: colors.gray400, textAlign: 'center'},
  // ⚠️ `minWidth: 0` обязателен: без него длинное название распирает строку и
  // выталкивает снимок за край карточки.
  propertyText: {flex: 1, minWidth: 0, gap: 2},
  propertyTitle: {fontSize: fontSize.sm, fontWeight: '600', color: colors.text},
  propertyPlace: {fontSize: fontSize.xs, color: colors.neutral},
  reason: {fontSize: fontSize.sm, color: colors.error, fontStyle: 'italic'},
  actions: {flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs},
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm
  },
  accept: {backgroundColor: colors.primary},
  acceptText: {color: colors.white, fontSize: fontSize.sm, fontWeight: '700'},
  reject: {backgroundColor: colors.gray100},
  rejectText: {color: colors.gray700, fontSize: fontSize.sm, fontWeight: '600'},
  cancel: {backgroundColor: colors.gray100, marginTop: spacing.xs},
  cancelText: {color: colors.error, fontSize: fontSize.sm, fontWeight: '600'}
})
