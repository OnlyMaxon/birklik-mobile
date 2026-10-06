import {Image} from 'expo-image'
import {Pressable, StyleSheet, Text, View} from 'react-native'
import {Link} from 'expo-router'

import type {Property} from '@birklik/core/types'
import {isTierActive} from '@birklik/core/utils/premium-helper'

import {FavoriteButton} from '@/components/favorite-button'
import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  property: Property
  /** Компактный вид — две карточки в ряду, как на сайте. */
  compact?: boolean
}

/**
 * Карточка объявления.
 *
 * Значок тарифа спрашивается у `isTierActive` — она требует И совпадения
 * тарифа, И непросроченной даты. Смотреть на одно `listingTier` нельзя: ровно
 * на этом сайт полгода рисовал «VIP» объявлениям с истёкшим сроком.
 *
 * ⚠️ В компактном виде строка «комнаты · площадь · гостей» убрана, а не ужата.
 * В половину ширины экрана три числа с подписями не помещаются и переносятся —
 * карточка становится ВЫШЕ обычной, то есть ровно наоборот тому, зачем
 * компактный вид включают. Название, место и цена остаются: по ним и выбирают.
 */
export function PropertyCard({property, compact = false}: Props) {
  const {language, t} = useLanguage()
  const premium = isTierActive(property, 'premium')
  const vip = !premium && isTierActive(property, 'vip')
  const cover = property.images?.[0]

  return (
    <Link href={`/property/${property.id}`} asChild>
      <Pressable
        style={({pressed}) => [styles.card, compact && styles.cardCompact, pressed && styles.cardPressed]}
      >
        {cover ? (
          <Image
            source={{uri: cover}}
            style={[styles.image, compact && styles.imageCompact]}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[styles.image, compact && styles.imageCompact, styles.imageEmpty]}>
            <Text style={styles.imageEmptyText}>{t.property.gallery}</Text>
          </View>
        )}

        <View style={styles.favorite}>
          <FavoriteButton propertyId={property.id} favorites={property.favorites} />
        </View>

        {(premium || vip) && (
          <View style={[styles.badge, premium ? styles.badgePremium : styles.badgeVip]}>
            <Text style={styles.badgeText}>{premium ? 'PREMIUM' : 'VIP'}</Text>
          </View>
        )}

        <View style={[styles.body, compact && styles.bodyCompact]}>
          <Text
            style={[styles.title, compact && styles.titleCompact]}
            numberOfLines={compact ? 1 : 2}
          >
            {property.title?.[language] || property.title?.az || ''}
          </Text>

          <Text style={[styles.location, compact && styles.locationCompact]} numberOfLines={1}>
            {[property.city, property.district].filter(Boolean).join(' · ')}
          </Text>

          {!compact && (
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{property.rooms} {t.property.rooms}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta}>{property.area} {t.property.sqm}</Text>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta}>{property.maxGuests} {t.property.guests}</Text>
            </View>
          )}

          {typeof property.price?.daily === 'number' && (
            <Text style={[styles.price, compact && styles.priceCompact]} numberOfLines={1}>
              {property.price.daily} ₼{' '}
              <Text style={styles.priceUnit}>/ {t.property.perNight}</Text>
            </Text>
          )}
        </View>
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  cardPressed: {opacity: 0.75},
  favorite: {position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1},
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.sm
  },
  // ⚠️ `flex: 1` обязателен: в два столбца карточка обязана делить ряд поровну,
  // иначе её ширину задаёт содержимое и столбцы получаются разной ширины.
  // `minWidth: 0` разрешает содержимому ужиматься — без него длинное название
  // распирает карточку и ломает ряд.
  cardCompact: {flex: 1, minWidth: 0},
  image: {
    width: '100%',
    height: 200,
    backgroundColor: colors.gray100
  },
  imageCompact: {height: 112},
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
  bodyCompact: {padding: spacing.sm, gap: 2},
  title: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text
  },
  titleCompact: {fontSize: fontSize.sm},
  location: {
    fontSize: fontSize.sm,
    color: colors.neutral
  },
  locationCompact: {fontSize: fontSize.xs},
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
  priceCompact: {marginTop: 2, fontSize: fontSize.base},
  priceUnit: {
    fontSize: fontSize.sm,
    fontWeight: '400',
    color: colors.neutral
  }
})
