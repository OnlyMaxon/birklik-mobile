import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  requestPurchase,
  type Purchase
} from 'expo-iap'

import {isBoostPackage, type BoostPackage} from '@birklik/core/data'

import {Platform} from 'react-native'
import {doc, setDoc} from '@react-native-firebase/firestore'

import {auth, db} from '@/lib/firebase'

/**
 * Покупка тарифа через Google Play.
 *
 * Почему через магазин, а не через Azericard, как на сайте: правила Google
 * требуют своего биллинга для всего, что открывает возможности внутри
 * приложения, а поднятие объявления в выдаче — именно это. Уводить на оплату на
 * сайте нельзя тем же правилом (3.1.1(a) у Apple, раздел «Платежи» у Google).
 * Это не выбор разработчика, а условие попадания в магазин.
 *
 * ⚠️ **Ответ магазина на устройстве ничего не доказывает.** Приложение стоит у
 * покупателя, и подделать успешную покупку умеет любой готовый инструмент.
 * Тариф ставит только сервер, проверив `purchaseToken` у Google:
 * `verifyPlayPurchase` в функциях. Здесь — только доведение до него.
 */

/**
 * Товары. Имена выбраны нами и обязаны совпадать с тремя местами:
 * здесь, в Play Console и в `PLAY_PRODUCTS` на сервере. Цены не наши — их
 * задаёт Google ценовыми уровнями, и показываем мы то, что вернул магазин.
 */
export const PLAN_PRODUCTS = ['vip_14', 'vip_30', 'premium_14', 'premium_30'] as const

/**
 * Товары подъёма. Числа в именах — это количество подъёмов, и они обязаны
 * совпадать с тремя местами: здесь, в Play Console и в `BOOST_PRODUCTS` на
 * сервере.
 *
 * Отдельным списком от тарифов намеренно: подъём не ступень и срока не имеет.
 * Смешай их в одном перечне — и `planOf` пришлось бы возвращать то одно, то
 * другое.
 */
export const BOOST_PRODUCTS = ['boost_1', 'boost_3', 'boost_5', 'boost_10'] as const

/** Разбор имени товара на тариф и срок — для подписей на экране. */
export function planOf(productId: string): {tier: 'vip' | 'premium'; days: 14 | 30} | null {
  const [tier, days] = productId.split('_')
  if (tier !== 'vip' && tier !== 'premium') return null
  if (days !== '14' && days !== '30') return null
  return {tier, days: days === '14' ? 14 : 30}
}

export interface Plan {
  id: string
  tier: 'vip' | 'premium'
  days: 14 | 30
  /** Цена строкой из магазина, уже в валюте покупателя. Своей не считаем. */
  price: string
}

/** Разбор имени товара подъёма на количество. */
export function boostOf(productId: string): {count: BoostPackage} | null {
  const [name, count] = productId.split('_')
  if (name !== 'boost') return null
  const parsed = Number(count)
  return isBoostPackage(parsed) ? {count: parsed} : null
}

export interface BoostPlan {
  id: string
  count: BoostPackage
  /** Цена строкой из магазина — то, что реально спишет Google. */
  price: string
}

const CALLABLE =
  'https://europe-west1-birklik-65289.cloudfunctions.net/verifyPlayPurchase'

/**
 * Проверка покупки у Apple — СВОЯ функция, а не та же.
 *
 * Доказательства оплаты у магазинов разной природы: у Google мы отдаём серверу
 * токен, и он спрашивает о нём Google; у Apple `purchaseToken` — это уже
 * подписанная Apple квитанция, и сервер проверяет подпись у себя. Одна функция
 * на две кассы означала бы ветку «а чей это чек» внутри неё, причём решающую
 * судьбу денег по догадке.
 */
const APPLE_CALLABLE =
  'https://europe-west1-birklik-65289.cloudfunctions.net/verifyApplePurchase'

let connected = false

/**
 * Подключение к магазину. Идемпотентно: экран может открыться несколько раз.
 *
 * Разрывать соединение не нужно нигде: `endConnection` освобождает его на всё
 * приложение, и вернувшийся человек получил бы пустой список тарифов. Держим до
 * закрытия приложения — поэтому обратной функции здесь намеренно нет.
 */
export async function connectStore(): Promise<void> {
  if (connected) return
  await initConnection()
  connected = true
}

