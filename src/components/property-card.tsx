import {Image} from 'expo-image'
import {StyleSheet, Text, View} from 'react-native'

import type {Property} from '@birklik/core/types'
import {isTierActive} from '@birklik/core/utils/premium-helper'

import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  property: Property
  language: 'az' | 'en' | 'ru'
}

/**
 * Карточка объявления.
 *
 * Значок тарифа спрашивается у `isTierActive` — она требует И совпадения
 * тарифа, И непросроченной даты. Смотреть на одно `listingTier` нельзя: ровно
 * на этом сайт полгода рисовал «VIP» объявлениям с истёкшим сроком.
 */
export function PropertyCard({property, language}: Props) {
  const premium = isTierActive(property, 'premium')
  const vip = !premium && isTierActive(property, 'vip')
  const cover = property.images?.[0]

  return (
    <View style={styles.card}>
      {cover ? (
        <Image
          source={{uri: cover}}
          style={styles.image}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={[styles.image, styles.imageEmpty]}>
          <Text style={styles.imageEmptyText}>Şəkil yoxdur</Text>
        </View>
      )}

      {(premium || vip) && (
        <View style={[styles.badge, premium ? styles.badgePremium : styles.badgeVip]}>
          <Text style={styles.badgeText}>{premium ? 'PREMIUM' : 'VIP'}</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {property.title?.[language] || property.title?.az || ''}
        </Text>

        <Text style={styles.location} numberOfLines={1}>
          {[property.city, property.district].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.meta}>{property.rooms} otaq</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.meta}>{property.area} m²</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.meta}>{property.maxGuests} nəfər</Text>
        </View>

        {typeof property.price?.daily === 'number' && (
          <Text style={styles.price}>
            {property.price.daily} ₼ <Text style={styles.priceUnit}>/ gecə</Text>
          </Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.sm
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: colors.gray100
  },
  imageEmpty: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  imageEmptyText: {
    color: colors.gray400,
    fontSize: fontSize.sm
  },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm
  },
  badgePremium: {backgroundColor: colors.accent},
  badgeVip: {backgroundColor: colors.secondary},
  badgeText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  body: {
    padding: spacing.base,
    gap: spacing.xs
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text
  },
  location: {
    fontSize: fontSize.sm,
    color: colors.neutral
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs
  },
  meta: {
    fontSize: fontSize.sm,
    color: colors.gray600
  },
  metaDot: {
    color: colors.gray300
  },
  price: {
    marginTop: spacing.xs,
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.primary
  },
  priceUnit: {
    fontSize: fontSize.sm,
    fontWeight: '400',
    color: colors.neutral
  }
})
