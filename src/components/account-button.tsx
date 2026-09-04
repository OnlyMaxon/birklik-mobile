import {Pressable, StyleSheet, Text} from 'react-native'
import {router} from 'expo-router'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

/**
 * Вход или переход в кабинет — в зависимости от того, вошёл ли человек.
 * Выход живёт в самом кабинете, а не здесь: случайное нажатие в шапке не
 * должно выкидывать из учётной записи.
 */
export function AccountButton() {
  const {t} = useLanguage()
  const {user, profile, loading} = useAuth()

  // Пока идёт первая проверка входа, кнопку не рисуем: показать «Войти»
  // вошедшему на долю секунды хуже, чем не показать ничего.
  if (loading) return null

  if (!user) {
    return (
      <Pressable onPress={() => router.push('/login')} style={styles.button} hitSlop={6}>
        <Text style={styles.label}>{t.nav.login}</Text>
      </Pressable>
    )
  }

  const name = profile?.name || user.email || ''

  return (
    <Pressable onPress={() => router.push('/account')} style={styles.button} hitSlop={6}>
      <Text style={styles.label} numberOfLines={1}>
        {name.split(' ')[0] || t.nav.dashboard}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryDark,
    maxWidth: 110
  },
  label: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '600'
  }
})
