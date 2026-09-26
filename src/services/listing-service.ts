import {PixelRatio} from 'react-native'
import {addDoc, collection, doc, updateDoc} from '@react-native-firebase/firestore'
import {getDownloadURL, ref, putFile} from '@react-native-firebase/storage'
import * as ImageManipulator from 'expo-image-manipulator'

import type {Amenity, LocationCategory, Property, PropertyType} from '@birklik/core/types'
import {resolveCityQuery} from '@birklik/core/data'

import {auth, db, storage} from '@/lib/firebase'

/**
 * Создание объявления.
 *
 * ⚠️ Только обычный тариф. Платные (`vip`, `premium`) на сайте создаются
 * черновиком и активируются подтверждённым ответом Azericard — то есть требуют
 * оплаты, а её в приложении нет и в первой версии не будет: правило Apple 3.1.1
 * запрещает вести из приложения на внешнюю оплату. Продвижение остаётся на
 * сайте, и правила Firestore за этим следят сами: платный тариф разрешено
 * создавать только со статусом `draft`.
 *
 * Объявление уходит со статусом `pending` — как и с сайта, его смотрит
 * модератор. Правила требуют именно этой пары: `standard` + `pending`.
 */

// ⚠️ Ровно те же числа, что у сайта в `compressPropertyImage`
// (`compressImage(file, 900, 675, 0.75, true)`). Снимки из приложения и из
// браузера обязаны получаться одинаковыми: иначе одна и та же площадка отдаёт
// объявления разного веса и качества, а прокси картинок кэширует их вперемешку.
const MAX_IMAGE_WIDTH = 900
const MAX_IMAGE_HEIGHT = 675
const IMAGE_QUALITY = 0.75
const MAX_IMAGES = 15

/** Баку — запасной вариант, если геокодер не ответил. Тот же, что на сайте. */
export const DEFAULT_COORDINATES = {lat: 40.4093, lng: 49.8671}

/**
 * Заголовки для Nominatim.
 *
 * ⚠️ `User-Agent` тут обязателен, и без него геокодер в приложении НЕ РАБОТАЛ
 * ВООБЩЕ — ни для одного запроса. Политика OSM требует опознавательной строки,
 * а Android по умолчанию представляется `okhttp/4.x`, и на неё Nominatim
 * отвечает `403 Access denied`. Код возвращал запасные координаты, экран писал
 * «не нашлось», и выглядело это как будто OSM не знает ни Баку, ни Yasamal.
 *
 * Измерено 2026-09-25:
 * ```
 * okhttp/4.12.0                     403
 * пустой User-Agent                 403
 * Mozilla/5.0 (обобщённый)          403
 * Birklik.az/1.0 (info@birklik.az)  200
 * ```
 *
 * На сайте этой беды нет: там запрос идёт из браузера с его настоящей строкой,
 * а подменить `User-Agent` из `fetch` браузер всё равно не даёт — заголовок
 * запрещённый. Поэтому правка только здесь.
 */
const NOMINATIM_HEADERS = {
  'User-Agent': 'Birklik.az/1.0 (info@birklik.az)',
  'Accept-Language': 'az'
}

/**
 * Координаты по названию места — тем же геокодером, что и сайт
 * (`geocodeCity` в `use-listing-editor.ts`): OpenStreetMap Nominatim с
 * ограничением по Азербайджану.
 *
 * Без координат объявление не попадёт ни на карту витрины, ни в раздел
 * «похожие». Поэтому при отказе геокодера возвращаем Баку, а не ничего: метка
 * не на месте хуже точной, но лучше отсутствующей.
 */
export async function geocode(query: string): Promise<{lat: number; lng: number}> {
  try {
    // ⚠️ Запрос приводится к официальному написанию, и это НЕ мелочь. Сайт так
    // делал с самого начала, приложение — нет, и разницу видно на ответах
    // геокодера: на «Gebele» он отдаёт улицу «Qədim Qəbələ» в Xətai районе
    // БАКУ, а не город Qəbələ. Ответ успешный и правдоподобный, поймать нечем —
    // объявление молча получало метку в другом городе.
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=az&q=' +
      encodeURIComponent(resolveCityQuery(query))
    const response = await fetch(url, {headers: NOMINATIM_HEADERS})
    if (!response.ok) return DEFAULT_COORDINATES

    const results = (await response.json()) as Array<{lat: string; lon: string}>
    const lat = Number(results?.[0]?.lat)
    const lng = Number(results?.[0]?.lon)

    return Number.isFinite(lat) && Number.isFinite(lng)
      ? {lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6))}
      : DEFAULT_COORDINATES
  } catch {
    return DEFAULT_COORDINATES
  }
}

