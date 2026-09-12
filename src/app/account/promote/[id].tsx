import {useCallback, useEffect, useRef, useState} from 'react'
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native'
import {Stack, router, useLocalSearchParams} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'
import {ErrorCode, purchaseErrorListener, purchaseUpdatedListener, type Purchase} from 'expo-iap'

import type {Property} from '@birklik/core/types'
import {isTierActive, tierExpiresAt} from '@birklik/core/utils/premium-helper'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {
  connectStore,
  loadPlans,
  pendingPurchases,
  startPurchase,
  verifyAndFinish,
  type Plan
} from '@/services/billing-service'
import {getOwnerProperties} from '@/services/property-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

/**
 * Покупка тарифа для своего объявления.
 *
 * Экран существует только на Android: кнопка, ведущая сюда, скрыта на iOS, пока
 * нет товаров в App Store. Показывать тарифы без возможности купить было бы
 * издевательством, а уводить на оплату на сайте запрещает правило 3.1.1(a).
 *
 * ⚠️ Цены берутся из магазина, а не из кода. Google задаёт их ценовыми уровнями
 * в валюте покупателя, и 20/30/55 AZN с сайта здесь совпадут не обязательно.
 * Своя цифра на экране рядом с чужой суммой в окне оплаты — худшее, что можно
 * показать человеку перед списанием.
 */
