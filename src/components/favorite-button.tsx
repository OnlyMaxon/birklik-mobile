import {useState} from 'react'
import {Pressable, StyleSheet, Text} from 'react-native'
import {router} from 'expo-router'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {toggleFavorite} from '@/services/favorites-service'
import {colors, fontSize, radius, shadow} from '@/theme/theme'

type Props = {
  propertyId: string
  favorites: string[] | undefined
  size?: 'small' | 'large'
}

/**
 * Сердечко.
 *
 * Состояние держится здесь и меняется сразу, не дожидаясь Firestore: ждать
 * ответа сети на нажатие сердечка — заметная задержка на ровном месте. Если
 * запись не прошла, отметка возвращается обратно.
 *
 * Гостя отправляем на вход. Записать за него нельзя: правила требуют, чтобы
 * добавляемый идентификатор совпадал с вошедшим.
 */
export function FavoriteButton({propertyId, favorites, size = 'small'}: Props) {
  const {user} = useAuth()
  const {t} = useLanguage()

  const [active, setActive] = useState(() => (user ? (favorites ?? []).includes(user.uid) : false))
  const [busy, setBusy] = useState(false)

  const press = async () => {
    if (!user) {
      router.push('/login')
      return
    }
    if (busy) return

    const next = !active
    setActive(next)
    setBusy(true)
    try {
      await toggleFavorite(propertyId, user.uid, active)
    } catch {
      // Не прошло — возвращаем как было, чтобы значок не врал.
      setActive(active)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Pressable
      onPress={press}
      style={[styles.button, size === 'large' && styles.buttonLarge]}
      hitSlop={8}
      accessibilityLabel={t.buttons.bookmark}
    >
      <Text style={[styles.icon, size === 'large' && styles.iconLarge, active && styles.iconActive]}>
        {active ? '♥' : '♡'}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    ...shadow.sm
  },
  buttonLarge: {width: 44, height: 44},
  icon: {
    fontSize: fontSize.lg,
    lineHeight: fontSize.lg + 4,
    color: colors.gray500
  },
  iconLarge: {fontSize: fontSize.xxl, lineHeight: fontSize.xxl + 4},
  iconActive: {color: colors.error}
})
