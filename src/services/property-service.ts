import {
  collection,
  doc,
  documentId,
  getDoc,
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
import {withImageUrls} from '@/lib/images'

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

/**
 * Единственное место, где документ Firestore превращается в `Property`. Здесь же
 * чинятся адреса картинок: часть из них записана относительным путём, а
 * приложению нужен полный — см. `withImageUrls`.
 */
function toProperty(id: string, data: Record<string, unknown>): Property {
  return withImageUrls({id, ...data} as Property)
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
 * Все объявления витрины разом — для поиска и фильтров.
 *
 * Фильтрация идёт на устройстве функцией `filterProperties` из общего пакета:
 * той же самой, что применяет сайт. Дублировать её условия запросом к
 * Firestore нельзя — там нет ни поиска по тексту, ни пересечения дат, ни
 * набора удобств, а под каждое сочетание полей пришлось бы заводить свой
 * составной индекс.
 *
 * Отсюда потолок: в базе 72 активных объявления, предел в 300 даёт запас
 * вчетверо. **Когда объявлений станет больше двухсот, так дальше нельзя** —
 * фильтры придётся переносить в запрос или в поисковый сервис.
 */
export async function getAllForFilter(city?: string): Promise<Property[]> {
  const constraints: QueryConstraint[] = [
    where('status', '==', 'active'),
    ...(city ? [where('city', '==', city)] : []),
    orderBy('createdAt', 'desc'),
    orderBy(documentId(), 'desc'),
    limitTo(300)
  ]

  const snapshot = await getDocs(query(collection(db, 'properties'), ...constraints))
  return snapshot.docs.map(doc => toProperty(doc.id, doc.data())).filter(isOnDisplay)
}

/**
 * Объявления владельца — все, включая снятые с витрины.
 *
 * `isOnDisplay` здесь НЕ применяется намеренно: владельцу нужно видеть и
 * истёкшее, и ожидающее модерации, и черновик — иначе он не поймёт, куда
 * делось объявление, и не сможет продлить. Ровно за этим он в кабинет и
 * приходит.
 *
 * Правила разрешают такое чтение всем: коллекция `properties` открыта. Отбор
 * по `ownerId` — вопрос смысла, а не безопасности.
 */
export async function getOwnerProperties(ownerId: string): Promise<Property[]> {
  const snapshot = await getDocs(
    query(
      collection(db, 'properties'),
      where('ownerId', '==', ownerId),
      orderBy('createdAt', 'desc'),
      orderBy(documentId(), 'desc'),
      limitTo(200)
    )
  )
  return snapshot.docs.map(doc => toProperty(doc.id, doc.data()))
}

/**
 * Одно объявление по идентификатору.
 *
 * Скрытое с витрины возвращается как `null`, а не отдаётся по прямой ссылке:
 * ровно эту дыру закрывал аудит на сайте — там страница открывалась при любом
 * статусе, включая неоплаченные черновики и не прошедшие модерацию.
 *
 * Владелец и модератор на сайте видят СВОЁ объявление в любом статусе — им
 * нужно его проверить и продлить. Здесь такого исключения пока нет, хотя вход
 * уже появился: не хватает заявки модератора из токена и экрана кабинета.
 * Делать по образцу `src/app/property/[id]/page.tsx` в веб-репозитории.
 */
export async function getProperty(id: string): Promise<Property | null> {
  const snapshot = await getDoc(doc(db, 'properties', id))
  if (!snapshot.exists()) return null

  const property = toProperty(snapshot.id, snapshot.data() ?? {})
  return isOnDisplay(property) ? property : null
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