/**
 * Адрес по координатам — для точки, поставленной пальцем на карте.
 *
 * Тем же Nominatim, что и прямой поиск, и ровно для того же, для чего это
 * делает сайт (`onAddressReverse` у `LocationMap`): человек ткнул в карту, а
 * поле адреса осталось от прежнего места — объявление ушло бы с меткой в одном
 * районе и подписью о другом.
 *
 * Пустая строка означает «не вышло». Вызывающий обязан в этом случае оставить
 * то, что человек написал сам: затирать введённое молчаливой неудачей нельзя.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url =
      'https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&' +
      `lat=${lat}&lon=${lng}`
    const response = await fetch(url, {headers: NOMINATIM_HEADERS})
    if (!response.ok) return ''

    const result = (await response.json()) as {display_name?: string}
    return typeof result?.display_name === 'string' ? result.display_name : ''
  } catch {
    return ''
  }
}

export interface NewListing {
  title: string
  description: string
  type: PropertyType
  city: string
  district: string
  address: string
  price: number
  rooms: number
  area: number
  minGuests: number
  maxGuests: number
  /** Метки места внутри города. По ним отбирает фильтр сайта. */
  locationTags: string[]
  locationCategory: LocationCategory
  /** «Доп. фильтры» и «Рядом» — по ним тоже отбирает сайт. */
  extraFeatures: string[]
  nearbyPlaces: string[]
  amenities: Amenity[]
  coordinates: {lat: number; lng: number}
  images: string[]
  owner: {name: string; phone: string; email: string}
  /**
   * Тариф, выбранный при подаче. По умолчанию бесплатный.
   *
   * ⚠️ От него зависит СТАТУС, и это требование правил, а не удобство:
   * `standard` обязан создаваться со `pending`, платный — с `draft`. Правила
   * проверяют эту пару дословно и отклоняют любое другое сочетание. Платное
   * объявление выходит из `draft` только когда сервер подтвердит оплату.
   */
  tier?: 'standard' | 'vip' | 'premium'
}

export interface PickedImage {
  uri: string
  width: number
  height: number
}

/**
 * Загружает выбранные фотографии в Storage и возвращает их адреса.
 *
 * ⚠️ Папка — по ЗАГРУЖАЮЩЕМУ, а не по владельцу объявления: этого требуют
 * правила Storage (`request.auth.uid == userId` в пути). На сайте так же, и
 * чистка осиротевших файлов на это опирается.
 *
 * Сжатие повторяет сайт один в один: вписать в 900×675 с сохранением пропорций,
 * качество 0.75, формат webp. Снимок с телефона бывает и на двадцать мегабайт,
 * а правила Storage не пускают тяжелее десяти — но дело не только в пределе:
 * несжатые снимки из приложения испортили бы скорость витрины, ради которой
 * фотографии на сайте однажды уже пережимали с 308 МБ до 78.
 *
 * Уменьшаем ТОЛЬКО если снимок больше рамки: растягивать маленький незачем.
 */
export async function uploadImages(
  images: PickedImage[],
  /**
   * Наложение водяного знака. Передаётся сверху, потому что рисуется видом:
   * чистой функцией совместить две картинки в React Native нельзя — см.
   * `useWatermark`. Без него снимки уйдут без знака и станут заметно отличаться
   * от загруженных с сайта.
   */
  watermark?: (image: PickedImage) => Promise<string>
): Promise<string[]> {
  const userId = auth.currentUser?.uid
  if (!userId) throw new Error('not-authenticated')

  const urls: string[] = []

  for (const image of images.slice(0, MAX_IMAGES)) {
    const ratio = Math.min(
      MAX_IMAGE_WIDTH / image.width,
      MAX_IMAGE_HEIGHT / image.height,
      1
    )
    const width = Math.round(image.width * ratio)
    const height = Math.round(image.height * ratio)

    // ⚠️ Кадр для наложения знака готовится в ФИЗИЧЕСКИХ пикселях экрана, а не
    // в итоговом размере.
    //
    // Знак наносится снимком вида (`useWatermark`), а вид снимается в пикселях
    // устройства: его размер в точках умножается на плотность экрана. Отдай мы
    // сюда кадр уже в итоговом размере — вид растянул бы его на плотность и снял
    // бы интерполированную размазню. Так и было: на телефоне с 420 dpi кадр
    // 328×675 превращался в 861×1772, деталей не прибавлялось, а резкость
    // пропадала совсем. Снимки из приложения весили 9–18 КБ против 105–213 КБ у
    // того же сайта — в разы меньше данных на пиксель.
    //
    // Поэтому в вид отдаём кадр ровно той ширины, которую вид займёт в пикселях:
    // отрисовка выходит один в один, без растягивания. Больше оригинала не
    // просим — `Math.min(…, 1)` не даёт увеличить маленький снимок.
    const stageRatio = Math.min(ratio * PixelRatio.get(), 1)
    const stage =
      stageRatio < 1
        ? await ImageManipulator.manipulateAsync(
            image.uri,
            [
              {
                resize: {
                  width: Math.round(image.width * stageRatio),
                  height: Math.round(image.height * stageRatio)
                }
              }
            ],
            {compress: 1, format: ImageManipulator.SaveFormat.PNG}
          )
        : {uri: image.uri}

    // Размер ВИДА задаётся в точках и равен итоговому кадру: от него считается
    // логотип (35% ширины), и на сайте он считается от той же величины.
    const marked = watermark ? await watermark({uri: stage.uri, width, height}) : stage.uri

    // Снимок вида пришёл в пикселях устройства — приводим к итоговому размеру и
    // кодируем один раз, как холст на сайте. Уменьшение здесь обязательно: без
    // него размер файла зависел бы от плотности экрана того, кто подаёт
    // объявление, и снимки из приложения перестали бы совпадать с сайтом.
    const compressed = await ImageManipulator.manipulateAsync(marked, [{resize: {width, height}}], {
      compress: IMAGE_QUALITY,
      format: ImageManipulator.SaveFormat.WEBP
    })

    const name = `${Date.now()}_${urls.length}.webp`
    const reference = ref(storage, `properties/${userId}/${name}`)

    // putFile, а не putString: файл лежит на устройстве, и читать его в память
    // целиком ради загрузки незачем.
    await putFile(reference, compressed.uri)

    // Полный адрес с токеном, а не путь через прокси: база общая с сайтом, а
    // Storage без токена отбивает App Check. На чтении адрес всё равно
    // переписывается — см. `withImageUrls`.
    urls.push(await getDownloadURL(reference))
  }

  return urls
}

