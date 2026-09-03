import {
  collection,
  documentId,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint
} from '@react-native-firebase/firestore'

import type {Property} from '@birklik/core/types'
import {isOnDisplay} from '@birklik/core/utils/display'
import {tierRank} from '@birklik/core/utils/premium-helper'

import {db} from '@/lib/firebase'

/**
 * Выборка объявлений для витрины.
 *
 * Повторяет то, что делает сайт в `src/app/queries.ts`, и намеренно теми же
 * правилами из общего пакета: `isOnDisplay` решает, что показывать, `tierRank` —
 * в каком порядке. Разойтись эти две реализации не должны.
 *
 * Разница только в способе доступа: сайт читает Firestore на сервере под
 * сервис-аккаунтом и в обход правил, приложение — клиентским SDK под правилами.
 * Для коллекции `properties` чтение открыто всем (`allow read: if true`), так
 * что витрина работает и без входа.
 */

const PAGE_SIZE = 20

export interface PropertyCursor {
  createdAt: string
  id: string
}

export interface PropertiesPage {
  properties: Property[]
  cursor: PropertyCursor | null
}

function toProperty(id: string, data: Record<string, unknown>): Property {
  return {id, ...data} as Property
}

/**
 * Платные объявления — их показывают выше остальных.
 *
 * Тариф спрашивается у Firestore, срок проверяется здесь: в базе лежит только
 * `status`, а его переставляет ночная функция, и до её прогона истёкшее
 * объявление формально ещё активно.
 */
export async function getPromotedProperties(city?: string): Promise<Property[]> {
  const constraints: QueryConstraint[] = [
    where('status', '==', 'active'),
    ...(city ? [where('city', '==', city)] : []),
    where('listingTier', 'in', ['vip', 'premium']),
    limitTo(100)
  ]

  const snapshot = await getDocs(query(collection(db, 'properties'), ...constraints))

  return snapshot.docs
    .map(doc => toProperty(doc.id, doc.data()))
    .filter(isOnDisplay)
    .sort((a, b) => tierRank(b) - tierRank(a))
}

/**
 * Обычная страница выдачи, от новых к старым.
 *
 * Вторым ключом сортировки идёт идентификатор документа — без него курсор
 * становится двусмысленным, когда несколько объявлений созданы в одну
 * миллисекунду, и часть выдачи может пропасть или повториться.
 *
 * Берётся на одно больше страницы: так видно, есть ли продолжение, и не нужен
 * отдельный запрос за этим.
 */
export async function getPropertiesPage(
  cursor: PropertyCursor | null,
  city?: string
): Promise<PropertiesPage> {
  const constraints: QueryConstraint[] = [
    where('status', '==', 'active'),
    ...(city ? [where('city', '==', city)] : []),
    orderBy('createdAt', 'desc'),
    orderBy(documentId(), 'desc'),
    ...(cursor ? [startAfter(cursor.createdAt, cursor.id)] : []),
    limitTo(PAGE_SIZE + 1)
  ]

  const snapshot = await getDocs(query(collection(db, 'properties'), ...constraints))
  const rows = snapshot.docs.map(doc => toProperty(doc.id, doc.data()))

  // Отсев по дате идёт ПОСЛЕ выборки, поэтому на странице может остаться меньше
  // двадцати. Это осознанно: досеивать в запросе Firestore нечем, а докладывать
  // до полной страницы — значит делать второй запрос ради косметики.
  const hasMore = rows.length > PAGE_SIZE
  const page = rows.slice(0, PAGE_SIZE)
  const last = page[page.length - 1]

  return {
    properties: page.filter(isOnDisplay),
    // Курсор строится по createdAt: нет его — продолжать нечем, и страница
    // считается последней, а не отдаёт заведомо битый курсор.
    cursor: hasMore && last?.createdAt ? {createdAt: last.createdAt, id: last.id} : null
  }
}
