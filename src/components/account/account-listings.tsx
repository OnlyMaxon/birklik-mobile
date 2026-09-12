import {Platform, Pressable, StyleSheet, Text, View} from 'react-native'
import {Link, router} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import type {Property} from '@birklik/core/types'
import {isOnDisplay} from '@birklik/core/utils/display'
import {isTierActive, tierExpiresAt, tierRemainingDays} from '@birklik/core/utils/premium-helper'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  listings: Property[]
}

/**
 * Свои объявления — ВСЕ, включая снятые с витрины: истёкшие, ожидающие
 * модерации и черновики. Ровно за этим владелец в кабинет и приходит: понять,
 * куда делось объявление, и продлить.
 */
export function AccountListings({listings}: Props) {
  const {t} = useLanguage()

  if (listings.length === 0) {
    return <Text style={styles.empty}>{t.dashboard.noListings}</Text>
  }

  return (
    <View style={styles.list}>
      {listings.map(property => (
        <OwnerListing key={property.id} property={property} />
      ))}
    </View>
  )
}

function OwnerListing({property}: {property: Property}) {
  const {language, t} = useLanguage()

  const onDisplay = isOnDisplay(property)
  const premium = isTierActive(property, 'premium')
  const vip = !premium && isTierActive(property, 'vip')
  const days = tierRemainingDays(property)
  const expires = tierExpiresAt(property)

  // Подпись состояния читается из статуса, но «активно» ставится только если
  // объявление ДЕЙСТВИТЕЛЬНО на витрине: между окончанием тарифа и ночной
  // функцией статус ещё `active`, а показывать его уже перестали.
  const label = !onDisplay
    ? property.status === 'pending'
      ? t.dashboard.pending
      : t.dashboard.inactiveListing
    : t.dashboard.activeListing

  return (
    <Link href={`/property/${property.id}`} asChild>
      <Pressable style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {property.title?.[language] || property.title?.az || ''}
          </Text>
          {(premium || vip) && (
            <View style={[styles.tier, premium ? styles.tierPremium : styles.tierVip]}>
              <Text style={styles.tierText}>{premium ? 'PREMIUM' : 'VIP'}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardRow}>
          <View style={[styles.status, onDisplay ? styles.statusOn : styles.statusOff]}>
            <Text style={[styles.statusText, onDisplay ? styles.statusTextOn : styles.statusTextOff]}>
              {label}
            </Text>
          </View>
          {typeof property.price?.daily === 'number' ? (
            <Text style={styles.price}>{property.price.daily} ₼</Text>
          ) : null}
        </View>

        {/* Срок показываем только у платных: у обычного тарифа его нет,
            и пустая строка «истекает —» вводила бы в заблуждение. */}
        {expires ? (
          <Text style={styles.expiry}>
            {t.dashboard.planExpires} {expires.slice(0, 10)}
            {days > 0 ? ` · ${days} ${t.common.days}` : ''}
          </Text>
        ) : null}

        {/* Правка отдельной кнопкой, а не по нажатию на карточку: карточка
            ведёт на само объявление, и путать эти два перехода нельзя. */}
        <View style={styles.actions}>
          <Pressable
            style={styles.action}
            onPress={() => router.push({pathname: '/account/edit/[id]', params: {id: property.id}})}
            hitSlop={6}
          >
            <Ionicons name="create-outline" size={15} color={colors.primary} />
            <Text style={styles.actionText}>{t.dashboard.edit}</Text>
          </Pressable>

          {/* Продвижение — ТОЛЬКО на Android. В App Store товаров ещё нет, а
              показывать тарифы без возможности купить нельзя: уводить на оплату
              на сайте запрещает правило 3.1.1(a), и получился бы тупик. */}
          {Platform.OS === 'android' ? (
            <Pressable
              style={styles.action}
              onPress={() =>
                router.push({pathname: '/account/promote/[id]', params: {id: property.id}})
              }
              hitSlop={6}
            >
              <Ionicons name="trending-up-outline" size={15} color={colors.primary} />
              <Text style={styles.actionText}>{t.promote.title}</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  list: {gap: spacing.sm},
  empty: {fontSize: fontSize.sm, color: colors.neutral, paddingVertical: spacing.lg},
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.xs,
    ...shadow.sm
  },
  cardPressed: {opacity: 0.75},
  cardHead: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  cardTitle: {flex: 1, fontSize: fontSize.base, fontWeight: '600', color: colors.text},
  tier: {paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm},
  tierPremium: {backgroundColor: colors.accent},
  tierVip: {backgroundColor: colors.secondary},
  tierText: {color: colors.white, fontSize: 10, fontWeight: '700'},
  cardRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  status: {paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm},
  statusOn: {backgroundColor: '#e8f5ee'},
  statusOff: {backgroundColor: colors.gray100},
  statusText: {fontSize: fontSize.xs, fontWeight: '600'},
  statusTextOn: {color: colors.primary},
  statusTextOff: {color: colors.gray500},
  price: {fontSize: fontSize.base, fontWeight: '700', color: colors.primary},
  expiry: {fontSize: fontSize.xs, color: colors.gray500},
  actions: {flexDirection: 'row', gap: spacing.base, paddingTop: spacing.xs},
  action: {flexDirection: 'row', alignItems: 'center', gap: 4},
  actionText: {fontSize: fontSize.sm, color: colors.primary, fontWeight: '600'}
})
