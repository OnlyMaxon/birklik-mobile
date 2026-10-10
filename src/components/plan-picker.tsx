import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {formatAzn, tierPriceByDays} from '@birklik/core/data'

import {useLanguage} from '@/i18n/language-provider'
import type {Plan} from '@/services/billing-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type PaidTier = 'vip' | 'premium'

type Props = {
  plans: Plan[]
  busy: boolean
  error: string
  onPick: (productId: string) => void
  /**
   * Какие ступени показывать. Не задано — обе.
   *
   * ⚠️ Нужно Premium-объявлению: ему VIP предлагать НЕЛЬЗЯ. Оплата VIP стирает
   * дату Premium — см. `applyPaidTier` на сервере, — и оплаченные дни сгорят.
   */
  tiers?: PaidTier[]
  /** Подпись в шапке ступени: «Повысить до VIP» или «Продлить VIP». */
  labels?: Partial<Record<PaidTier, string>>
  /** Строка под сроками: что именно случится с днями после оплаты. */
  notes?: Partial<Record<PaidTier, string>>
  /**
   * Режим отметки вместо немедленной покупки.
   *
   * Не задан — нажатие сразу открывает оплату: так работает продвижение готового
   * объявления. Задан (пусть и `null`) — нажатие только выбирает тариф, а платят
   * потом, вместе с отправкой формы: так работает подача, где объявления ещё
   * нет и привязывать покупку не к чему.
   */
  selectedId?: string | null
}

/** Цвет ступени: VIP синий, Premium оранжевый — как значки на карточках. */
const TIER_COLOR: Record<PaidTier, string> = {
  vip: colors.secondary,
  premium: colors.accent
}

/**
 * Тарифы — блоком на ступень, а не карточкой на каждый срок.
 *
 * ⚠️ Было четыре одинаковые карточки подряд: «VIP 14 дней», «VIP 30 дней»,
 * «Premium 14», «Premium 30», и под каждой одна строка про возможности. Чем
 * ступени отличаются, по такому списку понять нельзя — человек платил, не зная,
 * что покупает. Теперь ступень одна, под ней её возможности целиком, а сроки —
 * двумя кнопками внутри. Так же устроена сетка тарифов на сайте.
 *
 * Перечни возможностей берутся из `pricing.features` в общем пакете — те же
 * слова, что показывает сайт. Своих тут быть не должно: обещание, которого нет
 * на сайте, никто не собирался выполнять.
 *
 * Цена показывается ДВУМЯ строками, и это не украшательство.
 *
 * Сверху крупно — цена тарифа в манатах из общего пакета: ровно та, что на
 * сайте. Площадка азербайджанская, и человек обязан видеть сумму в своей
 * валюте. Манат в Play Console задать не вышло, поэтому магазин пересчитывает
 * сам: 55 ₼ по официальному курсу 1.7 — это ровно те 32.35 $, которые он и
 * показывает. Величина та же, отличается только валюта показа.
 *
 * Снизу мелко — то, что **реально спишет Google**, строкой из магазина как
 * есть. Эта строка обязательна и убирать её нельзя: у покупателя вне
 * Азербайджана валюта будет своя, и скрывать настоящую сумму перед списанием
 * нечестно, а Google за это ещё и снимает приложение.
 */
