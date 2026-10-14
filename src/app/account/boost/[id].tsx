import {useCallback, useEffect, useState} from 'react'
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native'
import {Stack, router, useLocalSearchParams} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import type {Property} from '@birklik/core/types'
import {isBoostActive} from '@birklik/core/utils/boost-helper'
import {isTierActive} from '@birklik/core/utils/premium-helper'

import {useAuth} from '@/auth/auth-provider'
import {BoostPicker} from '@/components/boost-picker'
import {StatusDialog} from '@/components/status-dialog'
import {usePurchaseFlow} from '@/components/use-purchase-flow'
import {useLanguage} from '@/i18n/language-provider'
import {getBoostRemaining, getOwnerProperties} from '@/services/property-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

/** Цвет подъёма — тот же, что в `BoostPicker` и у кнопки на сайте. */
const BOOST_COLOR = '#1b7f5a'
const BOOST_SOFT = 'rgba(27, 127, 90, 0.10)'

/**
 * Подъём объявления — отдельный экран.
 *
 * ⚠️ До 2026-10-14 кнопка «İrəli çək» вела на экран продвижения, где пакеты
 * подъёма лежали блоком внизу, среди VIP и Premium. Решение владельца от
 * 2026-10-14: у подъёма свой экран, а из продвижения блок убран совсем. Причина
 * не в красоте: продвижение продаёт ступень на срок, подъём — место в своей
 * полосе на сутки, и человек, пришедший за вторым, читал условия первого.
 *
 * Что здесь есть сверх пакетов и чего не было на общем экране:
 * схема полос (куда именно встанет объявление), три шага «как это работает» и
 * честный отказ там, где подъём не сработает.
 *
 * ⚠️ Два отказа ДО оплаты, и оба обязательны:
 *
 * ```
 * действует VIP или Premium   они и так выше всех обычных — продавать нечего
 * объявление не на витрине    сутки подъёма истекли бы раньше, чем его увидят
 * ```
 *
 * Первый повторяет сайт, второй повторяет сервер: `initiatePayment` отвечает
 * `failed-precondition` объявлению со статусом не `active`. А вот оплата через
 * Google Play таких проверок НЕ делает — она применяет то, за что заплатили,
 * потому что деньги уже списаны. Значит отказать обязан экран, иначе человек со
 * снятого с витрины объявления заплатил бы за сутки, которых никто не увидит.
 *
 * Весь ход покупки — в `usePurchaseFlow`, общем с продвижением и подачей.
 */
