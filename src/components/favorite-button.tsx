import {useState} from 'react'
import {Pressable, StyleSheet} from 'react-native'
import {router} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {toggleFavorite} from '@/services/favorites-service'
import {colors, radius, shadow} from '@/theme/theme'

type Props = {
  propertyId: string
  favorites: string[] | undefined
  size?: 'small' | 'large'
}

// Красный сохранённого состояния взят из `.property-favorite-btn.bookmarked`
// на сайте. Там он градиентом, здесь сплошной: градиент в React Native требует
// отдельной библиотеки с нативной частью, а разница на кружке в 36 точек
// неразличима.
const SAVED = '#e74c3c'

/**
 * Кнопка «Сохранить».
 *
 * Значок — закладка, а не сердце. На сайте это `bookmark`, и подпись у кнопки
 * тоже про закладку (`t.buttons.bookmark`); сердце здесь было расхождением с
 * вебом, а не заменой значка.
 *
 * Оформление оттуда же: зелёный кружок с белым значком, при сохранении кружок
 * краснеет.
 *
 * Состояние держится здесь и меняется сразу, не дожидаясь Firestore: ждать
 * ответа сети на нажатие — заметная задержка на ровном месте. Если запись не
 * прошла, отметка возвращается обратно.
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

  const large = size === 'large'

  return (
    <Pressable
      onPress={press}
      style={[styles.button, large && styles.buttonLarge, active && styles.buttonActive]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t.buttons.bookmark}
    >
      <Ionicons
        name={active ? 'bookmark' : 'bookmark-outline'}
        size={large ? 22 : 18}
        color={colors.white}
      />
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
    backgroundColor: colors.primary,
    ...shadow.sm
  },
  buttonLarge: {width: 44, height: 44},
  buttonActive: {backgroundColor: SAVED}
})
