import {useCallback, useEffect, useMemo, useState} from 'react'
import {StyleSheet, Text, View} from 'react-native'
import {Calendar, LocaleConfig, type DateData} from 'react-native-calendars'
import {router} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import type {Booking, Property} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import {
  BookingConflictError,
  createBooking,
  getBlockingBookings,
  overlaps
} from '@/services/booking-service'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

/** 'YYYY-MM-DD' — тот же вид, в котором даты лежат в базе. */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function shiftIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

/** Все даты между границами включительно — для закраски занятого и выбранного. */
function datesBetween(from: string, to: string): string[] {
  const result: string[] = []
  for (let day = from; day <= to; day = shiftIso(day, 1)) result.push(day)
  return result
}

const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
] as const

// ⚠️ Порядок от ВОСКРЕСЕНЬЯ: календарь ожидает список именно в таком порядке
// независимо от того, с какого дня начинается неделя на экране. В словаре дни
// лежат объектом, а `property.weekDayLabels` идёт от понедельника — взять его
// как есть значило бы сдвинуть подписи столбцов на один день.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

type Props = {
  property: Property
}

/**
 * Бронирование объявления.
 *
 * Повторяет карточку брони с сайта: месячный календарь, занятые дни закрашены и
 * не выбираются, выбранный отрезок подсвечен, ниже — расчёт по ночам.
 *
 * Календарь взят на чистом JavaScript намеренно: обычный выбор даты Android
 * (`@react-native-community/datetimepicker`) — нативный модуль, а его добавление
 * потребовало бы пересборки приложения. Здесь же выходит и ближе к сайту.
 *
 * Заявка уходит со статусом `pending`: подтверждает её владелец. Так же на
 * сайте, и того же требуют правила Firestore — подтвердить бронь за себя гость
 * не может.
 */
