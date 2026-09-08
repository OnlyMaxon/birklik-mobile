import {Image} from 'expo-image'
import {Pressable, StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, spacing} from '@/theme/theme'

/**
 * Вход или переход в кабинет — в зависимости от того, вошёл ли человек.
 *
 * Выход живёт в самом кабинете, а не здесь: случайное нажатие в шапке не
 * должно выкидывать из учётной записи.
 *
 * Вошедшему показывается кружок с портретом или первой буквой имени — как
 * `.user-avatar` в шапке сайта. Имя рядом не пишем: на телефоне оно съедало бы
 * половину шапки, а на сайте место есть.
 */
export function AccountButton() {
  const {t} = useLanguage()
  const {user, profile, loading} = useAuth()

  // Пока идёт первая проверка входа, кнопку не рисуем: показать «Войти»
  // вошедшему на долю секунды хуже, чем не показать ничего.
  if (loading) return null

  if (!user) {
    return (
      <Pressable onPress={() => router.push('/login')} style={styles.loginButton} hitSlop={6}>
        <Text style={styles.loginLabel}>{t.nav.login}</Text>
      </Pressable>
    )
  }

  const name = profile?.name || user.email || ''
  const initial = name.trim().charAt(0).toUpperCase()

  return (
    <Pressable
      onPress={() => router.push('/account')}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t.nav.dashboard}
    >
      <View style={styles.avatar}>
        {profile?.avatar ? (
          <Image source={{uri: profile.avatar}} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <Text style={styles.avatarLetter}>{initial || '?'}</Text>
        )}
      </View>
    </Pressable>
  )
}

const AVATAR = 32

const styles = StyleSheet.create({
  loginButton: {
    paddingHorizontal: spacing.base,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.primary
  },
  loginLabel: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700'
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  avatarImage: {
    width: '100%',
    height: '100%'
  },
  avatarLetter: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '700'
  }
})