export default function BoostListingScreen() {
  const {id} = useLocalSearchParams<{id: string}>()
  const {language, t} = useLanguage()
  const {user} = useAuth()

  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  /** Остаток незаконченного пакета. */
  const [boostsLeft, setBoostsLeft] = useState(0)
  /** Итог покупки: сколько подъёмов осталось после неё. Не null — показываем итог. */
  const [doneBoost, setDoneBoost] = useState<number | null>(null)
  /**
   * Подхваченная покупка ТАРИФА. Сюда она попадает не по нажатию: незавершённые
   * покупки забираются при открытии любого экрана, и человек мог оплатить VIP, а
   * приложение закрыть до проверки чека. Показать по ней «объявление поднято»
   * значило бы соврать.
   */
  const [recoveredTier, setRecoveredTier] = useState<string | null>(null)

  const fetchProperty = useCallback(async () => {
    if (!user || !id) return null
    // Берём из СВОИХ: `getProperty` отдаёт null для снятого с витрины, а здесь
    // такое объявление надо именно показать — вместе с отказом поднимать его.
    const mine = await getOwnerProperties(user.uid).catch(() => [] as Property[])
    return mine.find(item => item.id === id) ?? null
  }, [user, id])

  const purchase = usePurchaseFlow(result => {
    if (result.kind !== 'boost') {
      setRecoveredTier(result.expiryDate ? result.expiryDate.slice(0, 10) : '')
      return
    }

    setDoneBoost(result.remaining ?? 0)
    // Перечитываем объявление: дату подъёма поставил сервер, и показывать её
    // надо его, а не нашу.
    void fetchProperty().then(fresh => {
      if (fresh) setProperty(fresh)
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
    // `prepare` стабилен по ссылке; весь объект покупки в зависимостях означал
    // бы переподключение к магазину на каждую отрисовку.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={BOOST_COLOR} />
      </View>
    )
  }

  const title = property ? property.title?.[language] || property.title?.az || '' : ''
  const premiumActive = property ? isTierActive(property, 'premium') : false
  const vipActive = property ? isTierActive(property, 'vip') : false
  const boostActive = property ? isBoostActive(property) : false
  const onDisplay = property?.status === 'active'

  // Итог покупки. Срока у подъёма нет — говорим про сутки и про остаток пакета.
  if (doneBoost !== null) {
    return (
      <>
        <Stack.Screen options={{title: t.boost.title}} />
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.doneHead}>
            <View style={styles.doneMark}>
              <Ionicons name="arrow-up-circle" size={44} color={colors.white} />
            </View>
            <Text style={styles.doneTitle}>{t.boost.done}</Text>
            <Text style={styles.doneText}>
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
            style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryText}>{t.promote.backToListing}</Text>
          </Pressable>
        </ScrollView>
      </>
    )
  }

  if (!property) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t.errors.errorNotFound}</Text>
      </View>
    )
  }

  // Почему пакетов нет. Строка обязана быть: пустое место под схемой читается
  // как поломка, а это осознанный отказ.
  const refusal = premiumActive || vipActive
    ? t.boost.notForPaid
    : !onDisplay
      ? t.boost.notOnDisplay
      : purchase.boostPlans.length === 0
        ? t.promote.unavailable
        : null

  return (
    <>
      <Stack.Screen options={{title: t.boost.title}} />
      <ScrollView contentContainerStyle={styles.page}>
        {/* Шапка. Большая и зелёная намеренно: экран продаёт одну услугу, и
            объяснить её надо до любых цен. */}
        <View style={styles.hero}>
          <View style={styles.heroMark}>
            <Ionicons name="arrow-up-circle" size={30} color={colors.white} />
          </View>
          <Text style={styles.heroTitle}>{t.boost.title}</Text>
          <Text style={styles.heroSub}>{t.boost.subtitle}</Text>
        </View>

        {/* Что поднимаем. Без этого человек не уверен, что платит за то
            объявление, которое открывал. */}
        <View style={styles.target}>
          <Text style={styles.targetTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.targetHint}>
            {premiumActive
              ? t.pricing.premium
              : vipActive
                ? t.pricing.vip
                : t.promote.currentStandard}
          </Text>
        </View>

        {/* Схема полос — главное объяснение экрана. Подъём НЕ обгоняет VIP и
            Premium, и сказать это рисунком честнее, чем строкой: человек видит,
            что покупает место в своей полосе, и не придёт потом с вопросом,
            почему он не первый на главной. */}
        <View style={styles.bands}>
          <Text style={styles.blockTitle}>{t.boost.bandsTitle}</Text>

          <Band
            icon="diamond"
            color={colors.accent}
            label={t.pricing.premium}
            width="86%"
            dim
          />
          <Band icon="star" color={colors.secondary} label={t.pricing.vip} width="74%" dim />

          <View style={styles.bandDivider} />

          <Band
            icon="arrow-up-circle"
            color={BOOST_COLOR}
            label={t.boost.bandYours}
            width="100%"
            highlight
          />
          <Band icon="ellipse-outline" color={colors.gray400} label={t.boost.bandOther} width="60%" dim />
          <Band icon="ellipse-outline" color={colors.gray400} label="" width="48%" dim />
        </View>

        {/* Как это работает. Три шага, потому что их ровно три: оплата,
            сутки наверху, остальные подъёмы сами. */}
        <View style={styles.how}>
          <Text style={styles.blockTitle}>{t.boost.howTitle}</Text>
          {[t.boost.how1, t.boost.how2, t.boost.how3].map((line, index) => (
            <View key={line} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{line}</Text>
            </View>
          ))}
        </View>

        {/* Состояние: поднято сейчас и сколько осталось. Купивший пакет обязан
            видеть оба числа, иначе второй раз он платит наугад. */}
        {boostActive ? (
          <View style={styles.active}>
            <Ionicons name="arrow-up-circle" size={16} color={BOOST_COLOR} />
            <Text style={styles.activeText}>{t.boost.activeNow}</Text>
          </View>
        ) : null}

        {boostsLeft > 0 ? (
          <View style={styles.active}>
            <Ionicons name="layers-outline" size={16} color={BOOST_COLOR} />
            <Text style={styles.activeText}>
              {t.boost.remaining.replace('{count}', String(boostsLeft))}
            </Text>
          </View>
        ) : null}

        {refusal ? (
          <View style={styles.warning}>
            <Ionicons name="information-circle-outline" size={16} color={colors.gray600} />
            <Text style={styles.warningText}>{refusal}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.blockTitle}>{t.boost.pickTitle}</Text>

            <BoostPicker
              plans={purchase.boostPlans}
              busy={purchase.busy}
              onPick={productId => purchase.start(productId, id ?? '')}
            />

            {/* Про прибавку говорим только когда остаток есть: иначе строка
                обещала бы сохранение того, чего нет. */}
            {boostsLeft > 0 ? <Text style={styles.note}>{t.boost.addNote}</Text> : null}
          </>
        )}

        {/* Ошибку магазина не повторяем, если она уже стоит отказом выше: одна и
            та же фраза дважды читается как две разные беды. */}
        {purchase.error && purchase.error !== refusal ? (
          <View style={styles.error}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
            <Text style={styles.errorText}>{purchase.error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Подхваченная покупка тарифа — не итог этого экрана, поэтому окном, а не
          подменой содержимого: человек пришёл за подъёмом и остаётся здесь. */}
      <StatusDialog
        visible={recoveredTier !== null}
        variant="success"
        title={t.promote.title}
        body={
          recoveredTier
            ? t.promote.success.replace('{date}', recoveredTier)
            : t.promote.pendingFound
        }
        primary={{label: t.buttons.close, onPress: () => setRecoveredTier(null)}}
        onRequestClose={() => setRecoveredTier(null)}
      />
    </>
  )
}

