import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  where,
  type QueryConstraint
} from '@react-native-firebase/firestore'

import type {Property} from '@birklik/core/types'
import {isOnDisplay} from '@birklik/core/utils/display'

import {db} from '@/lib/firebase'
import {withImageUrls} from '@/lib/images'

/**
 * Объявления из Firestore.
 *
 * Повторяет то, что делает сайт в `src/app/queries.ts`, и намеренно теми же
 * правилами из общего пакета: `isOnDisplay` решает, что показывать. Разойтись
 * эти две реализации не должны.
 *
 * Разница только в способе доступа: сайт читает Firestore на сервере под
 * сервис-аккаунтом и в обход правил, приложение — клиентским SDK под правилами.
 * Для коллекции `properties` чтение открыто всем (`allow read: if true`), так
 * что витрина работает и без входа.
 */

/**
 * Единственное место, где документ Firestore превращается в `Property`. Здесь же
 * чинятся адреса картинок: часть из них записана относительным путём, а
 * приложению нужен полный — см. `withImageUrls`.
 */
function toProperty(id: string, data: Record<string, unknown>): Property {
  return withImageUrls({id, ...data} as Property)
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
 * Отмеченные «сохранить».
 *
 * Отбор идёт по массиву внутри самого объявления (`array-contains`), а не по
 * списку у пользователя: так же читает сайт, и отметку ставит тот же
 * `arrayUnion` на том же поле. Отдельной коллекции избранного нет.
 *
 * `isOnDisplay` применяется: сохранённое объявление могли снять с витрины, и
 * вести человека на страницу, которая ответит «не найдено», незачем.
 */
export async function getFavoriteProperties(userId: string): Promise<Property[]> {
  const snapshot = await getDocs(
    query(
      collection(db, 'properties'),
      where('favorites', 'array-contains', userId),
      limitTo(100)
    )
  )
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
 * Похожие объявления — те же правила отбора, что на сайте
 * (`getSimilarProperties` в `src/app/property/[id]/queries.ts`): сперва по
 * городу, а если города у записи нет — по типу жилья.
 *
 * Берём на одно больше десяти: в выборку может попасть само объявление, его
 * отсеиваем. `isOnDisplay` обязателен — статус в базе отстаёт от срока тарифа
 * до суток, пока не отработает ночная задача.
 */
export async function getSimilarProperties(property: Property): Promise<Property[]> {
  const match = property.city
    ? where('city', '==', property.city)
    : where('type', '==', property.type)

  const snapshot = await getDocs(
    query(collection(db, 'properties'), where('status', '==', 'active'), match, limitTo(11))
  )

  return snapshot.docs
    .map(doc => toProperty(doc.id, doc.data()))
    .filter(isOnDisplay)
    .filter(found => found.id !== property.id)
    .slice(0, 10)
}

/**
 * Одно объявление по идентификатору.
 *
 * Скрытое с витрины возвращается как `null`, а не отдаётся по прямой ссылке:
 * ровно эту дыру закрывал аудит на сайте — там страница открывалась при любом
 * статусе, включая неоплаченные черновики и не прошедшие модерацию.
 *
 * Владелец и модератор своё скрытое объявление всё равно видят, просто другим
 * путём: владелец — через `getOwnerProperties` в кабинете, модератор — через
 * `getAllProperties` в модераторке. Обе выборки `isOnDisplay` не применяют,
 * потому что именно снятое им и нужно — проверить, поправить, продлить.
 *
 * То есть исключения здесь нет намеренно: эта функция обслуживает страницу
 * объявления, куда приходят по ссылке, а туда скрытому ходу нет.
 */
export async function getProperty(id: string): Promise<Property | null> {
  const snapshot = await getDoc(doc(db, 'properties', id))
  if (!snapshot.exists()) return null

  const property = toProperty(snapshot.id, snapshot.data() ?? {})
  return isOnDisplay(property) ? property : null
}