export function PlanPicker({
  plans,
  busy,
  error,
  onPick,
  tiers = ['vip', 'premium'],
  labels,
  notes,
  selectedId
}: Props) {
  const selecting = selectedId !== undefined
  const {t} = useLanguage()

  return (
    <View style={styles.list}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {tiers.map(tier => {
        // Сроки одной ступени, короткий первым: магазин отдаёт их в своём
        // порядке, а он не обязан совпадать с ожидаемым.
        const options = plans.filter(plan => plan.tier === tier).sort((a, b) => a.days - b.days)
        if (options.length === 0) return null

        const accent = TIER_COLOR[tier]
        const features: string[] = t.pricing.features[tier]

        return (
          <View key={tier} style={[styles.block, {borderColor: accent}]}>
            <View style={[styles.head, {backgroundColor: accent}]}>
              <Ionicons name="arrow-up-circle" size={22} color={colors.white} />
              <View style={styles.headText}>
                <Text style={styles.headTitle}>
                  {labels?.[tier] ??
                    (tier === 'premium' ? t.promote.upgradePremium : t.promote.upgradeVip)}
                </Text>
                <Text style={styles.headSub}>
                  {tier === 'premium' ? t.pricing.premiumDesc : t.pricing.vipDesc}
                </Text>
              </View>
            </View>

            <View style={styles.body}>
              <Text style={styles.benefitsTitle}>{t.promote.planBenefits}</Text>
              {features.map(line => (
                <View key={line} style={styles.benefit}>
                  <Ionicons name="checkmark-circle" size={15} color={accent} />
                  <Text style={styles.benefitText}>{line}</Text>
                </View>
              ))}

              <View style={styles.durations}>
                {options.map(plan => {
                  const azn = tierPriceByDays(plan.tier, plan.days)
                  const chosen = selecting && selectedId === plan.id

                  return (
                    <Pressable
                      key={plan.id}
                      style={({pressed}) => [
                        styles.duration,
                        pressed && styles.durationPressed,
                        chosen && {borderColor: accent, borderWidth: 2}
                      ]}
                      disabled={busy}
                      onPress={() => onPick(plan.id)}
                    >
                      <Text style={styles.durationDays}>
                        {plan.days === 14 ? t.pricing.days14 : t.pricing.days30}
                      </Text>

                      {/* Цены нет в справочнике — значит в магазине завели
                          тариф, о котором пакет не знает. Показываем одну
                          строку магазина: она всегда верна. */}
                      {azn === undefined ? null : (
                        <Text style={[styles.durationPrice, {color: accent}]}>{formatAzn(azn)}</Text>
                      )}

                      <Text style={styles.durationStore}>
                        {t.pricing.storeCharge}: {plan.price}
                      </Text>

                      {/* В режиме отметки надписи «Купить» нет: платят не
                          здесь, и обещать оплату по нажатию было бы обманом. */}
                      {selecting ? (
                        chosen ? (
                          <View style={styles.action}>
                            <Ionicons name="checkmark-circle" size={14} color={accent} />
                            <Text style={[styles.actionText, {color: accent}]}>
                              {t.promote.selected}
                            </Text>
                          </View>
                        ) : null
                      ) : (
                        <View style={styles.action}>
                          <Ionicons name="card-outline" size={14} color={accent} />
                          <Text style={[styles.actionText, {color: accent}]}>
                            {busy ? t.promote.checking : t.promote.buy}
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  )
                })}
              </View>

              {notes?.[tier] ? <Text style={styles.note}>{notes[tier]}</Text> : null}
            </View>
          </View>
        )
      })}

      {busy ? <ActivityIndicator color={colors.primary} style={styles.busy} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {gap: spacing.base},
  error: {fontSize: fontSize.sm, color: colors.error, lineHeight: 20},
  block: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.sm
  },
  head: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.base},
  headText: {flex: 1},
  headTitle: {fontSize: fontSize.base, fontWeight: '700', color: colors.white},
  headSub: {fontSize: fontSize.xs, color: colors.white, opacity: 0.9},
  body: {padding: spacing.base, gap: 6},
  benefitsTitle: {fontSize: fontSize.xs, fontWeight: '700', color: colors.gray600},
  benefit: {flexDirection: 'row', alignItems: 'flex-start', gap: 6},
  benefitText: {flex: 1, fontSize: fontSize.xs, color: colors.gray700, lineHeight: 18},
  durations: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm},
  duration: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2
  },
  durationPressed: {opacity: 0.75},
  durationDays: {fontSize: fontSize.xs, color: colors.gray600},
  durationPrice: {fontSize: fontSize.lg, fontWeight: '700'},
  // Сумма магазина намеренно мелкая и приглушённая: она уточнение к цене
  // тарифа, а не вторая цена. Но она здесь всегда — это то, что спишут.
  durationStore: {fontSize: 10, color: colors.gray500},
  action: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4},
  actionText: {fontSize: fontSize.xs, fontWeight: '700'},
  note: {fontSize: 11, color: colors.gray500, lineHeight: 16, marginTop: spacing.xs},
  busy: {marginTop: spacing.sm}
})
