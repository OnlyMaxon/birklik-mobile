import {toImageApiUrl} from '@birklik/core/utils/images'

/**
 * Адреса картинок для приложения.
 *
 * ⚠️ В базе часть картинок записана **относительным** путём `/api/images/...` —
 * сайт живёт на одном домене с прокси, и ему этого хватает. Приложению
 * достраивать его нечем: Glide на Android отвергает такой адрес с
 * `Expected URL scheme 'http' or 'https' but no scheme was found`, и вместо
 * фотографий выходят серые прямоугольники. Поймали это при первом запуске на
 * устройстве — картинки при этом исправно скачивались по прямым ссылкам
 * Firebase Storage, так что по логам ошибка выглядела как ошибка отрисовки.
 *
 * Поэтому домен подставляется явно. Прокси, а не прямые ссылки на Storage:
 * через него идёт кэш Cloudflare и пережатые размеры, ради которых он и заведён.
 */
const SITE_ORIGIN = 'https://birklik.az'

export function imageUrl(source: string | undefined): string | undefined {
  return toImageApiUrl(source, SITE_ORIGIN)
}

/**
 * Приводит адреса картинок объявления к полным, не трогая сам объект.
 *
 * Вызывается в одном месте — там, где документы Firestore превращаются в
 * `Property`. Разбирать это по экранам нельзя: забытый экран молча покажет
 * пустые прямоугольники, и заметить это можно только глазами.
 */
export function withImageUrls<T extends {images?: string[]}>(property: T): T {
  if (!property.images?.length) return property
  return {...property, images: property.images.map(url => imageUrl(url) || url)}
}
