import {useState} from 'react'
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native'
import {Link} from 'expo-router'

import type {Booking} from '@birklik/core/types'

import {useLanguage} from '@/i18n/language-provider'
import {cancelBooking, respondToBooking} from '@/services/booking-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  /** Брони, которые оформил сам человек. */
  mine: Booking[]
  /** Заявки на его объявления — то, на что ему отвечать. */
  requests: Booking[]
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
export function AccountBookings({mine, requests, onChanged}: Props) {
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
            <BookingRow key={booking.id} booking={booking} incoming onChanged={onChanged} />
          ))}
        </View>
      )}

      {mine.length > 0 && (
        <View style={styles.group}>
          <Text style={styles.groupTitle}>
            {t.dashboard.bookingMyBookings} · {mine.length}
          </Text>
          {mine.map(booking => (
            <BookingRow key={booking.id} booking={booking} onChanged={onChanged} />
          ))}
        </View>
      )}
    </View>
  )
}

function BookingRow({
  booking,
  incoming,
  onChanged
}: {
  booking: Booking
  incoming?: boolean
  onChanged: () => Promise<void>
}) {
  const {t} = useLanguage()
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

      <Link href={`/property/${booking.propertyId}`} asChild>
        <Pressable hitSlop={6}>
          <Text style={styles.link}>#{booking.propertyId}</Text>
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
  link: {fontSize: fontSize.xs, color: colors.primary},
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