/** Полоса выдачи на схеме: значок, подпись и длина как мера «выше — ниже». */
function Band({
  icon,
  color,
  label,
  width,
  dim,
  highlight
}: {
  icon: keyof typeof Ionicons.glyphMap
  color: string
  label: string
  width: `${number}%`
  dim?: boolean
  highlight?: boolean
}) {
  return (
    <View style={[styles.band, highlight && styles.bandHighlight]}>
      <Ionicons name={icon} size={14} color={color} />
      {label ? (
        <Text
          style={[styles.bandLabel, highlight && styles.bandLabelHighlight]}
          numberOfLines={1}
        >
          {label}
        </Text>
      ) : null}
      <View style={styles.bandBarWrap}>
        <View
          style={[styles.bandBar, {width, backgroundColor: color, opacity: dim ? 0.35 : 1}]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: {padding: spacing.base, gap: spacing.sm, paddingBottom: spacing.xl},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg},
  muted: {fontSize: fontSize.sm, color: colors.gray500, textAlign: 'center'},
  hero: {
    backgroundColor: BOOST_COLOR,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.sm
  },
  heroMark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)'
  },
  heroTitle: {fontSize: fontSize.xl, fontWeight: '700', color: colors.white, textAlign: 'center'},
  heroSub: {
    fontSize: fontSize.xs,
    color: colors.white,
    opacity: 0.92,
    textAlign: 'center',
    lineHeight: 18
  },
  target: {
    backgroundColor: colors.gray50,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.gray200,
    padding: spacing.base,
    gap: 2
  },
  targetTitle: {fontSize: fontSize.base, fontWeight: '600', color: colors.text},
  targetHint: {fontSize: fontSize.xs, color: colors.gray500},
  blockTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray500,
    textTransform: 'uppercase',
    marginTop: spacing.xs
  },
  bands: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: 6,
    ...shadow.sm
  },
  band: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3},
  // Своя полоса выделена фоном и отступом: на схеме она должна находиться
  // глазом сразу, без чтения подписей.
  bandHighlight: {
    backgroundColor: BOOST_SOFT,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    marginHorizontal: -6
  },
  bandLabel: {fontSize: 11, color: colors.gray600, maxWidth: 108},
  bandLabelHighlight: {color: BOOST_COLOR, fontWeight: '700'},
  bandBarWrap: {flex: 1, minWidth: 0},
  bandBar: {height: 8, borderRadius: 4},
  // Черта отделяет платные полосы от обычных — то самое место, выше которого
  // подъём не поднимает.
  bandDivider: {
    height: 1,
    backgroundColor: colors.gray200,
    marginVertical: spacing.xs
  },
  how: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.sm,
    ...shadow.sm
  },
  step: {flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start'},
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BOOST_SOFT,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepNumberText: {fontSize: 11, fontWeight: '700', color: BOOST_COLOR},
  stepText: {flex: 1, fontSize: fontSize.xs, color: colors.gray700, lineHeight: 18},
  active: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: BOOST_SOFT,
    borderRadius: radius.sm,
    padding: spacing.sm
  },
  activeText: {flex: 1, fontSize: 11, color: '#156347', fontWeight: '700', lineHeight: 16},
  warning: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: colors.gray50,
    borderRadius: radius.sm,
    padding: spacing.sm
  },
  warningText: {flex: 1, fontSize: 11, color: colors.gray600, lineHeight: 16},
  error: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(224, 90, 79, 0.08)',
    borderRadius: radius.sm,
    padding: spacing.sm
  },
  errorText: {flex: 1, fontSize: 11, color: colors.error, lineHeight: 16},
  note: {fontSize: 11, color: colors.gray500, lineHeight: 16},
  doneHead: {
    backgroundColor: BOOST_COLOR,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs
  },
  doneMark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)'
  },
  doneTitle: {fontSize: fontSize.lg, fontWeight: '700', color: colors.white, textAlign: 'center'},
  doneText: {
    fontSize: fontSize.sm,
    color: colors.white,
    opacity: 0.92,
    textAlign: 'center',
    lineHeight: 20
  },
  doneProperty: {fontSize: fontSize.sm, color: colors.gray600, textAlign: 'center'},
  primaryButton: {
    backgroundColor: BOOST_COLOR,
    borderRadius: radius.base,
    paddingVertical: spacing.base,
    alignItems: 'center',
    marginTop: spacing.xs
  },
  primaryText: {color: colors.white, fontSize: fontSize.base, fontWeight: '700'},
  pressed: {opacity: 0.75}
})