export default function PromoteListingScreen() {
  const {id} = useLocalSearchParams<{id: string}>()
  const {language, t} = useLanguage()
  const {user} = useAuth()

  const [property, setProperty] = useState<Property | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Идентификатор объявления нужен слушателю покупки, а тот живёт дольше одной
  // отрисовки. Через состояние он пришёл бы устаревшим — отсюда ссылка.
  const propertyIdRef = useRef<string>('')
  propertyIdRef.current = id ?? ''

  const applyPurchase = useCallback(
    async (purchase: Purchase) => {
      setBusy(true)
      setError('')
      try {
        const result = await verifyAndFinish(purchase, propertyIdRef.current)
        Alert.alert(
          '',
          t.promote.success.replace('{date}', result.expiryDate.slice(0, 10)),
          [{text: 'OK', onPress: () => router.back()}]
        )
      } catch {
        setError(t.promote.failed)
      } finally {
        setBusy(false)
      }
    },
    [t]
  )

  // Слушатели поднимаются ОДИН раз и до любой покупки: `requestPurchase` ничего
  // не возвращает, результат приходит только сюда. Поставь подписку позже — и
  // успешная оплата улетит в пустоту.
  useEffect(() => {
    const bought = purchaseUpdatedListener(purchase => {
      void applyPurchase(purchase)
    })

    const failed = purchaseErrorListener(err => {
      // Отмену человеком молчим: он сам закрыл окно, сообщать ему об этом
      // незачем. Остальное показываем.
      if (err.code === ErrorCode.UserCancelled) {
        setBusy(false)
        return
      }
      setBusy(false)
      setError(t.promote.failed)
    })

    return () => {
      bought.remove()
      failed.remove()
    }
  }, [applyPurchase, t])

  useEffect(() => {
    if (!user || !id) return

    let alive = true

    const prepare = async () => {
      // Объявление берём из СВОИХ: `getProperty` возвращает null для снятого с
      // витрины, а продлевают чаще всего именно истёкшее.
      const mine = await getOwnerProperties(user.uid).catch(() => [])
      if (!alive) return
      setProperty(mine.find(item => item.id === id) ?? null)

      try {
        await connectStore()
        const available = await loadPlans()
        if (!alive) return
        setPlans(available)
        if (available.length === 0) setError(t.promote.unavailable)

        // Незавершённая покупка: приложение могли закрыть между оплатой и
        // проверкой. Деньги списаны, тариф не поставлен — доводим до конца сами,
        // иначе человек заплатил впустую и пришёл бы жаловаться.
        const pending = await pendingPurchases()
        if (!alive || pending.length === 0) return
        setError(t.promote.pendingFound)
        for (const purchase of pending) {
          await applyPurchase(purchase)
        }
      } catch {
        if (alive) setError(t.promote.unavailable)
      }
    }

    void prepare().finally(() => {
      if (alive) setLoading(false)
    })

    return () => {
      alive = false
    }
    // applyPurchase намеренно не в зависимостях: он меняется вместе со словарём,
    // а переподготовка магазина при смене языка привела бы к повторному разбору
    // незавершённых покупок.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const activeTier = property
    ? isTierActive(property, 'premium')
      ? 'premium'
      : isTierActive(property, 'vip')
        ? 'vip'
        : null
    : null
  const expires = property ? tierExpiresAt(property) : null

  return (
    <>
      <Stack.Screen options={{title: t.promote.title}} />
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.subtitle}>{t.promote.subtitle}</Text>

        {/* Что продлевается. Без названия объявления человек на экране оплаты не
            уверен, что платит за то, что выбрал. */}
        {property ? (
          <View style={styles.target}>
            <Text style={styles.targetTitle} numberOfLines={2}>
              {property.title?.[language] || property.title?.az || ''}
            </Text>
            {activeTier && expires ? (
              <Text style={styles.targetHint}>
                {t.promote.activeUntil.replace('{date}', expires.slice(0, 10))}
              </Text>
            ) : null}
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {plans.map(plan => (
          <Pressable
            key={plan.id}
            style={({pressed}) => [styles.plan, pressed && styles.planPressed]}
            disabled={busy}
            onPress={() => {
              setBusy(true)
              setError('')
              startPurchase(plan.id, id ?? '').catch(() => {
                setBusy(false)
                setError(t.promote.unavailable)
              })
            }}
          >
            <View style={styles.planHead}>
              <View
                style={[
                  styles.badge,
                  plan.tier === 'premium' ? styles.badgePremium : styles.badgeVip
                ]}
              >
                <Text style={styles.badgeText}>
                  {plan.tier === 'premium' ? t.pricing.premium : t.pricing.vip}
                </Text>
              </View>
              <Text style={styles.planDays}>
                {plan.days === 14 ? t.pricing.days14 : t.pricing.days30}
              </Text>
              <Text style={styles.planPrice}>{plan.price}</Text>
            </View>

            <Text style={styles.planFeatures}>
              {plan.tier === 'premium' ? t.pricing.premiumFeatures : t.pricing.vipFeatures}
            </Text>

            <View style={styles.buy}>
              <Ionicons name="card-outline" size={16} color={colors.primary} />
              <Text style={styles.buyText}>{busy ? t.promote.checking : t.promote.buy}</Text>
            </View>
          </Pressable>
        ))}

        {busy ? <ActivityIndicator color={colors.primary} style={styles.busy} /> : null}
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
    gap: 2,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  targetTitle: {fontSize: fontSize.base, fontWeight: '600', color: colors.text},
  targetHint: {fontSize: fontSize.xs, color: colors.gray500},
  error: {fontSize: fontSize.sm, color: colors.error, lineHeight: 20},
  plan: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.sm,
    ...shadow.sm
  },
  planPressed: {opacity: 0.75},
  planHead: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  badge: {paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm},
  badgePremium: {backgroundColor: colors.accent},
  badgeVip: {backgroundColor: colors.secondary},
  badgeText: {color: colors.white, fontSize: 10, fontWeight: '700'},
  planDays: {flex: 1, fontSize: fontSize.sm, color: colors.gray700},
  planPrice: {fontSize: fontSize.base, fontWeight: '700', color: colors.primary},
  planFeatures: {fontSize: fontSize.xs, color: colors.gray500, lineHeight: 18},
  buy: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: spacing.xs},
  buyText: {fontSize: fontSize.sm, fontWeight: '600', color: colors.primary},
  busy: {marginTop: spacing.sm}
})
