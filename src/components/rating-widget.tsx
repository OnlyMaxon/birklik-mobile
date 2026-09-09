import {useState} from 'react'
import {Pressable, StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import type {Property} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {addRating} from '@/services/interactions-service'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

type Props = {
  property: Property
}

const STARS = [1, 2, 3, 4, 5]

/**
 * Оценка объявления.
 *
 * Оценивать разрешено только тому, кто здесь останавливался, — проверяет это
 * сервер, а не экран: правило одно для сайта и приложения, и обойти его с
 * телефона нельзя. Отказ `not-booked` объясняем словами, а не общим «ошибка».
 *
 * Средняя оценка и число отзывов приходят с сервера пересчитанными — своё
 * среднее не считаем, иначе оно разошлось бы с тем, что показывает сайт.
 */
export function RatingWidget({property}: Props) {
  const {t} = useLanguage()
  const {user} = useAuth()

  const [average, setAverage] = useState(property.rating ?? 0)
  const [reviews, setReviews] = useState(property.reviews ?? 0)
  const [mine, setMine] = useState<number | null>(
    user && property.ratings ? (property.ratings[user.uid] ?? null) : null
  )
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  const rate = async (value: number) => {
    if (!user) {
      router.push('/login')
      return
    }
    if (sending) return

    setSending(true)
    setMessage('')
    try {
      const result = await addRating(property.id, value)
      if (result.success) {
        setMine(value)
        setAverage(result.rating)
        setReviews(result.reviews)
        setMessage(t.property.rateSaved)
      } else {
        setMessage(
          result.error === 'not-booked' ? t.property.onlyRateBooked : t.property.rateError
        )
      }
    } catch {
      setMessage(t.property.rateError)
    } finally {
      setSending(false)
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t.property.rateProperty}</Text>
        <Text style={styles.average}>
          {reviews > 0 ? `${average} · ${reviews} ${t.property.reviewsCount}` : t.property.notRated}
        </Text>
      </View>

      <View style={styles.stars}>
        {STARS.map(value => (
          <Pressable key={value} onPress={() => rate(value)} disabled={sending} hitSlop={4}>
            <Ionicons
              name={(mine ?? 0) >= value ? 'star' : 'star-outline'}
              size={30}
              color={(mine ?? 0) >= value ? colors.warning : colors.gray300}
            />
          </Pressable>
        ))}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {!user ? <Text style={styles.hint}>{t.property.signInRate}</Text> : null}
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
    gap: spacing.sm
  },
  head: {gap: 2},
  title: {fontSize: fontSize.base, fontWeight: '700', color: colors.text},
  average: {fontSize: fontSize.sm, color: colors.neutral},
  stars: {flexDirection: 'row', gap: spacing.xs},
  message: {fontSize: fontSize.sm, color: colors.gray600, lineHeight: 20},
  hint: {fontSize: fontSize.xs, color: colors.gray400}
})
