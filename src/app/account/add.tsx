import {useEffect, useRef, useState} from 'react'
import {AppState, Pressable, StyleSheet, Text, View} from 'react-native'
import {Stack, router} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import {useAuth} from '@/auth/auth-provider'
import {ListingForm, type ListingFormValues} from '@/components/listing-form'
import {PlanPicker} from '@/components/plan-picker'
import {StatusDialog, type StatusVariant} from '@/components/status-dialog'
import {SubmitProgress} from '@/components/submit-progress'
import {BlockedNotice} from '@/components/blocked-notice'
import {usePurchaseFlow} from '@/components/use-purchase-flow'
import {useWatermark} from '@/components/use-watermark'
import {useLanguage} from '@/i18n/language-provider'
import {STORE_NAME, planOf} from '@/services/billing-service'
import {
  describeFailure,
  newReportCode,
  reportSubmit,
  type FailureCause,
  type SubmitStep
} from '@/services/diagnostics-service'
import {createListing, geocode, uploadImages} from '@/services/listing-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

/** Что показать в окне итога. Собирается на месте события, а не в компоненте. */
type Outcome = {
  variant: StatusVariant
  title: string
  body?: string
  note?: string
  support?: boolean
  primary: {label: string; onPress: () => void}
  secondary?: {label: string; onPress: () => void}
  /** Можно ли закрыть окно подложкой и кнопкой «назад». */
  dismissable?: boolean
}

/**
 * Доля сделанного по шагам подачи.
 *
 * Числа не ровные намеренно: снимки занимают большую часть времени, и давать им
 * треть полосы значило бы врать о том, сколько осталось. Место на карте ищется
 * секунду, документ сохраняется мгновенно — им края.
 */
const STEP = {
  location: 0.08,
  photosFrom: 0.1,
  photosTo: 0.75,
  saving: 0.85,
  payment: 0.95
} as const

/**
 * Подача объявления.
 *
 * Форма общая с правкой — см. `ListingForm`. Здесь своё: выбор тарифа и оплата.
 *
 * Порядок повторяет сайт (`use-listing-editor.ts`): бесплатный `standard`
 * создаётся сразу со статусом «на проверке», платный — **черновиком**, и на
 * витрину попадает только после подтверждённой оплаты. Иначе неоплаченный
 * премиум висел бы наверху выдачи.
 *
 * Разница с сайтом одна — касса. Там после создания черновика человек уезжает на
 * страницу Azericard, здесь открывается окно Google Play: уводить на внешнюю
 * оплату из приложения магазины запрещают.
 *
 * ⚠️ Выбор тарифа показывается на ОБЕИХ платформах с 2026-10-21: товары появились
 * и в App Store. Условие «только Android» снято целиком, а список и так пуст,
 * если магазин ничего не отдал (`showPlans`).
 *
 * ⚠️ Итог показывается своим окном (`StatusDialog`), а не `Alert.alert`. Решение
 * владельца от 2026-10-14, и дело не в красоте: системное окно умеет заголовок,
 * строку и кнопку. Человек, который впервые отдал нам полчаса работы и двадцать
 * снимков, должен понять, что объявление сохранено, что его смотрит человек и
 * что это не отказ. Строка «На модерации» не объясняет ни одного из трёх.
 *
 * ⚠️ И полоса загрузки вместо системного кружка — по той же причине. Двадцать
 * снимков с водяным знаком это десятки секунд, за которые кружок не отличим от
 * зависшего приложения; человек жмёт «назад» и теряет всё заполненное.
 */
