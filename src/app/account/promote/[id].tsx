import {useCallback, useEffect, useRef, useState} from 'react'
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native'
import {Stack, router, useLocalSearchParams} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import type {Property} from '@birklik/core/types'
import {isBoostActive} from '@birklik/core/utils/boost-helper'
import {isTierActive, tierExpiresAt} from '@birklik/core/utils/premium-helper'

import {useAuth} from '@/auth/auth-provider'
import {BoostPicker} from '@/components/boost-picker'
import {PlanPicker} from '@/components/plan-picker'
import {usePurchaseFlow} from '@/components/use-purchase-flow'
import {useLanguage} from '@/i18n/language-provider'
import {getBoostRemaining, getOwnerProperties} from '@/services/property-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type PaidTier = 'vip' | 'premium'

/** Цвет ступени — тот же, что у значков на карточках и в `PlanPicker`. */
const TIER_COLOR: Record<PaidTier, string> = {vip: colors.secondary, premium: colors.accent}

/** Цвет подъёма — тот же, что в `BoostPicker` и у кнопки на сайте. */
const BOOST_COLOR = '#1b7f5a'

/**
 * Продвижение существующего объявления.
 *
 * Что предлагать, решает ДЕЙСТВУЮЩИЙ тариф объявления, а не поле `listingTier`:
 * у истёкшего платного оно остаётся прежним.
 *
 * ```
 * обычное или истёкшее   VIP и Premium, обе ступени
 * действует VIP          продлить VIP либо перейти на Premium
 * действует Premium      только продлить Premium
 * ```
 *
 * ⚠️ Premium-у VIP НЕ предлагается, и это главное правило экрана. Оплата VIP
 * проходит через `applyPaidTier`, а она стирает дату прежнего тарифа: Premium
 * стал бы VIP, и оплаченные дни сгорели бы. Кнопки, после которой человек
 * теряет оплаченное, быть не должно — вместо неё объяснение, почему её нет.
 *
 * Подъём (`BoostPicker`) показывается ТОЛЬКО обычному объявлению. Технически он
 * работает и у платных — поднимает внутри своей полосы, — но VIP и Premium и так
 * стоят выше всех обычных, и продавать им то, что у них уже есть, мы не станем.
 * Та же развилка на сайте, в `owner-actions.tsx`.
 *
 * Достижим только на Android: кнопки, ведущие сюда, на iOS скрыты, пока нет
 * товаров в App Store. Показывать тарифы без возможности купить ни к чему, а
 * уводить на оплату на сайте запрещает правило 3.1.1(a).
 *
 * Весь ход покупки — в `usePurchaseFlow`, общем с подачей объявления. Здесь
 * только своё: что продвигаем, что предлагаем и что показать после оплаты.
 */