/**
 * Тарифы с ценами из магазина.
 *
 * Пустой список означает, что товары не заведены в Play Console или сборка не
 * из Play: отладочная сборка из Metro покупки проводить не может, Google отдаёт
 * ей пустой ответ. Это не ошибка кода — и на экране должно выглядеть как
 * «магазин недоступен», а не как «тарифов нет».
 */
export async function loadPlans(): Promise<Plan[]> {
  const products = await fetchProducts({skus: [...PLAN_PRODUCTS], type: 'in-app'})

  const plans: Plan[] = []
  for (const product of products ?? []) {
    const parsed = planOf(product.id)
    if (!parsed) continue
    plans.push({
      id: product.id,
      tier: parsed.tier,
      days: parsed.days,
      price: product.displayPrice
    })
  }

  // Порядок задаём сами: магазин возвращает товары как ему удобно, а человеку
  // нужно видеть VIP раньше Premium и 14 дней раньше 30.
  const order = PLAN_PRODUCTS as readonly string[]
  return plans.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
}

/**
 * Пакеты подъёма с ценами из магазина.
 *
 * Отдельный запрос от тарифов, а не один общий: пустой ответ по тарифам и
 * пустой ответ по подъёмам означают разное. Товары подъёма заводятся в Play
 * Console позже тарифов, и пока их там нет, тарифы обязаны работать.
 */
export async function loadBoostPlans(): Promise<BoostPlan[]> {
  const products = await fetchProducts({skus: [...BOOST_PRODUCTS], type: 'in-app'})

  const plans: BoostPlan[] = []
  for (const product of products ?? []) {
    const parsed = boostOf(product.id)
    if (!parsed) continue
    plans.push({id: product.id, count: parsed.count, price: product.displayPrice})
  }

  // От меньшего пакета к большему: магазин отдаёт товары как ему удобно.
  return plans.sort((a, b) => a.count - b.count)
}

/**
 * Открывает окно оплаты Google.
 *
 * ⚠️ Это НЕ промис результата покупки: `requestPurchase` только показывает окно,
 * а результат приходит событием в `purchaseUpdatedListener`. Слушатели обязаны
 * быть подняты ДО вызова, иначе успешная покупка прилетит в пустоту и деньги
 * спишутся без тарифа.
 *
 * Объявление и покупатель привязываются к самой покупке: Google сохранит их
 * внутри записи и вернёт серверу. Поэтому сервер не верит приложению насчёт
 * того, чей это платёж и какое объявление поднимать, — он читает привязку у
 * Google. Это же спасает прерванную покупку: если приложение закроют до
 * проверки, объявление всё равно известно.
 */
/**
 * UUID версии 4 для `appAccountToken`.
 *
 * ⚠️ **Формат обязателен.** StoreKit принимает в это поле только UUID: отдай
 * ему «prop-123» — и значение молча выбросится, квитанция приедет без привязки,
 * а дыра «убили процесс после оплаты» откроется снова и незаметно.
 *
 * ⚠️ Берётся из `Math.random`, и это НЕ лень. Нативного источника случайности в
 * приложении нет (`expo-crypto` не установлен), а каждый новый нативный модуль
 * означает пересборку и новый способ сломать сборку. Криптографическая стойкость
 * здесь и не нужна: UUID — это КЛЮЧ К ЗАПИСИ, а не пароль. Угадавший чужой UUID
 * не получит ничего: чтобы он вообще попал в квитанцию, надо заплатить своими
 * деньгами, а сервер сверяет владельца намерения с вошедшим и отказывает.
 */
function uuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = (Math.random() * 16) | 0
    // Версия (4) уже в шаблоне; здесь задаётся вариант: старшие биты 10.
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16)
  })
}

export async function startPurchase(productId: string, propertyId: string): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('not-authenticated')

  // ⚠️ У Apple НЕТ аналога `obfuscatedProfileId`, и это главное различие касс.
  // Google хранит номер объявления внутри покупки и возвращает его серверу —
  // этим 2026-10-10 закрыли дыру «убили процесс после оплаты → приложение
  // забыло номер → деньги списаны, тариф не поставлен». У Apple в покупку можно
  // положить только UUID, поэтому номер кладём В БАЗУ заранее, а в покупку —
  // ключ к нему. Запись делается ДО открытия окна оплаты: после него может уже
  // не быть ни экрана, ни процесса.
  let appAccountToken: string | undefined
  if (Platform.OS === 'ios') {
    appAccountToken = uuidV4()
    await setDoc(doc(db, 'purchaseIntents', appAccountToken), {
      userId: uid,
      propertyId,
      productId,
      createdAt: new Date().toISOString()
    })
  }

  await requestPurchase({
    type: 'in-app',
    request: {
      // Ключи платформ называются по магазинам, а не по системам: `google` и
      // `apple`. Google принимает список товаров, Apple — один.
      google: {
        skus: [productId],
        obfuscatedAccountId: uid,
        obfuscatedProfileId: propertyId
      },
      apple: {sku: productId, appAccountToken}
    }
  })
}

