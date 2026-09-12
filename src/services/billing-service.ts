import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  requestPurchase,
  type Purchase
} from 'expo-iap'

import {auth} from '@/lib/firebase'

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

const CALLABLE =
  'https://europe-west1-birklik-65289.cloudfunctions.net/verifyPlayPurchase'

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
export async function startPurchase(productId: string, propertyId: string): Promise<void> {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('not-authenticated')

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
      apple: {sku: productId}
    }
  })
}

interface VerifyResult {
  alreadyApplied: boolean
  expiryDate: string
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
  const response = await fetch(CALLABLE, {
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
    // Товар НЕ расходуем. Либо сервер до Google не дошёл и повтор пройдёт, либо
    // покупка не настоящая — в обоих случаях подтверждать её нельзя.
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
  const purchases = await getAvailablePurchases()
  return (purchases ?? []).filter(p => Boolean(p.purchaseToken))
}
