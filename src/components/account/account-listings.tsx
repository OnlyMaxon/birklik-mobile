import {Linking, Platform, Pressable, StyleSheet, Text, View} from 'react-native'
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

      {/* Где продвигать объявление.
          ⚠️ Кнопка показывается ТОЛЬКО на Android. Google разрешает уводить на
          внешнюю оплату для услуг реального мира, Apple правилом 3.1.1 —
          запрещает, и рецензент цепляется именно за кнопку. Само продвижение
          под комиссию не подпадает (исключение 3.1.3(e), реклама реальной
          услуги), но спорить об этом на первой проверке дороже.
          Текст объясняет действие целиком: одного адреса мало — человеку надо
          знать, что войти нужно под той же учётной записью. */}
      <View style={styles.promote}>
        <Ionicons name="trending-up-outline" size={18} color={colors.primary} />
        <View style={styles.promoteBody}>
          <Text style={styles.promoteText}>{t.dashboard.promoteHint}</Text>

          {Platform.OS === 'android' ? (
            <Pressable
              style={styles.promoteButton}
              onPress={() => void Linking.openURL('https://birklik.az/dashboard')}
            >
              <Text style={styles.promoteButtonText}>{t.dashboard.promoteOpen}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
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
        <Pressable
          style={styles.edit}
          onPress={() => router.push({pathname: '/account/edit/[id]', params: {id: property.id}})}
          hitSlop={6}
        >
          <Ionicons name="create-outline" size={15} color={colors.primary} />
          <Text style={styles.editText}>{t.dashboard.edit}</Text>
        </Pressable>
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  list: {gap: spacing.sm},
  empty: {fontSize: fontSize.sm, color: colors.neutral, paddingVertical: spacing.lg},
  promote: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: radius.base,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  promoteBody: {flex: 1, gap: spacing.sm},
  promoteText: {fontSize: fontSize.sm, color: colors.gray700, lineHeight: 20},
  promoteButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.base,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.primary
  },
  promoteButtonText: {color: colors.white, fontSize: fontSize.sm, fontWeight: '700'},
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
  edit: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingTop: spacing.xs
  },
  editText: {fontSize: fontSize.sm, color: colors.primary, fontWeight: '600'}
})