export interface VerifyResult {
  alreadyApplied: boolean
  /**
   * Что именно применил сервер. Отличать обязательно: у подъёма нет срока, и
   * показать по нему «тариф до такого-то числа» значило бы соврать.
   *
   * Старые ответы сервера поля не имеют — отсутствие читаем как тариф.
   */
  kind?: 'tier' | 'boost'
  expiryDate: string
  /** Сколько подъёмов осталось в пакете. Ноль у тарифа и у одиночного подъёма. */
  remaining?: number
}

/**
 * Отдаёт покупку серверу и, если тариф поставлен, расходует товар.
 *
 * Порядок важен и обратным быть не может. Расход товара в Google — это ещё и
 * подтверждение покупки (acknowledge), а **неподтверждённую покупку Google через
 * три дня возвращает покупателю сам**. Пока сервер не сказал «тариф поставлен»,
 * товар не расходуем: сломается проверка — человек получит деньги назад, а не
 * останется ни с чем.
 *
 * Вызывается напрямую, а не через `@react-native-firebase/functions`: вызываемая
 * функция это обычный POST с токеном входа в заголовке, и так уже устроены
 * обращения к серверу сайта в `interactions-service.ts`. Ещё один нативный
 * модуль ради этого не нужен.
 */
export async function verifyAndFinish(purchase: Purchase, propertyId: string): Promise<VerifyResult> {
  const user = auth.currentUser
  if (!user) throw new Error('not-authenticated')

  const purchaseToken = purchase.purchaseToken
  if (!purchaseToken) throw new Error('no-purchase-token')

  const token = await user.getIdToken()
  const response = await fetch(Platform.OS === 'ios' ? APPLE_CALLABLE : CALLABLE, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({
      data: {purchaseToken, productId: purchase.productId, propertyId}
    })
  })

  const body = (await response.json().catch(() => null)) as
    | {result?: VerifyResult; error?: {status?: string; message?: string}}
    | null

  if (!response.ok || !body?.result) {
    // Товар НЕ расходуем. Либо сервер до магазина не дошёл и повтор пройдёт,
    // либо покупка не настоящая — в обоих случаях подтверждать её нельзя.
    //
    // ⚠️ На iOS это ещё важнее: неподтверждённую покупку Apple отдаёт
    // приложению снова при каждом запуске, и возврат по ней остаётся возможен.
    // Подтвердить без выдачи — значит отнять у человека и товар, и возврат.
    throw new Error(body?.error?.status ?? `verify-failed-${response.status}`)
  }

  // Расходуемый товар: тариф можно купить снова, значит покупка обязана
  // «израсходоваться», иначе второй раз тот же товар не продадут.
  await finishTransaction({purchase, isConsumable: true})

  return body.result
}

/**
 * Незавершённые покупки.
 *
 * Нужно на каждом открытии экрана: приложение могли закрыть между оплатой и
 * проверкой, и тогда деньги списаны, а тариф не поставлен. Google держит такую
 * покупку у себя, пока её не израсходуют, и отдаёт её здесь.
 *
 * Объявление берётся не отсюда, а из привязки на стороне Google — поэтому
 * восстановить покупку можно с любого экрана, даже если она была про другое
 * объявление.
 */
export async function pendingPurchases(): Promise<Purchase[]> {
  // ⚠️ `onlyIncludeActiveItemsIOS: false` задано ЯВНО и держит на себе всю
  // защиту от обрыва на iOS. «Действующими» StoreKit считает то, что человек
  // продолжает иметь: непотребляемые товары и живые подписки. Наши тарифы и
  // подъёмы — РАСХОДУЕМЫЕ, в этот список они не попадают. Оставь умолчание — и
  // незавершённая покупка здесь просто не появится: деньги списаны, тариф не
  // поставлен, и никакой ошибки никто не увидит.
  //
  // На Android флаг игнорируется, поэтому ветки по платформе нет.
  const purchases = await getAvailablePurchases({onlyIncludeActiveItemsIOS: false})
  return (purchases ?? []).filter(p => Boolean(p.purchaseToken))
}
