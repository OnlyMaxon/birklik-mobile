import {useEffect} from 'react'

import {useAuth} from '@/auth/auth-provider'
import {registerPushToken, watchPushTaps, watchTokenRefresh} from '@/services/push-service'

/**
 * Подключает пуши. Ничего не рисует — живёт в дереве ради подписок.
 *
 * Стоит внутри `AuthProvider`, потому что токен пишется в профиль и без
 * входа его девать некуда. Отдельным компонентом, а не в корневом layout:
 * тот рендерится выше провайдера и `useAuth` оттуда недоступен.
 */
export function PushRegistrar() {
  const {user} = useAuth()
  const userId = user?.uid

  useEffect(() => {
    if (!userId) return

    // Отказ в разрешении служба гасит сама — здесь перехват на случай сети:
    // запись токена может не дойти, и падать из-за этого приложению незачем.
    void registerPushToken(userId).catch(() => undefined)

    return watchTokenRefresh(userId)
  }, [userId])

  // Нажатия слушаем независимо от входа. Пуш приходит только тому, чей токен
  // записан, то есть вошедшему, — но запуск нажатием происходит ДО того, как
  // SDK восстановит вход, и ждать его здесь значило бы потерять переход.
  useEffect(() => watchPushTaps(), [])

  return null
}