export function BookingCard({property}: Props) {
  const {language, t} = useLanguage()
  const {user, profile} = useAuth()

  // Названия месяцев и дней недели берём из общего пакета, а не из встроенных
  // английских: календарь на сайте подписан на языке страницы.
  //
  // ⚠️ Настройка выполняется во время ОТРИСОВКИ, а не в эффекте. Эффекты
  // срабатывают после первого кадра, и заголовок таблицы успевал отрисоваться
  // по-английски: месяц потом обновлялся, а строка дней недели оставалась
  // Mon/Tue/Wed. Здесь же настройка гарантированно применена до календаря.
  useMemo(() => {
    LocaleConfig.locales[language] = {
      monthNames: MONTH_KEYS.map(key => t.calendar.months[key]),
      // Коротких названий месяцев в словарях нет, а поле обязательное:
      // подрезаем полные. В обычной раскладке календарь их не показывает.
      monthNamesShort: MONTH_KEYS.map(key => t.calendar.months[key].slice(0, 3)),
      // Полных названий дней тоже нет — ставим те же короткие.
      dayNames: DAY_KEYS.map(key => t.calendar.days[key]),
      dayNamesShort: DAY_KEYS.map(key => t.calendar.days[key])
    }
    LocaleConfig.defaultLocale = language
  }, [language, t])

  const today = useMemo(() => toIsoDate(new Date()), [])

  const [checkIn, setCheckIn] = useState<string | null>(null)
  const [checkOut, setCheckOut] = useState<string | null>(null)
  const [busy, setBusy] = useState<Booking[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  // Занятые даты подгружаем заранее, чтобы человек не выбирал занятое, а не
  // узнавал об этом после отказа. Чтение броней правила разрешают любому
  // вошедшему — ровно ради такой проверки.
  const loadBusy = useCallback(async () => {
    try {
      setBusy(await getBlockingBookings(property.id))
    } catch {
      // Не вышло — не беда: занятость всё равно проверяется при отправке.
      setBusy([])
    }
  }, [property.id])

  useEffect(() => {
    void loadBusy()
  }, [loadBusy])

  // Занятые дни. Выезд чужой брони не занимает день — в этот день заезжает
  // следующий, поэтому верхняя граница берётся на сутки раньше.
  const busyDays = useMemo(() => {
    const days = new Set<string>()
    for (const booking of busy) {
      if (!booking.checkInDate || !booking.checkOutDate) continue
      for (const day of datesBetween(booking.checkInDate, shiftIso(booking.checkOutDate, -1))) {
        days.add(day)
      }
    }
    return days
  }, [busy])

  const marked = useMemo(() => {
    const result: Record<string, object> = {}

    for (const day of busyDays) {
      result[day] = {disabled: true, disableTouchEvent: true, marked: true, dotColor: colors.error}
    }

    if (checkIn && checkOut) {
      const span = datesBetween(checkIn, checkOut)
      span.forEach((day, index) => {
        result[day] = {
          ...result[day],
          color: colors.primary,
          textColor: colors.white,
          startingDay: index === 0,
          endingDay: index === span.length - 1
        }
      })
    } else if (checkIn) {
      result[checkIn] = {
        ...result[checkIn],
        color: colors.primary,
        textColor: colors.white,
        startingDay: true,
        endingDay: true
      }
    }

    return result
  }, [busyDays, checkIn, checkOut])

  const nights =
    checkIn && checkOut
      ? Math.round(
          (new Date(`${checkOut}T00:00:00`).getTime() - new Date(`${checkIn}T00:00:00`).getTime()) /
            86_400_000
        )
      : 0
  const total = nights > 0 ? nights * property.price.daily : 0

  const onDayPress = (day: DateData) => {
    setError('')

    // Первое нажатие ставит заезд, второе — выезд. Третье начинает заново:
    // так же ведёт себя календарь на сайте и в любом сервисе бронирования.
    if (!checkIn || (checkIn && checkOut)) {
      setCheckIn(day.dateString)
      setCheckOut(null)
      return
    }

    if (day.dateString <= checkIn) {
      setCheckIn(day.dateString)
      return
    }

    // Между выбранными датами не должно оказаться занятых дней — иначе отрезок
    // перекрыл бы чужую бронь целиком.
    const crosses = datesBetween(checkIn, shiftIso(day.dateString, -1)).some(d => busyDays.has(d))
    if (crosses) {
      setError(t.property.dateNotAvailable)
      return
    }

    setCheckOut(day.dateString)
  }

  const submit = async () => {
    if (!user) {
      router.push('/login')
      return
    }
    if (!checkIn || !checkOut || nights <= 0) {
      setError(t.property.errorSelectDates)
      return
    }
    if (busy.some(booking => overlaps(checkIn, checkOut, booking))) {
      setError(t.property.bookingConflict)
      return
    }

    setSending(true)
    setError('')
    try {
      await createBooking({
        property,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        guest: {
          uid: user.uid,
          name: profile?.name ?? '',
          email: user.email ?? '',
          phone: profile?.phone ?? ''
        }
      })
      setDone(true)
    } catch (err) {
      setError(
        err instanceof BookingConflictError ? t.property.bookingConflict : t.property.bookingError
      )
      // Раз столкнулись — список занятого у нас устарел, перечитываем.
      void loadBusy()
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return (
      <View style={[styles.card, styles.cardDone]}>
        <Ionicons name="checkmark-circle" size={30} color={colors.success} />
        <Text style={styles.doneTitle}>{t.property.bookingSent}</Text>
        <Text style={styles.doneBody}>{t.property.bookingAddedToCabinet}</Text>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t.property.bookingRequest}</Text>

      <Calendar
        // Пересоздаём при смене языка: подписи заголовка календарь берёт один
        // раз при построении и сам их не обновляет.
        key={language}
        minDate={today}
        markingType="period"
        markedDates={marked}
        onDayPress={onDayPress}
        firstDay={1}
        theme={{
          todayTextColor: colors.primary,
          arrowColor: colors.primary,
          textDayFontWeight: '500',
          textMonthFontWeight: '700'
        }}
      />

      <View style={styles.dates}>
        <Slot label={t.property.checkIn} value={checkIn} placeholder={t.booking.selectCheckIn} />
        <Slot label={t.property.checkOut} value={checkOut} placeholder={t.booking.selectCheckOut} />
      </View>

      {nights > 0 && (
        <View style={styles.summary}>
          <Row
            label={`${property.price.daily} ₼ × ${nights} ${t.booking.nights}`}
            value={`${total} ₼`}
          />
          <Row label={t.booking.total} value={`${total} ₼`} strong />
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        title={user ? t.property.sendRequest : t.property.signInBook}
        onPress={submit}
        loading={sending}
        disabled={sending || (!!user && nights <= 0)}
      />

      <Text style={styles.note}>{t.property.contactAfterBooking}</Text>
    </View>
  )
}

function Slot({
  label,
  value,
  placeholder
}: {
  label: string
  value: string | null
  placeholder: string
}) {
  return (
    <View style={styles.slot}>
      <Text style={styles.slotLabel}>{label}</Text>
      <Text style={[styles.slotValue, !value && styles.slotPlaceholder]}>
        {value ?? placeholder}
      </Text>
    </View>
  )
}

function Row({label, value, strong}: {label: string; value: string; strong?: boolean}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.rowStrong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.gray200,
    padding: spacing.base,
    gap: spacing.base
  },
  cardDone: {alignItems: 'center', gap: spacing.sm},
  cardTitle: {fontSize: fontSize.lg, fontWeight: '700', color: colors.text},
  doneTitle: {fontSize: fontSize.base, fontWeight: '700', color: colors.text, textAlign: 'center'},
  doneBody: {fontSize: fontSize.sm, color: colors.gray600, textAlign: 'center', lineHeight: 20},
  dates: {flexDirection: 'row', gap: spacing.sm},
  slot: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2
  },
  slotLabel: {fontSize: fontSize.xs, color: colors.gray500, fontWeight: '700'},
  slotValue: {fontSize: fontSize.sm, color: colors.text, fontWeight: '600'},
  slotPlaceholder: {color: colors.gray400, fontWeight: '400'},
  summary: {gap: 4},
  row: {flexDirection: 'row', justifyContent: 'space-between'},
  rowLabel: {fontSize: fontSize.sm, color: colors.gray600},
  rowValue: {fontSize: fontSize.sm, color: colors.text},
  rowStrong: {fontWeight: '700', color: colors.text},
  error: {fontSize: fontSize.sm, color: colors.error},
  note: {fontSize: fontSize.xs, color: colors.gray500, lineHeight: 18}
})
