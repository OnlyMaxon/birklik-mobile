import {useEffect, useState} from 'react'
import {ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View} from 'react-native'
import {Stack, router, useLocalSearchParams} from 'expo-router'

import type {Property} from '@birklik/core/types'
import {isTierActive, tierExpiresAt} from '@birklik/core/utils/premium-helper'

import {useAuth} from '@/auth/auth-provider'
import {PlanPicker} from '@/components/plan-picker'
import {usePurchaseFlow} from '@/components/use-purchase-flow'
import {useLanguage} from '@/i18n/language-provider'
import {getOwnerProperties} from '@/services/property-service'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

/**
 * Продвижение существующего объявления — повторяет «Тарифы и оплата» на сайте.
 *
 * Достижим только на Android: кнопка, ведущая сюда, на iOS скрыта, пока нет
 * товаров в App Store. Показывать тарифы без возможности купить ни к чему, а
 * уводить на оплату на сайте запрещает правило 3.1.1(a).
 *
 * Весь ход покупки — в `usePurchaseFlow`, общем с подачей объявления. Здесь
 * только то, что своё: какое объявление продвигаем и куда уйти после успеха.
 */
export default function PromoteListingScreen() {
  const {id} = useLocalSearchParams<{id: string}>()
  const {language, t} = useLanguage()
  const {user} = useAuth()

  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)

  const purchase = usePurchaseFlow(expiryDate => {
    Alert.alert('', t.promote.success.replace('{date}', expiryDate.slice(0, 10)), [
      {text: t.buttons.close, onPress: () => router.back()}
    ])
  })

  useEffect(() => {
    if (!user || !id) return

    let alive = true

    const load = async () => {
      // Объявление берём из СВОИХ: `getProperty` возвращает null для снятого с
      // витрины, а продлевают чаще всего именно истёкшее.
      const mine = await getOwnerProperties(user.uid).catch(() => [])
      if (!alive) return
      setProperty(mine.find(item => item.id === id) ?? null)
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

        {/* Что продлевается. Без названия человек не уверен, что платит за то,
            что выбрал, — а сумму он увидит уже в окне Google. */}
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

        <PlanPicker
          plans={purchase.plans}
          busy={purchase.busy}
          error={purchase.error}
          onPick={productId => purchase.start(productId, id ?? '')}
        />
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
  targetHint: {fontSize: fontSize.xs, color: colors.gray500}
})
