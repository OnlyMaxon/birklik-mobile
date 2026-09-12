import {addDoc, collection, doc, updateDoc} from '@react-native-firebase/firestore'
import {getDownloadURL, ref, putFile} from '@react-native-firebase/storage'
import * as ImageManipulator from 'expo-image-manipulator'

import type {Amenity, Property, PropertyType} from '@birklik/core/types'

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
const DEFAULT_COORDINATES = {lat: 40.4093, lng: 49.8671}

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
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=az&q=' +
      encodeURIComponent(query)
    const response = await fetch(url, {headers: {'Accept-Language': 'az'}})
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

    // Сначала уменьшаем, потом наносим знак: на сайте порядок такой же, и от
    // него зависит размер логотипа — он считается от ИТОГОВОЙ ширины кадра.
    const resized =
      ratio < 1
        ? await ImageManipulator.manipulateAsync(image.uri, [{resize: {width, height}}], {
            compress: 1,
            format: ImageManipulator.SaveFormat.PNG
          })
        : {uri: image.uri, width: image.width, height: image.height}

    const marked = watermark
      ? await watermark({uri: resized.uri, width: resized.width, height: resized.height})
      : resized.uri

    // Кодируем один раз, в самом конце — как холст на сайте.
    const compressed = await ImageManipulator.manipulateAsync(marked, [], {
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
    price: {daily: listing.price, weekly: listing.price * 7, monthly: listing.price * 30, currency: 'AZN'},
    rooms: listing.rooms,
    area: listing.area,
    // Нижняя граница вместимости — единица: на сайте это поле есть, но владельцы
    // его почти не заполняют, а фильтр сравнивает ДИАПАЗОНЫ, и пустая нижняя
    // граница выбрасывала бы объявление из выдачи по числу гостей.
    minGuests: listing.minGuests,
    maxGuests: listing.maxGuests,
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
  maxGuests: number
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
      weekly: edit.price * 7,
      monthly: edit.price * 30,
      currency: 'AZN'
    },
    rooms: edit.rooms,
    area: edit.area,
    maxGuests: edit.maxGuests,
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
      weekly: edit.price * 7,
      monthly: edit.price * 30,
      currency: 'AZN'
    },
    rooms: edit.rooms,
    area: edit.area,
    maxGuests: edit.maxGuests,
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