export async function createListing(listing: NewListing): Promise<string> {
  const userId = auth.currentUser?.uid
  if (!userId) throw new Error('not-authenticated')

  const tier = listing.tier ?? 'standard'

  const now = new Date().toISOString()

  // Заголовок и описание кладутся во все три языка одинаковыми — так же
  // поступает сайт. Отдельного перевода при подаче никто не пишет, а пустой
  // язык означал бы пустую карточку для части посетителей.
  const localized = (value: string) => ({az: value, en: value, ru: value})

  const document: Omit<Property, 'id'> = {
    title: localized(listing.title),
    description: localized(listing.description),
    address: localized(listing.address),
    type: listing.type,
    city: listing.city,
    district: listing.district,
    // ⚠️ Множители те же, что на сайте: неделя по цене ШЕСТИ ночей, месяц по
    // цене двадцати четырёх. Это скидка за длительность, а не простое
    // умножение — в приложении стояло 7 и 30, и те же сутки давали разную
    // недельную цену в зависимости от того, откуда подали объявление.
    // Сейчас эти два поля не читает никто, но расхождение в базе всплыло бы в
    // тот день, когда их начнут показывать.
    price: {
      daily: listing.price,
      weekly: listing.price * 6,
      monthly: listing.price * 24,
      currency: 'AZN'
    },
    rooms: listing.rooms,
    area: listing.area,
    // Обе границы вместимости спрашиваются в форме, как на сайте. Раньше
    // нижняя жёстко ставилась единицей — форма её не спрашивала вовсе.
    minGuests: listing.minGuests,
    maxGuests: listing.maxGuests,
    // ⚠️ Без этих двух полей объявление не попадает в отбор по району на
    // сайте: фильтр смотрит именно `locationTags`. Приложение их не писало
    // вовсе — см. CityLocationPicker.
    locationTags: listing.locationTags,
    locationCategory: listing.locationCategory,
    extraFeatures: listing.extraFeatures,
    nearbyPlaces: listing.nearbyPlaces,
    amenities: listing.amenities,
    coordinates: listing.coordinates,
    images: listing.images,
    owner: listing.owner,
    ownerId: userId,
    // Ниже — то, что правила проверяют дословно, парой. `isFeatured` и сроки
    // платных тарифов клиенту не отдаются ни при каком тарифе: их ставит только
    // сервер после подтверждённой оплаты (`applyPaidTier`).
    //
    // Платное объявление создаётся ЧЕРНОВИКОМ и на витрину не попадает, пока
    // оплата не подтверждена. Так же устроен сайт: иначе неоплаченный премиум
    // висел бы наверху выдачи.
    listingTier: tier,
    status: tier === 'standard' ? 'pending' : 'draft',
    isFeatured: false,
    isActive: true,
    views: 0,
    likes: [],
    favorites: [],
    comments: [],
    createdAt: now,
    updatedAt: now
  } as Omit<Property, 'id'>

  const created = await addDoc(collection(db, 'properties'), document)
  return created.id
}

