import {arrayRemove, arrayUnion, doc, updateDoc} from '@react-native-firebase/firestore'

import {db} from '@/lib/firebase'

/**
 * Отметка «в избранном».
 *
 * Хранится массивом `favorites` внутри самого объявления — так же, как на
 * сайте. Отдельной коллекции нет.
 *
 * Пишется через arrayUnion и arrayRemove, а не заменой массива целиком. Это не
 * мелочь: замена затёрла бы чужие отметки, если между чтением и записью
 * кто-то добавил свою. Правила Firestore такую запись и не пропустят — они
 * сверяют, что разница между старым и новым набором состоит ровно из
 * собственного идентификатора.
 *
 * Путь проверен на эмуляторе: `pnpm test:rules` в веб-репозитории, раздел
 * «избранное через arrayUnion и arrayRemove».
 */
export async function toggleFavorite(
  propertyId: string,
  userId: string,
  isFavorited: boolean
): Promise<void> {
  await updateDoc(doc(db, 'properties', propertyId), {
    favorites: isFavorited ? arrayRemove(userId) : arrayUnion(userId)
  })
}
