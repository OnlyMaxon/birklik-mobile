import {
  collection,
  doc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch
} from '@react-native-firebase/firestore'

import type {Notification} from '@birklik/core/types'

import {db} from '@/lib/firebase'

/**
 * Уведомления пользователя.
 *
 * Лежат подколлекцией внутри его же документа: `users/{uid}/notifications`.
 * Правила пускают к чтению только владельца — модератор сюда не заглядывает.
 *
 * Писать в ЧУЖУЮ подколлекцию разрешено намеренно: уведомления рассылает
 * клиент — владельцу о брони, гостю об ответе. Но само уведомление обязано
 * признавать своего адресата, иначе документ мог бы заявить любого получателя.
 */

const PAGE = 50

function path(userId: string) {
  return collection(db, 'users', userId, 'notifications')
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const snapshot = await getDocs(
    query(path(userId), orderBy('createdAt', 'desc'), limitTo(PAGE))
  )
  return snapshot.docs.map(d => ({id: d.id, ...d.data()}) as Notification)
}

/**
 * Сколько уведомлений не прочитано — для значка в шапке.
 *
 * Отдельный запрос, а не подсчёт по загруженному списку: список ограничен
 * полусотней и отсортирован по дате, поэтому непрочитанное постарше в него
 * может не попасть — значок врал бы в меньшую сторону.
 *
 * Отказ гасится нулём: счётчик на значке не то, ради чего стоит показывать
 * человеку ошибку.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const snapshot = await getDocs(query(path(userId), where('read', '==', false)))
    return snapshot.size
  } catch {
    return 0
  }
}

/**
 * Помечает прочитанным — именно помечает, а не удаляет.
 *
 * На сайте эта кнопка полгода удаляла уведомление: `markNotificationAsRead` не
 * вызывался нигде, а `read` не становился `true` никогда. Счётчик в шапке падал
 * только потому, что запись исчезала. Аудит это исправил, здесь сразу верно.
 */
export async function markAsRead(userId: string, notificationId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'notifications', notificationId), {read: true})
}

/**
 * Помечает прочитанными все непрочитанные.
 *
 * Пакетом: по одному запросу на полсотни уведомлений — это полсотни обращений
 * к сети и половина из них, скорее всего, оборвётся на плохой связи посередине.
 * Ограничение Firestore в 500 операций на пакет нам не грозит: за раз читаем
 * пятьдесят.
 */
export async function markAllAsRead(userId: string): Promise<void> {
  const snapshot = await getDocs(query(path(userId), where('read', '==', false), limitTo(PAGE)))
  if (snapshot.empty) return

  const batch = writeBatch(db)
  snapshot.docs.forEach(d => batch.update(d.ref, {read: true}))
  await batch.commit()
}