export default function AddListingScreen() {
  const {t} = useLanguage()
  const {user, profile} = useAuth()

  const {stage, apply} = useWatermark()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  /** Полоса загрузки: доля и подпись шага. `null` — подача не идёт. */
  const [progress, setProgress] = useState<{value: number; label: string} | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  // Что выбрано: null — бесплатный standard, иначе идентификатор товара.
  const [plan, setPlan] = useState<string | null>(null)

  // Платили ли ИМЕННО ЗДЕСЬ за объявление, созданное в этот раз.
  //
  // ⚠️ Нужно потому, что `prepare()` при открытии экрана забирает незавершённые
  // покупки прошлых сеансов — например оплату, прерванную закрытием приложения.
  // Без этой отметки такая покупка вызвала бы сообщение «объявление создано» на
  // экране, где ничего не создавали, и увела бы человека из заполненной формы.
  const paidHere = useRef(false)

  // Последнее отправленное, чтобы кнопка «Попробовать снова» в окне ошибки
  // работала одним нажатием, а не возвращала человека к кнопке подачи.
  const lastValues = useRef<ListingFormValues | null>(null)

  /**
   * Ход идущей подачи — то, что уедет в донесении.
   *
   * ⚠️ Существует потому, что в разборе 21 ноября не было НИЧЕГО: ни шага, ни
   * числа снимков, ни кода ошибки. Восстанавливать пришлось по именам файлов,
   * оставшихся в хранилище, и заняло это двое суток. Здесь всё то же самое
   * собирается на ходу и стоит один объект в памяти.
   */
  const attempt = useRef<{
    code: string
    startedAt: number
    step: SubmitStep
    photosTotal: number
    photosDone: number
    backgrounded: boolean
    /** Сколько раз отправка снимка срывалась и начиналась заново. */
    retries: number
    /** Чем сорвалась последняя — даже если в итоге снимок доехал. */
    retryCode: string | null
  } | null>(null)

  // ⚠️ Отмечаем, что человек уходил из приложения. Это не любопытство: именно
  // уход ломал подачу — свёрнутое приложение не рисует вид, которым наносится
  // водяной знак, и страховка объявляла снимок неудавшимся. Починка в
  // `use-watermark` ждёт возврата, а это поле — способ убедиться, что она
  // работает: отныне уходов в донесениях будет много, а отказов по ним ни одного.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && attempt.current) attempt.current.backgrounded = true
    })
    return () => subscription.remove()
  }, [])

  const toListings = () => {
    setOutcome(null)
    router.replace('/account/listings')
  }

  /**
   * Что сказать человеку о причине отказа.
   *
   * ⚠️ Неизвестная причина получает ОБЩИЙ текст, а не «проверьте интернет».
   * Прежде связь обвинялась всегда — и в разборе 21 ноября это сбило с толку
   * первым делом: искали плохую связь, которой не было, а человек просто выходил
   * из приложения.
   */
  const causeBody = (cause: FailureCause): string => {
    switch (cause) {
      case 'leftApp':
        return t.dialog.errorLeftApp
      case 'signedOut':
        return t.dialog.errorSignedOut
      case 'photo':
        return t.dialog.errorPhoto
      case 'network':
        return t.dialog.errorNetwork
      case 'rights':
        return t.dialog.errorRights
      default:
        return t.dialog.errorBody
    }
  }

  /** Объявление создано и ушло к модератору — главный успешный исход экрана. */
  const showModerationDone = () =>
    setOutcome({
      variant: 'success',
      title: t.dialog.moderationTitle,
      body: t.dialog.moderationBody,
      note: t.dialog.moderationNote,
      primary: {label: t.dialog.toListings, onPress: toListings}
      // Окно намеренно не закрывается ничем, кроме кнопки: форма под ним
      // заполнена, и вторая отправка создала бы второе объявление.
    })

  const purchase = usePurchaseFlow(
    result => {
      // ⚠️ Сюда может прийти ПОДЪЁМ, хотя на этом экране его не покупают:
      // незавершённые покупки забираются при открытии любого экрана, и человек
      // мог оплатить подъём, а приложение закрыть до проверки чека. Тогда
      // применён подъём, а не тариф, и говорить «тариф до такого-то числа»
      // значило бы соврать — даты у подъёма нет вовсе.
      if (result.kind === 'boost') {
        setOutcome({
          variant: 'success',
          title: t.boost.done,
          body: t.boost.doneOne,
          primary: {label: t.buttons.close, onPress: () => setOutcome(null)},
          dismissable: true
        })
        return
      }

      if (!paidHere.current) {
        // Догнали покупку прошлого сеанса. Объявление тогда уже было создано,
        // тариф теперь поставлен — сообщаем про тариф, а не про создание, и с
        // формы никуда не уводим: человек пришёл подавать новое.
        setOutcome({
          variant: 'success',
          title: t.promote.title,
          body: t.promote.success.replace('{date}', result.expiryDate.slice(0, 10)),
          primary: {label: t.buttons.close, onPress: () => setOutcome(null)},
          dismissable: true
        })
        return
      }

      // Тариф поставлен сервером, объявление вышло из черновика и ушло к
      // модератору — тот же итог, что у бесплатной подачи.
      showModerationDone()
    },
    () => {
      // Не наша покупка — значит и объявления сейчас не создавали. Сообщение об
      // ошибке уже показано в списке тарифов, уводить некуда.
      if (!paidHere.current) return

      // Оплата не состоялась, а объявление уже создано черновиком. Оставлять
      // человека на заполненной форме НЕЛЬЗЯ: вторая отправка создала бы второй
      // черновик. Уводим в список, где черновик виден и где его можно оплатить
      // кнопкой продвижения — про это и говорит приписка.
      //
      // Поддержка здесь обязательна: речь о деньгах, и человек должен иметь
      // куда написать, не разыскивая наши контакты по сайту.
      setOutcome({
        variant: 'error',
        title: t.promote.failed.replace('{store}', STORE_NAME),
        note: t.dialog.moderationNote,
        support: true,
        primary: {label: t.dialog.toListings, onPress: toListings}
      })
    }
  )

  useEffect(() => {
    void purchase.prepare()
    // Один раз при открытии экрана: `prepare` стабилен по ссылке.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (values: ListingFormValues) => {
    lastValues.current = values
    // Код придумывается ЗДЕСЬ, до первого обращения к сети: человек должен
    // увидеть его и при полном обрыве связи, когда донесение до нас не доедет.
    attempt.current = {
      code: newReportCode(),
      startedAt: Date.now(),
      step: 'location',
      photosTotal: values.newImages.length,
      photosDone: 0,
      backgrounded: false,
      retries: 0,
      retryCode: null
    }
    setSaving(true)
    setError('')
    setOutcome(null)
    setProgress({value: STEP.location, label: t.dialog.stepLocation})
    try {
      // Точка, поставленная на карте, важнее найденной по адресу: человек
      // уточнил её руками. Не ставил — выясняет геокодер по адресу и городу,
      // тот же, что на сайте. Без координат объявление не попадёт ни на карту
      // витрины, ни в «похожие».
      const coordinates =
        values.coordinates ??
        (await geocode([values.address, values.city].filter(Boolean).join(', ')))

      if (attempt.current) attempt.current.step = 'photos'

      const urls = await uploadImages(values.newImages, apply, (done, total) => {
        if (attempt.current) {
          attempt.current.photosDone = done
          attempt.current.photosTotal = total
        }
        if (total === 0) {
          setProgress({value: STEP.photosTo, label: t.dialog.stepSaving})
          return
        }
        setProgress({
          value: STEP.photosFrom + (STEP.photosTo - STEP.photosFrom) * (done / total),
          label: t.dialog.stepPhotos
            .replace('{done}', String(done))
            .replace('{total}', String(total))
        })
      }, (index, attemptNo, code) => {
        // Полосу не трогаем: снимок ещё не готов, и дёргать её назад значило бы
        // врать о доле. Повтор занимает секунды и человеку не виден — а вот в
        // донесении он виден, и только по нему мы узнаем, помогла ли починка.
        if (!attempt.current) return
        attempt.current.retries += 1
        attempt.current.retryCode = `${code}@${index}/${attemptNo}`
      })

      setProgress({value: STEP.saving, label: t.dialog.stepSaving})
      if (attempt.current) attempt.current.step = 'saving'

      const chosen = plan ? planOf(plan) : null

      const propertyId = await createListing({
        title: values.title,
        description: values.description,
        type: values.type,
        city: values.city,
        district: values.district,
        address: values.address,
        price: values.price,
        rooms: values.rooms,
        area: values.area,
        // Обе границы вместимости спрашивает форма — как на сайте. Раньше
        // нижняя жёстко ставилась единицей: поля для неё не было.
        minGuests: values.minGuests,
        maxGuests: values.maxGuests,
        locationTags: values.locationTags,
        locationCategory: values.locationCategory,
        extraFeatures: values.extraFeatures,
        nearbyPlaces: values.nearbyPlaces,
        amenities: values.amenities,
        coordinates,
        images: urls,
        owner: {
          name: profile?.name ?? '',
          phone: profile?.phone ?? '',
          email: user?.email ?? ''
        },
        tier: chosen?.tier ?? 'standard'
      })

      // Успех доносится ТОЖЕ, и это решение владельца от 2026-11-22. Без успехов
      // неизвестен знаменатель: «три отказа» значит одно, когда подач было три,
      // и совсем другое, когда их было сто. Момент выбран здесь, а не после
      // оплаты, намеренно — объявление с этой секунды существует, а оплата это
      // уже отдельная история со своим журналом.
      const run = attempt.current
      void reportSubmit({
        outcome: 'success',
        code: run?.code ?? newReportCode(),
        step: run?.step,
        photosTotal: run?.photosTotal,
        photosDone: run?.photosDone,
        backgrounded: run?.backgrounded,
        retries: run?.retries,
        retryCode: run?.retryCode ?? undefined,
        durationMs: run ? Date.now() - run.startedAt : undefined,
        tier: chosen?.tier ?? 'standard',
        propertyId
      })

      if (plan && chosen) {
        // Объявление уже создано черновиком — теперь оплата. Дальше всё ведёт
        // `usePurchaseFlow`: окно Google, проверка чека на сервере, тариф.
        //
        // Если человек закроет окно оплаты или платёж не пройдёт, объявление
        // останется черновиком и будет видно в «Моих объявлениях»: оплатить его
        // можно потом кнопкой продвижения. Так же ведёт себя сайт — черновик не
        // удаляется при отказе от оплаты.
        paidHere.current = true
        setProgress({value: STEP.payment, label: t.dialog.stepPayment})
        if (attempt.current) attempt.current.step = 'payment'
        purchase.start(plan, propertyId)
        return
      }

      showModerationDone()
    } catch (failure) {
      // ⚠️ `catch (failure)`, а НЕ `catch {`. До 2026-11-22 здесь стояло второе:
      // приложение получало готовый ответ, чем именно отказало, и выбрасывало
      // его не посмотрев. Из-за этого единственный разбор занял двое суток и
      // вёлся по именам файлов в хранилище. Переменную отсюда не убирать.
      const run = attempt.current
      const code = run?.code ?? newReportCode()
      const {cause, errorName, errorCode, errorMessage} = describeFailure(failure)

      void reportSubmit({
        outcome: 'error',
        code,
        cause,
        step: run?.step,
        photosTotal: run?.photosTotal,
        photosDone: run?.photosDone,
        backgrounded: run?.backgrounded,
        retries: run?.retries,
        retryCode: run?.retryCode ?? undefined,
        durationMs: run ? Date.now() - run.startedAt : undefined,
        tier: plan ?? 'standard',
        errorName,
        errorCode,
        errorMessage
      })

      setError(t.listing.createdFailed)
      // ⚠️ Объявление к этому моменту НЕ создано: `createListing` — последнее
      // ожидание в кладке, и до него дело не дошло. Значит повтор безопасен и
      // второго объявления не наделает.
      setOutcome({
        variant: 'error',
        title: t.dialog.errorTitle,
        // Причина, а не вечное «проверьте интернет». Прежний текст винил связь
        // всегда — в том числе когда человек просто выходил из приложения, и
        // именно это сбивало с толку в разборе: владелец искал связь, которой
        // ничего не было.
        body: causeBody(cause),
        note: `${t.dialog.errorNote}\n\n${t.dialog.errorCode.replace('{code}', code)}`,
        support: true,
        primary: {
          label: t.dialog.retry,
          onPress: () => {
            setOutcome(null)
            const again = lastValues.current
            if (again) void submit(again)
          }
        },
        secondary: {label: t.buttons.close, onPress: () => setOutcome(null)},
        dismissable: true
      })
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  // Тарифы показываем, когда магазин их вернул, — на любой платформе. Проверки
  // «только андроид» здесь больше нет: в App Store товары появились, а список
  // тарифов и так пуст, если магазин ничего не отдал.
  const showPlans = purchase.plans.length > 0

  // Тариф, выбранный в списке выше, — форме он нужен ровно для предела снимков.
  //
  // ⚠️ Передаётся ОТДЕЛЬНО, потому что `plan` здесь это идентификатор товара
  // (`premium_14`), а форма про магазин не знает и знать не должна. Пока этого
  // не было, выбор Premium предела не поднимал: форма видела `standard` и
  // давала двадцать снимков при обещанных тут же тридцати.
  const plannedTier = (plan ? planOf(plan)?.tier : undefined) ?? 'standard'

  // Полоса держится и на проверке чека, но только если платили здесь: при
  // открытии экрана `prepare()` проверяет чужую незавершённую покупку, и полоса
  // подачи объявления там была бы не к месту.
  const verifying = purchase.busy && paidHere.current
  // Под открытым окном итога полоса ни к чему: подача уже кончилась, и два
  // окна друг на друге читались бы как незаконченное действие.
  const showProgress = (progress !== null || verifying) && outcome === null

  return (
    <>
      <Stack.Screen options={{title: t.dashboard.addListing}} />

      <ListingForm
        submitLabel={t.dashboard.addListing}
        saving={saving || purchase.busy}
        error={error}
        onSubmit={submit}
        plannedTier={plannedTier}
        header={
          <>
            {/* Полоса блокировки — выше тарифов: узнать о запрете надо ДО
                того, как заполнишь анкету и получишь отказ при сохранении. */}
            <BlockedNotice />

            {showPlans ? (
            <View style={styles.plans}>
              <Text style={styles.plansTitle}>{t.pricing.plans}</Text>

              {/* Бесплатный тариф — не товар магазина, поэтому рисуется здесь, а
                  не в списке платных. Выбран по умолчанию: подача не должна
                  требовать денег. */}
              <Pressable
                style={({pressed}) => [
                  styles.free,
                  pressed && styles.freePressed,
                  plan === null && styles.freeSelected
                ]}
                onPress={() => setPlan(null)}
              >
                <View style={styles.freeHead}>
                  <Text style={styles.freeName}>{t.pricing.standard}</Text>
                  <Text style={styles.freePrice}>{t.pricing.free}</Text>
                </View>
                {plan === null ? (
                  <View style={styles.freeMark}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                    <Text style={styles.freeMarkText}>{t.pricing.standardDesc}</Text>
                  </View>
                ) : null}
              </Pressable>

              {/* Подписи здесь — названия ступеней, а не «Повысить до VIP»:
                  объявление подают впервые, повышать ещё нечего. */}
              <PlanPicker
                plans={purchase.plans}
                busy={purchase.busy}
                error={purchase.error}
                labels={{vip: t.pricing.vip, premium: t.pricing.premium}}
                selectedId={plan}
                onPick={setPlan}
              />
            </View>
            ) : null}
          </>
        }
      />

      {/* На проверке чека подпись берётся не из шагов подачи: это та же
          проверка, о которой говорит список тарифов, и текст у неё свой. */}
      <SubmitProgress
        visible={showProgress}
        progress={progress?.value ?? STEP.payment}
        label={progress?.label ?? t.promote.checking}
      />

      {outcome ? (
        <StatusDialog
          visible
          variant={outcome.variant}
          title={outcome.title}
          body={outcome.body}
          note={outcome.note}
          support={outcome.support}
          primary={outcome.primary}
          secondary={outcome.secondary}
          onRequestClose={outcome.dismissable ? () => setOutcome(null) : undefined}
        />
      ) : null}

      {/* Вид для наложения водяного знака: рисуется за краем экрана,
          нужен только чтобы снять с него кадр. */}
      {stage}
    </>
  )
}

const styles = StyleSheet.create({
  plans: {gap: spacing.sm, paddingBottom: spacing.base},
  plansTitle: {fontSize: fontSize.base, fontWeight: '600', color: colors.text},
  free: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.sm,
    ...shadow.sm
  },
  freePressed: {opacity: 0.75},
  freeSelected: {borderWidth: 2, borderColor: colors.primary},
  freeHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  freeName: {fontSize: fontSize.base, fontWeight: '600', color: colors.text},
  freePrice: {fontSize: fontSize.base, fontWeight: '700', color: colors.primary},
  freeMark: {flexDirection: 'row', alignItems: 'center', gap: 6},
  freeMarkText: {fontSize: fontSize.xs, color: colors.gray500}
})
