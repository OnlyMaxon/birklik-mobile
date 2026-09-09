import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where
} from '@react-native-firebase/firestore'

import type {Booking, Comment, CommentReport, Property} from '@birklik/core/types'

import {db} from '@/lib/firebase'

/**
 * Модераторка.
 *
 * ⚠️ В отличие от комментариев и оценок, ЭТО работает прямо из приложения, без
 * сервера. Правила Firestore дают модератору полный доступ на запись
 * (`|| isModerator()` в ветке обновления), потому что право живёт в заявке
 * токена — подделать его с клиента нельзя, а сервер для проверки не нужен.
 *
 * Заявка приезжает в токене и ставится скриптом под сервис-аккаунтом. Поле
 * `isModerator` в документе профиля правом НЕ является: им пользуется только
 * серверная рассылка жалоб.
 */

/** Объявления, ожидающие проверки. */
export async function getPendingProperties(): Promise<Property[]> {
  const snapshot = await getDocs(
    query(collection(db, 'properties'), where('status', '==', 'pending'))
  )
  return snapshot.docs
    .map(d => ({id: d.id, ...d.data()}) as Property)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}

/**
 * Все объявления площадки — в любом статусе.
 *
 * ⚠️ Именно ВСЕ, а не только активные: модератору нужно видеть и снятые, и
 * черновики, и отклонённые. Витрина такого не покажет — она отсеивает по
 * `isOnDisplay`, — и без этого раздела найти отключённое объявление в
 * приложении было нечем. На сайте такой раздел есть.
 *
 * Сортировка в памяти: `orderBy('createdAt')` молча выбрасывает записи без
 * этого поля, а в боевой базе такие есть.
 */
export async function getAllProperties(): Promise<Property[]> {
  const snapshot = await getDocs(collection(db, 'properties'))
  return snapshot.docs
    .map(d => ({id: d.id, ...d.data()}) as Property)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}

/**
 * Снять объявление с витрины или вернуть обратно.
 *
 * Модератору правила разрешают менять статус напрямую — право живёт в заявке
 * токена. Владельцу такое запрещено: `status` стоит в списке полей, которые
 * ему трогать нельзя.
 */
export async function setPropertyActive(propertyId: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'properties', propertyId), {
    status: active ? 'active' : 'inactive',
    updatedAt: new Date().toISOString()
  })
}

/** Удаление объявления модератором. */
export async function deleteProperty(propertyId: string): Promise<void> {
  await deleteDoc(doc(db, 'properties', propertyId))
}

/**
 * Решение по объявлению.
 *
 * Отклонённое переводится в `inactive`, а не удаляется: у владельца остаётся
 * возможность поправить и подать снова, а у модератора — понять, что уже
 * смотрели. Так же поступает сайт.
 */
export async function decideProperty(
  propertyId: string,
  approve: boolean,
  reason?: string
): Promise<void> {
  await updateDoc(
    doc(db, 'properties', propertyId),
    approve
      ? {status: 'active', updatedAt: new Date().toISOString()}
      : {
          status: 'inactive',
          rejectionReason: reason || '',
          updatedAt: new Date().toISOString()
        }
  )
}

/**
 * Все брони — для разбора.
 *
 * Сортировка в памяти: `orderBy('createdAt')` молча выбрасывает записи без
 * этого поля, а в боевой базе такие есть.
 */
export async function getAllBookings(): Promise<Booking[]> {
  const snapshot = await getDocs(collection(db, 'bookings'))
  return snapshot.docs
    .map(d => ({id: d.id, ...d.data()}) as Booking)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}

/**
 * Удаление брони модератором.
 *
 * Вместе с ней уходят связанные запросы отмены — иначе они ссылаются в пустоту
 * и просто копятся в базе; на сайте так накопилось 52 документа.
 *
 * ⚠️ Поиск запросов идёт по одному `bookingId` намеренно: правила проверяют
 * запрос по его УСЛОВИЯМ, а не по найденным документам, и ветка модератора
 * полей документа не касается. Гостю и владельцу такого мало — им нужно ещё
 * ограничение по себе.
 */
export async function deleteBookingAsModerator(bookingId: string): Promise<void> {
  try {
    const requests = await getDocs(
      query(collection(db, 'cancellationRequests'), where('bookingId', '==', bookingId))
    )
    for (const request of requests.docs) await deleteDoc(request.ref)
  } catch {
    // Уборка не должна отменять главное действие: на сайте ровно на этом
    // удаление брони падало целиком.
  }

  await deleteDoc(doc(db, 'bookings', bookingId))
}

export interface CommentWithProperty extends Comment {
  propertyId: string
  propertyTitle: string
}

/**
 * Все комментарии площадки.
 *
 * Комментарии лежат массивом внутри объявления, отдельной коллекции нет —
 * поэтому собираются обходом объявлений. При семидесяти записях это один
 * запрос; появятся тысячи — переносить в отдельную коллекцию, а не наращивать
 * этот обход.
 */
export async function getAllComments(): Promise<CommentWithProperty[]> {
  const snapshot = await getDocs(collection(db, 'properties'))

  const result: CommentWithProperty[] = []
  for (const document of snapshot.docs) {
    const property = document.data() as Property
    for (const comment of property.comments ?? []) {
      result.push({
        ...comment,
        propertyId: document.id,
        propertyTitle: property.title?.az || property.title?.en || document.id
      })
    }
  }

  return result.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}

/**
 * Удаление комментария.
 *
 * Массив перезаписывается целиком без нужного элемента: `arrayRemove` требует
 * точного совпадения объекта, а комментарии содержат вложенные ответы —
 * собрать точную копию для сравнения ненадёжно.
 */
export async function deleteComment(propertyId: string, commentId: string): Promise<void> {
  const reference = doc(db, 'properties', propertyId)
  const snapshot = await getDoc(reference)
  if (!snapshot.exists()) return

  const property = snapshot.data() as Property
  const comments = (property.comments ?? []).filter(comment => comment.id !== commentId)

  await updateDoc(reference, {comments, updatedAt: new Date().toISOString()})
}

/** Жалобы на комментарии. Читать их правила разрешают только модератору. */
export async function getReports(): Promise<CommentReport[]> {
  const snapshot = await getDocs(collection(db, 'commentReports'))
  return snapshot.docs
    .map(d => ({id: d.id, ...d.data()}) as CommentReport)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}

export async function closeReport(reportId: string): Promise<void> {
  await updateDoc(doc(db, 'commentReports', reportId), {
    status: 'closed',
    resolvedAt: new Date().toISOString()
  })
}