export default function PromoteListingScreen() {
  const {id, focus} = useLocalSearchParams<{id: string; focus?: string}>()
  const {language, t} = useLanguage()
  const {user} = useAuth()

  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  /** Дата окончания из ответа сервера. Проставлена — показываем итог вместо тарифов. */
  const [doneUntil, setDoneUntil] = useState<string | null>(null)
  /** Какую ступень показать в итоге. */
  const [doneTier, setDoneTier] = useState<PaidTier>('vip')
  /** Итог подъёма: сколько подъёмов осталось после этой покупки. */
  const [doneBoost, setDoneBoost] = useState<number | null>(null)
  /** Остаток незаконченного пакета — для подписи над пакетами. */
  const [boostsLeft, setBoostsLeft] = useState(0)
  /**
   * На что нажали. Запасной ответ на вопрос «что купили», если перечитать
   * объявление не удалось: без него итог показал бы VIP человеку, купившему
   * Premium, — то есть соврал бы ровно в том месте, ради которого и затеян.
   */
  const pickedTier = useRef<PaidTier | null>(null)

  const fetchProperty = useCallback(async () => {
    if (!user || !id) return null
    // Объявление берём из СВОИХ: `getProperty` возвращает null для снятого с
    // витрины, а продлевают чаще всего именно истёкшее.
    const mine = await getOwnerProperties(user.uid).catch(() => [] as Property[])
    return mine.find(item => item.id === id) ?? null
  }, [user, id])

  const purchase = usePurchaseFlow(result => {
    // Подъём — не тариф: у него нет срока, и показывать «действует до» по нему
    // нельзя. Отличаем по ответу сервера, а не по тому, на что нажали:
    // незавершённая покупка подхватывается при входе на экран, и нажатия тогда
    // не было вовсе.
    if (result.kind === 'boost') {
      setDoneBoost(result.remaining ?? 0)
      void fetchProperty().then(fresh => {
        if (fresh) setProperty(fresh)
      })
      return
    }

    // Перечитываем объявление: какой тариф в итоге стоит — знает сервер, а не
    // то, на что нажали.
    void fetchProperty().then(fresh => {
      if (fresh) setProperty(fresh)
      setDoneTier(
        fresh
          ? isTierActive(fresh, 'premium')
            ? 'premium'
            : 'vip'
          : (pickedTier.current ?? 'vip')
      )
      setDoneUntil(result.expiryDate)
    })
  })

  useEffect(() => {
    if (!user || !id) return

    let alive = true

    const load = async () => {
      const found = await fetchProperty()
      if (!alive) return
      setProperty(found)
      const left = await getBoostRemaining(id)
      if (!alive) return
      setBoostsLeft(left)
      await purchase.prepare()
    }

    void load().finally(() => {
      if (alive) setLoading(false)
    })

    return () => {
      alive = false
    }
    // `prepare` стабилен по ссылке; включать весь объект покупки в зависимости
    // значило бы переподключаться к магазину на каждую отрисовку.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const premiumActive = property ? isTierActive(property, 'premium') : false
  const vipActive = property ? isTierActive(property, 'vip') : false
  const boostActive = property ? isBoostActive(property) : false
  const expires = property ? tierExpiresAt(property) : null
  const title = property ? property.title?.[language] || property.title?.az || '' : ''

  // Итог подъёма. Отдельно от итога тарифа: показывать нечего из тарифного —
  // ни срока, ни перечня возможностей, — зато есть остаток пакета.
  if (doneBoost !== null) {
    return (
      <>
        <Stack.Screen options={{title: t.boost.title}} />
        <ScrollView contentContainerStyle={styles.page}>
          <View style={[styles.doneHead, {backgroundColor: BOOST_COLOR}]}>
            <Ionicons name="arrow-up-circle" size={40} color={colors.white} />
            <Text style={styles.doneTitle}>{t.boost.done}</Text>
            <Text style={styles.doneUntil}>
              {doneBoost > 0
                ? t.boost.doneMany.replace('{count}', String(doneBoost))
                : t.boost.doneOne}
            </Text>
          </View>

          {title ? (
            <Text style={styles.doneProperty} numberOfLines={2}>
              {title}
            </Text>
          ) : null}

          <Pressable
            style={[styles.backButton, {backgroundColor: BOOST_COLOR}]}
            onPress={() => router.back()}
          >
            <Text style={styles.backText}>{t.promote.backToListing}</Text>
          </Pressable>
        </ScrollView>
      </>
    )
  }

  // Итог оплаты: что человек получил, а не одна дата.
  if (doneUntil) {
    const tier = doneTier
    const accent = TIER_COLOR[tier]
    const features: string[] = t.pricing.features[tier]

    return (
      <>
        <Stack.Screen options={{title: t.promote.title}} />
        <ScrollView contentContainerStyle={styles.page}>
          <View style={[styles.doneHead, {backgroundColor: accent}]}>
            <Ionicons name="checkmark-circle" size={40} color={colors.white} />
            <Text style={styles.doneTitle}>
              {tier === 'premium' ? t.promote.donePremium : t.promote.doneVip}
            </Text>
            <Text style={styles.doneUntil}>
              {t.promote.doneUntil.replace('{date}', doneUntil.slice(0, 10))}
            </Text>
          </View>

          {title ? (
            <Text style={styles.doneProperty} numberOfLines={2}>
              {title}
            </Text>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.benefitsTitle}>{t.promote.planBenefits}</Text>
            {features.map(line => (
              <View key={line} style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={15} color={accent} />
                <Text style={styles.benefitText}>{line}</Text>
              </View>
            ))}
          </View>

          <Pressable style={[styles.backButton, {backgroundColor: accent}]} onPress={() => router.back()}>
            <Text style={styles.backText}>{t.promote.backToListing}</Text>
          </Pressable>
        </ScrollView>
      </>
    )
  }

  // ⚠️ Premium-у предлагаем только Premium. Почему — в заголовке файла.
  const tiers: PaidTier[] = premiumActive ? ['premium'] : ['vip', 'premium']

  const labels = {
    vip: vipActive ? t.promote.extendVip : t.promote.upgradeVip,
    premium: premiumActive ? t.promote.extendPremium : t.promote.upgradePremium
  }

  /**
   * Пришли по кнопке подъёма — пакеты подъёма идут первыми.
   *
   * Без этого человек, нажавший «İrəli çək», попадал бы на экран, у которого
   * сверху VIP и Premium, и искал бы пакеты прокруткой. Экран один намеренно:
   * обе покупки идут одним ходом (`usePurchaseFlow`), и разводить их по двум
   * экранам значило бы держать две копии самого денежного кода в приложении.
   */
  const boostFirst = focus === 'boost'

  // Подъём — только обычному объявлению. Почему, и почему это не жадность: в
  // заголовке файла.
  const boostSection =
    !premiumActive && !vipActive ? (
      <>
        {boostActive ? (
          <View style={styles.boostActive}>
            <Ionicons name="arrow-up-circle" size={16} color={BOOST_COLOR} />
            <Text style={styles.boostActiveText}>{t.boost.activeNow}</Text>
          </View>
        ) : null}

        <BoostPicker
          plans={purchase.boostPlans}
          busy={purchase.busy}
          remaining={boostsLeft}
          onPick={productId => {
            // Ступень не отмечаем: это не тариф, и `pickedTier` к нему не
            // относится. Что купили, скажет сервер полем `kind`.
            purchase.start(productId, id ?? '')
          }}
        />
      </>
    ) : (
      <View style={styles.warning}>
        <Ionicons name="information-circle-outline" size={16} color={colors.gray600} />
        <Text style={styles.warningText}>{t.boost.notForPaid}</Text>
      </View>
    )

  // Что случится с днями. Продление приписывает их к остатку, переход на
  // Premium остаток VIP не переносит — об этом надо сказать ДО оплаты.
  const notes = {
    vip: vipActive ? t.promote.addDaysNote : undefined,
    premium: premiumActive
      ? t.promote.addDaysNote
      : vipActive
        ? t.promote.replaceNote
        : undefined
  }

  return (
    <>
      <Stack.Screen options={{title: t.promote.title}} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.subtitle}>{t.promote.subtitle}</Text>

        {/* Что продвигается и что у него сейчас. Без этого человек не уверен,
            что платит за то объявление, которое открывал. */}
        {property ? (
          <View style={styles.target}>
            <Text style={styles.targetTitle} numberOfLines={2}>
              {title}
            </Text>

            {premiumActive || vipActive ? (
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusBadge,
                    {backgroundColor: TIER_COLOR[premiumActive ? 'premium' : 'vip']}
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {premiumActive ? t.pricing.premium : t.pricing.vip}
                  </Text>
                </View>
                {expires ? (
                  <Text style={styles.targetHint}>
                    {t.promote.activeUntil.replace('{date}', expires.slice(0, 10))}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.targetHint}>{t.promote.currentStandard}</Text>
            )}
          </View>
        ) : null}

        {/* Почему у Premium нет кнопки VIP. Молчание тут выглядело бы потерей
            возможности, а это защита от потери оплаченных дней. */}
        {premiumActive ? (
          <View style={styles.warning}>
            <Ionicons name="information-circle-outline" size={16} color={colors.gray600} />
            <Text style={styles.warningText}>{t.promote.vipNotOffered}</Text>
          </View>
        ) : null}

        {boostFirst ? boostSection : null}

        <PlanPicker
          plans={purchase.plans}
          busy={purchase.busy}
          error={purchase.error}
          tiers={tiers}
          labels={labels}
          notes={notes}
          onPick={productId => {
            pickedTier.current =
              purchase.plans.find(plan => plan.id === productId)?.tier ?? null
            purchase.start(productId, id ?? '')
          }}
        />

        {boostFirst ? null : boostSection}
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  page: {padding: spacing.base, gap: spacing.sm},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  subtitle: {fontSize: fontSize.sm, color: colors.gray700, lineHeight: 20},
  target: {
    backgroundColor: colors.gray50,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  targetTitle: {fontSize: fontSize.base, fontWeight: '600', color: colors.text},
  targetHint: {fontSize: fontSize.xs, color: colors.gray500},
  statusRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  statusBadge: {paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm},
  statusBadgeText: {color: colors.white, fontSize: 10, fontWeight: '700'},
  warning: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: colors.gray50,
    borderRadius: radius.sm,
    padding: spacing.sm
  },
  warningText: {flex: 1, fontSize: 11, color: colors.gray600, lineHeight: 16},
  boostActive: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(27, 127, 90, 0.08)',
    borderRadius: radius.sm,
    padding: spacing.sm
  },
  boostActiveText: {flex: 1, fontSize: 11, color: '#156347', fontWeight: '700', lineHeight: 16},
  doneHead: {
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.base,
    padding: spacing.lg
  },
  doneTitle: {fontSize: fontSize.lg, fontWeight: '700', color: colors.white, textAlign: 'center'},
  doneUntil: {fontSize: fontSize.sm, color: colors.white, opacity: 0.9},
  doneProperty: {fontSize: fontSize.sm, color: colors.gray600, textAlign: 'center'},
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: 6,
    ...shadow.sm
  },
  benefitsTitle: {fontSize: fontSize.xs, fontWeight: '700', color: colors.gray600},
  benefit: {flexDirection: 'row', alignItems: 'flex-start', gap: 6},
  benefitText: {flex: 1, fontSize: fontSize.xs, color: colors.gray700, lineHeight: 18},
  backButton: {
    borderRadius: radius.base,
    paddingVertical: spacing.base,
    alignItems: 'center',
    marginTop: spacing.xs
  },
  backText: {color: colors.white, fontSize: fontSize.base, fontWeight: '700'}
})
