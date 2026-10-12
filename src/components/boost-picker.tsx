import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {BOOST_PRICES, formatAzn} from '@birklik/core/data'

import {useLanguage} from '@/i18n/language-provider'
import type {BoostPlan} from '@/services/billing-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  plans: BoostPlan[]
  busy: boolean
  onPick: (productId: string) => void
  /** Остаток незаконченного пакета. Больше нуля — показываем про прибавку. */
  remaining?: number
}

/**
 * Зелёный намеренно не из гаммы тарифов (синий VIP, оранжевый Premium): подъём
 * не ступень выше Premium, а отдельная услуга. Похожесть на тарифы читалась бы
 * как «ещё дороже Premium».
 */
const BOOST_COLOR = '#1b7f5a'

/**
 * Пакеты подъёма.
 *
 * Отдельный блок, а не ещё одна ступень в `PlanPicker`: у подъёма нет ни срока,
 * ни перечня возможностей, зато есть количество. Впихни его туда — и в `Plan`
 * появились бы необязательные поля, которые каждый читающий обязан не
 * перепутать с тарифными.
 *
 * Цена, как и у тарифов, показывается ДВУМЯ строками, и это не украшательство:
 * сверху манаты из общего пакета — та же сумма, что на сайте, — снизу мелко то,
 * что **реально спишет Google**, строкой из магазина. Вторая строка
 * обязательна: у покупателя вне Азербайджана валюта своя, и скрывать настоящую
 * сумму перед списанием нечестно, а Google за это снимает приложение.
 *
 * Пустой список означает, что товары подъёма ещё не заведены в Play Console или
 * сборка не из магазина. Тогда блока нет вовсе — показывать цены без
 * возможности купить ни к чему.
 */
export function BoostPicker({plans, busy, onPick, remaining = 0}: Props) {
  const {t} = useLanguage()

  if (plans.length === 0) return null

  return (
    <View style={[styles.block, {borderColor: BOOST_COLOR}]}>
      <View style={[styles.head, {backgroundColor: BOOST_COLOR}]}>
        <Ionicons name="arrow-up-circle" size={22} color={colors.white} />
        <View style={styles.headText}>
          <Text style={styles.headTitle}>{t.boost.title}</Text>
          <Text style={styles.headSub}>{t.boost.subtitle}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {remaining > 0 ? (
          <Text style={styles.remaining}>
            {t.boost.remaining.replace('{count}', String(remaining))}
          </Text>
        ) : null}

        <View style={styles.packages}>
          {plans.map(plan => (
            <Pressable
              key={plan.id}
              style={({pressed}) => [styles.package, pressed && styles.packagePressed]}
              disabled={busy}
              onPress={() => onPick(plan.id)}
            >
              <Text style={styles.packageCount}>
                {plan.count === 1
                  ? t.boost.packageOne
                  : t.boost.packageMany.replace('{count}', String(plan.count))}
              </Text>

              <Text style={[styles.packagePrice, {color: BOOST_COLOR}]}>
                {formatAzn(BOOST_PRICES[plan.count])}
              </Text>

              <Text style={styles.packageStore}>
                {t.pricing.storeCharge}: {plan.price}
              </Text>

              <Text style={styles.packageHint}>
                {plan.count === 1
                  ? t.boost.oneDay
                  : t.boost.perDay.replace('{count}', String(plan.count))}
              </Text>

              <View style={styles.action}>
                <Ionicons name="card-outline" size={14} color={BOOST_COLOR} />
                <Text style={[styles.actionText, {color: BOOST_COLOR}]}>
                  {busy ? t.promote.checking : t.promote.buy}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Про прибавку говорим только когда остаток есть: иначе строка обещала
            бы сохранение того, чего нет. */}
        {remaining > 0 ? <Text style={styles.note}>{t.boost.addNote}</Text> : null}
      </View>

      {busy ? <ActivityIndicator color={BOOST_COLOR} style={styles.busy} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
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
  headSub: {fontSize: fontSize.xs, color: colors.white, opacity: 0.9, lineHeight: 16},
  body: {padding: spacing.base, gap: 6},
  remaining: {fontSize: fontSize.xs, fontWeight: '700', color: BOOST_COLOR},
  // Пакетов четыре: в один ряд они сжались бы до нечитаемых столбиков, поэтому
  // перенос по два.
  packages: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs},
  package: {
    // Два в ряд: половина ширины минус половина промежутка.
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2
  },
  packagePressed: {opacity: 0.75},
  packageCount: {fontSize: fontSize.sm, fontWeight: '700', color: colors.text},
  packagePrice: {fontSize: fontSize.lg, fontWeight: '700'},
  // Сумма магазина намеренно мелкая и приглушённая: она уточнение к цене, а не
  // вторая цена. Но она здесь всегда — это то, что спишут.
  packageStore: {fontSize: 10, color: colors.gray500},
  packageHint: {fontSize: 10, color: colors.gray600, lineHeight: 14},
  action: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4},
  actionText: {fontSize: fontSize.xs, fontWeight: '700'},
  note: {fontSize: 11, color: colors.gray500, lineHeight: 16, marginTop: spacing.xs},
  busy: {marginBottom: spacing.sm}
})
