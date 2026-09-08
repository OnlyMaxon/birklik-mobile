import {useCallback, useEffect, useState} from 'react'
import {Pressable, StyleSheet, Text, View} from 'react-native'
import {router, useFocusEffect} from 'expo-router'
// Набор иконок, а не react-native-svg: последний тянет нативный модуль и
// потребовал бы пересборки. Этот подгружает шрифт через expo-font, который
// в проекте уже есть, — обходится обычной установкой пакета.
import {Ionicons} from '@expo/vector-icons'

import {useAuth} from '@/auth/auth-provider'
import {getUnreadCount} from '@/services/notifications-service'
import {colors, fontSize} from '@/theme/theme'

// Как в шапке сайта: счётчик обновляется раз в полминуты. Чаще незачем —
// уведомления приходят редко, а каждый обход это запрос к Firestore.
const REFRESH_MS = 30_000

/**
 * Колокольчик с числом непрочитанных.
 *
 * Гостю не показывается вовсе: уведомления привязаны к учётной записи, и
 * пустой колокольчик у невошедшего только сбивает с толку.
 *
 * Счётчик пересчитывается ещё и при каждом возврате на экран: человек
 * заходит в список, читает всё и возвращается — значок обязан погаснуть
 * сразу, а не через полминуты.
 */
export function NotificationsButton() {
  const {user, loading} = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0)
      return
    }
    setCount(await getUnreadCount(user.uid))
  }, [user])

  useEffect(() => {
    void refresh()
    if (!user) return
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [user, refresh])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh])
  )

  if (loading || !user) return null

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      style={styles.button}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
    >
      <Ionicons name="notifications-outline" size={23} color={colors.gray700} />

      {count > 0 && (
        <View style={styles.badge}>
          {/* Больше девяти показываем как 9+: трёхзначное число не помещается
              в кружок и растягивает шапку. */}
          <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    padding: 4
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: fontSize.xs
  }
})
