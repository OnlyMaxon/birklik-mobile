import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {BOOST_PRICES, formatAzn, type BoostPackage} from '@birklik/core/data'

import {useLanguage} from '@/i18n/language-provider'
import {STORE_NAME, type BoostPlan} from '@/services/billing-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  plans: BoostPlan[]
  busy: boolean
  onPick: (productId: string) => void
}

/**
 * Зелёный намеренно не из гаммы тарифов (синий VIP, оранжевый Premium): подъём
 * не ступень выше Premium, а отдельная услуга. Похожесть на тарифы читалась бы
 * как «ещё дороже Premium».
 */
const BOOST_COLOR = '#1b7f5a'

/** Цена одного подъёма в пакете. Копейки округляем — 5 ₼ за три это 1.67. */
function perBoost(count: BoostPackage): string {
  return formatAzn(Math.round((BOOST_PRICES[count] / count) * 100) / 100)
}

/**
 * Пакеты подъёма.
 *
 * Отдельный блок, а не ещё одна ступень в `PlanPicker`: у подъёма нет ни срока,
 * ни перечня возможностей, зато есть количество. Впихни его туда — и в `Plan`
 * появились бы необязательные поля, которые каждый читающий обязан не
 * перепутать с тарифными.
 *
 * ⚠️ Своей шапки у блока нет намеренно: с 2026-10-14 он живёт на отдельном
 * экране подъёма (`app/account/boost/[id].tsx`), и шапка там своя, большая.
 * Раньше блок стоял внизу экрана продвижения среди тарифов и шапку носил сам.
 *
 * Цена, как и у тарифов, показывается ДВУМЯ строками, и это не украшательство:
 * сверху манаты из общего пакета — та же сумма, что на сайте, — снизу мелко то,
 * что **реально спишет магазин**, строкой из самого магазина. Вторая строка
 * обязательна: скрывать настоящую сумму перед списанием нечестно, и оба
 * магазина за это снимают приложение.
 *
 * ⚠️ **На iOS расхождение не редкость, а правило.** Маната у Apple нет вовсе:
 * Азербайджан отнесён к «Rest of World», и витрина там торгует в долларах. То
 * есть сверху всегда будет «15 ₼», а снизу «App Store спишет: $8.99».
 *
 * ⚠️ Название магазина берётся из `STORE_NAME`, а не из словаря: до
 * 2026-10-27 оно было вписано в переводы, и на айфоне читалось «Google Play
 * спишет».
 *
 * Пустой список означает, что товары подъёма ещё не заведены в консоли магазина
 * или сборка не из магазина. Тогда блока нет вовсе — показывать цены без
 * возможности купить ни к чему.
 */
export function BoostPicker({plans, busy, onPick}: Props) {
  const {t} = useLanguage()

  if (plans.length === 0) return null

  // Самый выгодный пакет ВЫЧИСЛЯЕМ, а не помечаем руками: поменяются цены —
  // метка переедет сама. Прибитая к «10 раз» однажды соврала бы.
  const cheapestPerBoost = Math.min(
    ...plans.map(plan => BOOST_PRICES[plan.count] / plan.count)
  )

  return (
    <View style={styles.packages}>
      {plans.map(plan => {
        const best =
          plans.length > 1 && BOOST_PRICES[plan.count] / plan.count === cheapestPerBoost

        return (
          <Pressable
            key={plan.id}
            style={({pressed}) => [
              styles.package,
              best && styles.packageBest,
              pressed && styles.packagePressed,
              busy && styles.packageBusy
            ]}
            disabled={busy}
            onPress={() => onPick(plan.id)}
          >
            {best ? (
              <View style={styles.bestBadge}>
                <Text style={styles.bestText}>{t.boost.best}</Text>
              </View>
            ) : null}

            <Text style={styles.packageCount}>
              {plan.count === 1
                ? t.boost.packageOne
                : t.boost.packageMany.replace('{count}', String(plan.count))}
            </Text>

            <Text style={styles.packagePrice}>{formatAzn(BOOST_PRICES[plan.count])}</Text>

            {/* Цена за один подъём: без неё разница между пакетами
                считается в голове, и большой пакет выглядит просто дороже. */}
            <Text style={styles.packagePer}>
              {t.boost.perBoost.replace('{price}', perBoost(plan.count))}
            </Text>

            <Text style={styles.packageStore}>
              {t.pricing.storeCharge.replace('{store}', STORE_NAME)}: {plan.price}
            </Text>

            <View style={styles.action}>
              {busy ? (
                <ActivityIndicator size="small" color={BOOST_COLOR} />
              ) : (
                <Ionicons name="card-outline" size={14} color={BOOST_COLOR} />
              )}
              <Text style={styles.actionText}>{busy ? t.promote.checking : t.promote.buy}</Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  // Пакетов четыре: в один ряд они сжались бы до нечитаемых столбиков, поэтому
  // перенос по два.
  packages: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  package: {
    // Два в ряд: половина ширины минус половина промежутка.
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: 2,
    ...shadow.sm
  },
  packageBest: {borderColor: BOOST_COLOR, borderWidth: 2},
  packagePressed: {opacity: 0.75},
  // Во время оплаты карточки гаснут: нажатие уже не сработает, и вид обязан это
  // показывать, иначе человек жмёт второй пакет и думает, что приложение висит.
  packageBusy: {opacity: 0.6},
  bestBadge: {
    alignSelf: 'flex-start',
    backgroundColor: BOOST_COLOR,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginBottom: 2
  },
  bestText: {color: colors.white, fontSize: 9, fontWeight: '700', textTransform: 'uppercase'},
  packageCount: {fontSize: fontSize.sm, fontWeight: '700', color: colors.text},
  packagePrice: {fontSize: fontSize.xl, fontWeight: '700', color: BOOST_COLOR},
  packagePer: {fontSize: 11, color: colors.gray600},
  // Сумма магазина намеренно мелкая и приглушённая: она уточнение к цене, а не
  // вторая цена. Но она здесь всегда — это то, что спишут.
  packageStore: {fontSize: 10, color: colors.gray500},
  action: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6},
  actionText: {fontSize: fontSize.xs, fontWeight: '700', color: BOOST_COLOR}
})
