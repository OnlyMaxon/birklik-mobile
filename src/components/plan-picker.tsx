import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {formatAzn, tierPriceByDays} from '@birklik/core/data'

import {useLanguage} from '@/i18n/language-provider'
import type {Plan} from '@/services/billing-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  plans: Plan[]
  busy: boolean
  error: string
  onPick: (productId: string) => void
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

/**
 * Карточки платных тарифов. Один вид на продвижение существующего объявления и
 * на выбор тарифа при подаче нового — иначе два списка разойдутся в оформлении.
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
 *
 * ⚠️ Раньше здесь стояло «своей цены не считаем», и это было верно: своей цены
 * в приложении не существовало. Теперь она берётся из `TIER_PRICES` в общем
 * пакете — расходиться с сайтом ей нечем. Набивать число здесь по-прежнему
 * нельзя.
 *
 * Названия тарифов и перечни возможностей берутся из `pricing` в общем пакете:
 * те же слова, что на сайте.
 */
export function PlanPicker({plans, busy, error, onPick, selectedId}: Props) {
  const selecting = selectedId !== undefined
  const {t} = useLanguage()

  return (
    <View style={styles.list}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {plans.map(plan => (
        <Pressable
          key={plan.id}
          style={({pressed}) => [
            styles.plan,
            pressed && styles.planPressed,
            selecting && selectedId === plan.id && styles.planSelected
          ]}
          disabled={busy}
          onPress={() => onPick(plan.id)}
        >
          <View style={styles.head}>
            <View
              style={[styles.badge, plan.tier === 'premium' ? styles.badgePremium : styles.badgeVip]}
            >
              <Text style={styles.badgeText}>
                {plan.tier === 'premium' ? t.pricing.premium : t.pricing.vip}
              </Text>
            </View>
            <Text style={styles.days}>
              {plan.days === 14 ? t.pricing.days14 : t.pricing.days30}
            </Text>
            <View style={styles.prices}>
              {(() => {
                const azn = tierPriceByDays(plan.tier, plan.days)
                // Цены нет в справочнике — значит завели тариф, о котором пакет
                // не знает. Показываем одну строку магазина: она всегда верна.
                return azn === undefined ? null : (
                  <Text style={styles.price}>{formatAzn(azn)}</Text>
                )
              })()}
              <Text style={styles.storePrice}>
                {t.pricing.storeCharge}: {plan.price}
              </Text>
            </View>
          </View>

          <Text style={styles.features}>
            {plan.tier === 'premium' ? t.pricing.premiumFeatures : t.pricing.vipFeatures}
          </Text>

          {/* В режиме отметки надписи «Купить» нет: платят не здесь, и обещать
              оплату по нажатию на карточку было бы обманом. */}
          {selecting ? (
            selectedId === plan.id ? (
              <View style={styles.buy}>
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                <Text style={styles.buyText}>{t.promote.subtitle}</Text>
              </View>
            ) : null
          ) : (
            <View style={styles.buy}>
              <Ionicons name="card-outline" size={16} color={colors.primary} />
              <Text style={styles.buyText}>{busy ? t.promote.checking : t.promote.buy}</Text>
            </View>
          )}
        </Pressable>
      ))}

      {busy ? <ActivityIndicator color={colors.primary} style={styles.busy} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  list: {gap: spacing.sm},
  error: {fontSize: fontSize.sm, color: colors.error, lineHeight: 20},
  plan: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.sm,
    ...shadow.sm
  },
  planPressed: {opacity: 0.75},
  planSelected: {borderWidth: 2, borderColor: colors.primary},
  head: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  badge: {paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm},
  badgePremium: {backgroundColor: colors.accent},
  badgeVip: {backgroundColor: colors.secondary},
  badgeText: {color: colors.white, fontSize: 10, fontWeight: '700'},
  days: {flex: 1, fontSize: fontSize.sm, color: colors.gray700},
  prices: {alignItems: 'flex-end'},
  // Сумма магазина намеренно мелкая и приглушённая: она уточнение к цене
  // тарифа, а не вторая цена. Но она здесь всегда — это то, что спишут.
  storePrice: {fontSize: 10, color: colors.gray500, marginTop: 1},
  price: {fontSize: fontSize.base, fontWeight: '700', color: colors.primary},
  features: {fontSize: fontSize.xs, color: colors.gray500, lineHeight: 18},
  buy: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: spacing.xs},
  buyText: {fontSize: fontSize.sm, fontWeight: '600', color: colors.primary},
  busy: {marginTop: spacing.sm}
})
