import {useEffect, useRef, useState} from 'react'
import {Alert, Platform, Pressable, StyleSheet, Text, View} from 'react-native'
import {Stack, router} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import {useAuth} from '@/auth/auth-provider'
import {ListingForm, type ListingFormValues} from '@/components/listing-form'
import {PlanPicker} from '@/components/plan-picker'
import {usePurchaseFlow} from '@/components/use-purchase-flow'
import {useWatermark} from '@/components/use-watermark'
import {useLanguage} from '@/i18n/language-provider'
import {planOf} from '@/services/billing-service'
import {createListing, geocode, uploadImages} from '@/services/listing-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

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
 * ⚠️ Выбор тарифа показывается только на Android. В App Store товаров пока нет, и
 * на iOS подача остаётся бесплатной — показывать тарифы без возможности купить
 * ни к чему.
 */
export default function AddListingScreen() {
  const {t} = useLanguage()
  const {user, profile} = useAuth()

  const {stage, apply} = useWatermark()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Что выбрано: null — бесплатный standard, иначе идентификатор товара.
  const [plan, setPlan] = useState<string | null>(null)

  // Платили ли ИМЕННО ЗДЕСЬ за объявление, созданное в этот раз.
  //
  // ⚠️ Нужно потому, что `prepare()` при открытии экрана забирает незавершённые
  // покупки прошлых сеансов — например оплату, прерванную закрытием приложения.
  // Без этой отметки такая покупка вызвала бы сообщение «объявление создано» на
  // экране, где ничего не создавали, и увела бы человека из заполненной формы.
  const paidHere = useRef(false)

  const purchase = usePurchaseFlow(
    expiryDate => {
      if (!paidHere.current) {
        // Догнали покупку прошлого сеанса. Объявление тогда уже было создано,
        // тариф теперь поставлен — сообщаем про тариф, а не про создание, и с
        // формы никуда не уводим: человек пришёл подавать новое.
        Alert.alert('', t.promote.success.replace('{date}', expiryDate.slice(0, 10)))
        return
      }

      // Тариф поставлен сервером, объявление вышло из черновика и ушло к
      // модератору — тот же текст, что у бесплатной подачи.
      Alert.alert(t.dashboard.listingAdded, t.dashboard.pending, [
        {text: t.buttons.close, onPress: () => router.replace('/account/listings')}
      ])
    },
    () => {
      // Не наша покупка — значит и объявления сейчас не создавали. Сообщение об
      // ошибке уже показано в списке тарифов, уводить некуда.
      if (!paidHere.current) return

      // Оплата не состоялась, а объявление уже создано черновиком. Оставлять
      // человека на заполненной форме НЕЛЬЗЯ: вторая отправка создала бы второй
      // черновик. Уводим в список, где черновик виден и где его можно оплатить
      // кнопкой продвижения.
      Alert.alert(t.dashboard.listingAdded, t.promote.failed, [
        {text: t.buttons.close, onPress: () => router.replace('/account/listings')}
      ])
    }
  )

  useEffect(() => {
    void purchase.prepare()
    // Один раз при открытии экрана: `prepare` стабилен по ссылке.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (values: ListingFormValues) => {
    setSaving(true)
    setError('')
    try {
      // Координаты выясняет геокодер по адресу и городу — тот же, что на сайте.
      // Без них объявление не попадёт ни на карту витрины, ни в «похожие».
      const coordinates = await geocode(
        [values.address, values.district, values.city].filter(Boolean).join(', ')
      )
      const urls = await uploadImages(values.newImages, apply)

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
        // Нижнюю границу вместимости не спрашиваем: на сайте её почти не
        // заполняют, а фильтр сравнивает диапазоны — единица безопасна.
        minGuests: 1,
        maxGuests: values.maxGuests,
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

      if (plan && chosen) {
        // Объявление уже создано черновиком — теперь оплата. Дальше всё ведёт
        // `usePurchaseFlow`: окно Google, проверка чека на сервере, тариф.
        //
        // Если человек закроет окно оплаты или платёж не пройдёт, объявление
        // останется черновиком и будет видно в «Моих объявлениях»: оплатить его
        // можно потом кнопкой продвижения. Так же ведёт себя сайт — черновик не
        // удаляется при отказе от оплаты.
        paidHere.current = true
        purchase.start(plan, propertyId)
        return
      }

      Alert.alert(t.dashboard.listingAdded, t.dashboard.pending, [
        {text: t.buttons.close, onPress: () => router.replace('/account/listings')}
      ])
    } catch {
      setError(t.listing.createdFailed)
    } finally {
      setSaving(false)
    }
  }

  const showPlans = Platform.OS === 'android' && purchase.plans.length > 0

  return (
    <>
      <Stack.Screen options={{title: t.dashboard.addListing}} />

      <ListingForm
        submitLabel={t.dashboard.addListing}
        saving={saving || purchase.busy}
        error={error}
        onSubmit={submit}
        header={
          showPlans ? (
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

              <PlanPicker
                plans={purchase.plans}
                busy={purchase.busy}
                error={purchase.error}
                selectedId={plan}
                onPick={setPlan}
              />
            </View>
          ) : null
        }
      />

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