/**
 * Правка объявления владельцем.
 *
 * ⚠️ Список полей закрытый и повторяет то, что разрешают правила. Владельцу
 * запрещены `status`, `listingTier`, сроки платных тарифов, `isFeatured`, а
 * также репутация: оценки, отзывы, комментарии, просмотры и отметки. Передай мы
 * их сюда «на всякий случай» — Firestore отклонил бы запись целиком, и правка
 * описания перестала бы работать из-за поля, которого человек не трогал.
 */
export interface ListingEdit {
  title: string
  description: string
  type: PropertyType
  city: string
  district: string
  address: string
  price: number
  rooms: number
  area: number
  minGuests: number
  maxGuests: number
  locationTags: string[]
  locationCategory: LocationCategory
  /** «Доп. фильтры» и «Рядом» — по ним тоже отбирает сайт. */
  extraFeatures: string[]
  nearbyPlaces: string[]
  amenities: Amenity[]
  coordinates: {lat: number; lng: number}
  images: string[]
}

export async function updateListing(propertyId: string, edit: ListingEdit): Promise<void> {
  const localized = (value: string) => ({az: value, en: value, ru: value})

  await updateDoc(doc(db, 'properties', propertyId), {
    title: localized(edit.title),
    description: localized(edit.description),
    address: localized(edit.address),
    type: edit.type,
    city: edit.city,
    district: edit.district,
    price: {
      daily: edit.price,
      // Те же множители, что при создании и на сайте — см. createListing.
      weekly: edit.price * 6,
      monthly: edit.price * 24,
      currency: 'AZN'
    },
    rooms: edit.rooms,
    area: edit.area,
    minGuests: edit.minGuests,
    maxGuests: edit.maxGuests,
    locationTags: edit.locationTags,
    locationCategory: edit.locationCategory,
    extraFeatures: edit.extraFeatures,
    nearbyPlaces: edit.nearbyPlaces,
    amenities: edit.amenities,
    coordinates: edit.coordinates,
    images: edit.images,
    updatedAt: new Date().toISOString()
  })
}

/**
 * Правка модератором — то же содержимое плюс то, что владельцу недоступно.
 *
 * Статус, тариф и срок платного тарифа модератор ставит вручную: так на сайте
 * выдают премиум после оплаты вне Azericard. Право живёт в заявке токена,
 * правила его признают.
 *
 * `isFeatured` выводится из тарифа, а не спрашивается отдельно — так же, как в
 * редакторе модератора на сайте.
 */
export interface ModeratorEdit extends ListingEdit {
  status: string
  listingTier: 'standard' | 'vip' | 'premium'
  /** 'YYYY-MM-DD' или пусто. Пустое означает «без срока», то есть обычный тариф. */
  expiresAt: string
}

export async function updateListingAsModerator(
  propertyId: string,
  edit: ModeratorEdit
): Promise<void> {
  const localized = (value: string) => ({az: value, en: value, ru: value})

  // ⚠️ Срок пишется в поле СВОЕГО тарифа, а поле чужого обязательно чистится.
  // У премиума и VIP они разные, и без очистки переключение VIP → премиум
  // оставило бы `vipExpiresAt` от прошлого тарифа: `isTierActive` увидела бы
  // действующий VIP, и объявление показывалось бы с обоими значками. На сайте
  // это сделано так же — там оба поля переписываются на каждом сохранении.
  const expiry =
    edit.listingTier === 'premium'
      ? {
          premiumExpiresAt: edit.expiresAt ? new Date(edit.expiresAt).toISOString() : '',
          vipExpiresAt: ''
        }
      : edit.listingTier === 'vip'
        ? {
            vipExpiresAt: edit.expiresAt ? new Date(edit.expiresAt).toISOString() : '',
            premiumExpiresAt: ''
          }
        : {premiumExpiresAt: '', vipExpiresAt: ''}

  await updateDoc(doc(db, 'properties', propertyId), {
    title: localized(edit.title),
    description: localized(edit.description),
    address: localized(edit.address),
    type: edit.type,
    city: edit.city,
    district: edit.district,
    price: {
      daily: edit.price,
      // Те же множители, что при создании и на сайте — см. createListing.
      weekly: edit.price * 6,
      monthly: edit.price * 24,
      currency: 'AZN'
    },
    rooms: edit.rooms,
    area: edit.area,
    minGuests: edit.minGuests,
    maxGuests: edit.maxGuests,
    locationTags: edit.locationTags,
    locationCategory: edit.locationCategory,
    extraFeatures: edit.extraFeatures,
    nearbyPlaces: edit.nearbyPlaces,
    amenities: edit.amenities,
    coordinates: edit.coordinates,
    images: edit.images,
    status: edit.status,
    listingTier: edit.listingTier,
    isFeatured: edit.listingTier === 'premium',
    ...expiry,
    updatedAt: new Date().toISOString()
  })
}
