import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

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
 * ⚠️ Цена берётся ИЗ МАГАЗИНА и не считается здесь. Google задаёт её ценовыми
 * уровнями в валюте покупателя, и 20/30/55 AZN с сайта совпадут не обязательно.
 * Своя цифра на экране рядом с чужой суммой в окне оплаты — худшее, что можно
 * показать человеку перед списанием.
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
            <Text style={styles.price}>{plan.price}</Text>
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
  price: {fontSize: fontSize.base, fontWeight: '700', color: colors.primary},
  features: {fontSize: fontSize.xs, color: colors.gray500, lineHeight: 18},
  buy: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: spacing.xs},
  buyText: {fontSize: fontSize.sm, fontWeight: '600', color: colors.primary},
  busy: {marginTop: spacing.sm}
})
