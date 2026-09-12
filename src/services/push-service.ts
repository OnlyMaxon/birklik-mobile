import {PermissionsAndroid, Platform} from 'react-native'
import {arrayRemove, arrayUnion, doc, updateDoc} from '@react-native-firebase/firestore'
import {
  deleteToken,
  getInitialNotification,
  getMessaging,
  getToken,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission
} from '@react-native-firebase/messaging'
import {router} from 'expo-router'

import {app, db} from '@/lib/firebase'

/**
 * Пуш-уведомления на устройстве.
 *
 * Серверной части здесь нет и не нужно: функция `onNotificationCreated` в вебе
 * уже срабатывает на создание документа `users/{id}/notifications/{id}` и
 * рассылает пуш через `sendPushToUser`. Та читает токены из `users.fcmTokens`,
 * сама удаляет мёртвые и ничего не знает про платформу. Приложению остаётся
 * единственное — положить свой токен в то же поле.
 *
 * Поэтому общего кода с сайтом тут нет совсем: на вебе токен выдаёт
 * `firebase/messaging` через VAPID-ключ и зарегистрированный service worker
 * (`src/hooks/use-push-notifications.ts`), здесь — нативный FCM по
 * `google-services.json`. Одинаково только место записи.
 *
 * Правила менять не потребовалось: `users/{userId}` разрешает владельцу
 * обновлять свой документ, запрещая лишь ключи `moderator`, `admin` и
 * `isModerator`. `fcmTokens` под запрет не попадает.
 */

const messaging = getMessaging(app)

/**
 * Спрашивает разрешение показывать уведомления.
 *
 * ⚠️ `requestPermission` из messaging на Android — **пустышка**: он сразу
 * отвечает AUTHORIZED и системного окна не показывает. С Android 13 (API 33)
 * уведомления требуют разрешения `POST_NOTIFICATIONS`, и запросить его можно
 * только через `PermissionsAndroid`. Полагаться на messaging тут — самый тихий
 * способ остаться без пушей: токен выдаётся, отправка проходит, а уведомление
 * система молча выбрасывает.
 *
 * До Android 13 разрешение выдаётся при установке, и `PermissionsAndroid`
 * отвечает отказом на незнакомое имя — поэтому ветка по версии, а не вслепую.
 */
async function askPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      )
      return result === PermissionsAndroid.RESULTS.GRANTED
    }
    return true
  }

  // iOS. AuthorizationStatus наружу пакет не экспортирует, значения: 1 —
  // разрешено, 2 — «тихое» разрешение без звука, их обоих достаточно.
  const status = await requestPermission(messaging)
  return status === 1 || status === 2
}

async function saveToken(userId: string, token: string): Promise<void> {
  // arrayUnion, а не чтение с заменой: у человека бывает несколько устройств,
  // и перезапись массива стёрла бы токены остальных. Повтор arrayUnion
  // игнорирует сам, поэтому предварительная проверка на вхождение не нужна.
  await updateDoc(doc(db, 'users', userId), {fcmTokens: arrayUnion(token)})
}

/**
 * Регистрирует устройство: разрешение, токен, запись в профиль.
 *
 * Отказ не считается ошибкой и ничего не ломает: человек просто не получает
 * пушей, а список уведомлений в приложении продолжает работать — он читается
 * из Firestore и к пушам отношения не имеет.
 */
export async function registerPushToken(userId: string): Promise<void> {
  const allowed = await askPermission()
  if (!allowed) return

  const token = await getToken(messaging)
  if (token) await saveToken(userId, token)
}

/**
 * Снимает токен с учётной записи. Вызывать **до** выхода: после него
 * `request.auth` пуст, и правила запись отклонят.
 *
 * Зачем вообще: на одном телефоне учётные записи меняются. Оставишь токен у
 * прежнего владельца — его уведомления продолжат приходить на это устройство,
 * и следующий человек прочтёт чужое на заблокированном экране.
 *
 * Токен удаляется и в самом FCM: иначе SDK вернёт его же при следующем входе,
 * и он снова окажется в профиле, откуда мы его только что убрали.
 */
export async function removePushToken(userId: string): Promise<void> {
  try {
    const token = await getToken(messaging)
    if (token) {
      await updateDoc(doc(db, 'users', userId), {fcmTokens: arrayRemove(token)})
    }
    await deleteToken(messaging)
  } catch {
    // Выходу из учётной записи мешать нельзя. Не снялся — протухнет сам:
    // sendPushToUser вычищает токены, на которые FCM ответил
    // registration-token-not-registered.
  }
}

/**
 * Следит за сменой токена. FCM меняет его сам — при переустановке, чистке
 * данных приложения, восстановлении из резервной копии. Не подписаться значит
 * однажды тихо перестать получать уведомления: в профиле останется старый.
 */
export function watchTokenRefresh(userId: string): () => void {
  return onTokenRefresh(messaging, token => {
    void saveToken(userId, token).catch(() => undefined)
  })
}

/**
 * Куда вести по нажатию на уведомление.
 *
 * Правило то же, что на экране уведомлений (`src/app/notifications.tsx`):
 * про бронь — в кабинет, остальное — на объявление. Расходиться они не должны,
 * иначе одно и то же уведомление уводит в разные места из списка и из шторки.
 *
 * Имена полей задаёт отправитель — `sendPushToUser` кладёт `type` и
 * `propertyId` (туда уходит `relatedId` уведомления).
 */
function openFromPush(data: Record<string, unknown> | undefined): void {
  if (!data) return

  const type = typeof data.type === 'string' ? data.type : ''
  const propertyId = typeof data.propertyId === 'string' ? data.propertyId : ''

  if (type === 'booking' || type === 'bookingApproved' || type === 'bookingRejected') {
    router.push('/account')
  } else if (propertyId) {
    router.push(`/property/${propertyId}`)
  } else {
    router.push('/notifications')
  }
}

/**
 * Нажатие на уведомление. Два разных случая, и нужны оба:
 *
 * - `onNotificationOpenedApp` — приложение было свёрнуто и возвращается;
 * - `getInitialNotification` — приложение было закрыто и запускается нажатием.
 *   Это не событие, а одноразовый вопрос «чем меня открыли», и задать его
 *   нужно при старте. Забудешь — запуск из шторки приведёт на главный экран,
 *   как обычный запуск, и выглядит это как «уведомления не работают».
 */
export function watchPushTaps(): () => void {
  const stop = onNotificationOpenedApp(messaging, message => {
    openFromPush(message?.data)
  })

  void getInitialNotification(messaging)
    .then(message => {
      if (message) openFromPush(message.data)
    })
    .catch(() => undefined)

  return stop
}
