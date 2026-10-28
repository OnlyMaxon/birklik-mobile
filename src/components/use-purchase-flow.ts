import {useCallback, useEffect, useRef, useState} from 'react'
import {Platform} from 'react-native'
import {ErrorCode, purchaseErrorListener, purchaseUpdatedListener, type Purchase} from 'expo-iap'

import {useLanguage} from '@/i18n/language-provider'
import {
  STORE_NAME,
  connectStore,
  loadBoostPlans,
  loadPlans,
  pendingPurchases,
  startPurchase,
  verifyAndFinish,
  type BoostPlan,
  type Plan,
  type VerifyResult
} from '@/services/billing-service'

/**
 * Покупка тарифа: подключение к магазину, слушатели, доведение до сервера.
 *
 * Один хук на два экрана — продвижение существующего объявления и выбор тарифа
 * при подаче нового. Копировать это нельзя: тут три места, где ошибка стоит
 * денег покупателя, и в двух копиях они разойдутся.
 *
 * ⚠️ Первое: `requestPurchase` ничего не возвращает, результат приходит событием.
 * Слушатели обязаны стоять ДО вызова, иначе оплата пройдёт в пустоту.
 *
 * ⚠️ Второе: товар расходуется только после того, как сервер подтвердил тариф.
 * Расход — это ещё и подтверждение покупки, а неподтверждённую Google через три
 * дня возвращает покупателю сам. Порядок — наша страховка, а не формальность.
 *
 * ⚠️ Третье: незавершённые покупки надо забирать при каждом открытии экрана.
 * Приложение могли закрыть между оплатой и проверкой — тогда деньги списаны, а
 * тарифа нет, и сам человек это не исправит.
 */

export interface PurchaseFlow {
  /** Тарифы с ценами из магазина. Пусто на iOS и пока магазин недоступен. */
  plans: Plan[]
  /**
   * Пакеты подъёма с ценами из магазина. Пусто там же, где тарифы, и ещё пока
   * товары подъёма не заведены в Play Console — тарифы при этом работают.
   */
  boostPlans: BoostPlan[]
  /** Идёт оплата или проверка чека — кнопки должны быть заперты. */
  busy: boolean
  error: string
  /** Открыть окно оплаты. Покупка привязывается к объявлению у Google. */
  start: (productId: string, propertyId: string) => void
  /**
   * Подключиться к магазину и забрать незавершённые покупки.
   * Зовётся экраном, когда известно, что покупка может понадобиться.
   */
  prepare: () => Promise<void>
}

/**
 * @param onApplied вызывается, когда сервер применил покупку. Экран решает сам,
 *   что показать и куда уйти: при подаче объявления, при продлении тарифа и
 *   после подъёма это разные вещи.
 *
 *   ⚠️ Получает весь ответ сервера, а не одну дату окончания. Раньше была
 *   именно дата, и с появлением подъёма этого стало мало: у подъёма срока нет
 *   вовсе, а незавершённая покупка подхватывается на ЛЮБОМ экране — то есть
 *   экран подачи объявления может получить ответ про подъём и обязан его
 *   отличить, иначе показал бы «тариф до 1970-01-01».
 * @param onFailed вызывается, когда оплата не состоялась — отказ, отмена или
 *   непройденная проверка. Нужен подаче объявления: объявление там уже создано
 *   черновиком, и оставлять человека на заполненной форме нельзя — повторная
 *   отправка создала бы второй черновик.
 */
/**
 * Платформы, у которых есть магазин.
 *
 * ⚠️ Список, а не `!== 'web'`: приложение собирается ещё и в веб-вариант, и там
 * нативного магазина нет вовсе. Проверка «не андроид» жила здесь до выхода в
 * App Store — тогда у Apple не было ни учётной записи, ни товаров. Снято
 * 2026-10-21 вместе с появлением `verifyApplePurchase` на сервере: оставить её
 * значило бы, что на iPhone кнопки оплаты есть, а покупка молча не начинается.
 */
const STORE_PLATFORMS = ['android', 'ios']

export function usePurchaseFlow(
  onApplied: (result: VerifyResult) => void,
  onFailed?: () => void
): PurchaseFlow {
  const {t} = useLanguage()

  const [plans, setPlans] = useState<Plan[]>([])
  const [boostPlans, setBoostPlans] = useState<BoostPlan[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Объявление и обработчик нужны слушателю, а он живёт дольше одной отрисовки.
  // Через состояние они пришли бы устаревшими — отсюда ссылки.
  const propertyIdRef = useRef('')
  const appliedRef = useRef(onApplied)
  appliedRef.current = onApplied
  const failedRef = useRef(onFailed)
  failedRef.current = onFailed
  const textRef = useRef(t)
  textRef.current = t

  const apply = useCallback(async (purchase: Purchase) => {
    setBusy(true)
    setError('')
    try {
      const result = await verifyAndFinish(purchase, propertyIdRef.current)
      appliedRef.current(result)
    } catch {
      setError(textRef.current.promote.failed.replace('{store}', STORE_NAME))
      failedRef.current?.()
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    // Слушатели поднимаются на ОБЕИХ платформах с 2026-10-21: касс теперь две,
    // и у обеих результат покупки приходит событием, а не ответом на вызов.
    if (!STORE_PLATFORMS.includes(Platform.OS)) return

    const bought = purchaseUpdatedListener(purchase => {
      void apply(purchase)
    })

    const failed = purchaseErrorListener(err => {
      setBusy(false)
      // Отмену человеком не показываем ошибкой: он сам закрыл окно оплаты. Но
      // сообщить экрану надо и об отмене — при подаче объявления черновик уже
      // создан, и экрану есть что с этим делать.
      if (err.code !== ErrorCode.UserCancelled) {
        setError(textRef.current.promote.failed.replace('{store}', STORE_NAME))
      }
      failedRef.current?.()
    })

    return () => {
      bought.remove()
      failed.remove()
    }
  }, [apply])

  const prepare = useCallback(async () => {
    // Магазин есть только на телефонах. На вебе (приложение собирается и в
    // веб-вариант) обращаться к нему нечем, и список тарифов останется пустым —
    // экран покажет это как недоступность.
    if (!STORE_PLATFORMS.includes(Platform.OS)) return

    try {
      await connectStore()
      const available = await loadPlans()
      setPlans(available)

      // Пакеты подъёма спрашиваем отдельно и их отсутствие ошибкой НЕ считаем:
      // в Play Console они заводятся позже тарифов, и до этого момента экран
      // обязан работать — просто без подъёма.
      const boosts = await loadBoostPlans().catch(() => [] as BoostPlan[])
      setBoostPlans(boosts)

      if (available.length === 0) {
        // Чаще всего это не поломка: отладочная сборка из Metro покупки не
        // проводит, и Google отдаёт ей пустой список.
        setError(textRef.current.promote.unavailable)
        return
      }

      const pending = await pendingPurchases()
      if (pending.length === 0) return
      setError(textRef.current.promote.pendingFound)
      for (const purchase of pending) {
        await apply(purchase)
      }
    } catch {
      setError(textRef.current.promote.unavailable)
    }
  }, [apply])

  const start = useCallback((productId: string, propertyId: string) => {
    propertyIdRef.current = propertyId
    setBusy(true)
    setError('')
    startPurchase(productId, propertyId).catch(() => {
      setBusy(false)
      setError(textRef.current.promote.unavailable)
    })
  }, [])

  return {plans, boostPlans, busy, error, start, prepare}
}
