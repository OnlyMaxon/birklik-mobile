import {Image} from 'expo-image'
import {StyleSheet, Text, View} from 'react-native'

import type {Property} from '@birklik/core/types'
import {isTierActive} from '@birklik/core/utils/premium-helper'

import {CardLink} from '@/components/card-link'
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
 *
 * ⚠️ Мелочи вроде значка тарифа и кнопки закладки в компактном виде УМЕНЬШЕНЫ,
 * а не оставлены как есть. Размеры взяты с сайта (`.compact-view` в
 * `property-card.css`): на карточке в половину экрана значок прежнего размера
 * занимает её треть и перекрывает снимок.
 *
 * ⚠️ Снимок в компактном виде задан пропорцией, а не высотой в точках. Высота
 * в точках при разной ширине экрана даёт разные пропорции — на узком телефоне
 * снимок растягивается в полоску.
 */
export function PropertyCard({property, compact = false}: Props) {
  const {language, t} = useLanguage()
  const premium = isTierActive(property, 'premium')
  const vip = !premium && isTierActive(property, 'vip')
  const cover = property.images?.[0]

  return (
    <CardLink
      href={`/property/${property.id}`}
      style={[styles.card, compact && styles.cardCompact]}
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

      <View style={[styles.favorite, compact && styles.favoriteCompact]}>
        <FavoriteButton
          propertyId={property.id}
          favorites={property.favorites}
          size={compact ? 'mini' : 'small'}
        />
      </View>

      {(premium || vip) && (
        <View
          style={[
            styles.badge,
            compact && styles.badgeCompact,
            premium ? styles.badgePremium : styles.badgeVip
          ]}
        >
          <Text style={[styles.badgeText, compact && styles.badgeTextCompact]}>
            {premium ? 'PREMIUM' : 'VIP'}
          </Text>
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
            <Text style={[styles.priceUnit, compact && styles.priceUnitCompact]}>
              / {t.property.perNight}
            </Text>
          </Text>
        )}
      </View>
    </CardLink>
  )
}

const styles = StyleSheet.create({
  favorite: {position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1},
  favoriteCompact: {top: spacing.xs, right: spacing.xs},
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
  //
  // ⚠️ И то и другое доедет до экрана только через `CardLink`: `<Link asChild>`
  // теряет стиль, записанный функцией. Подробности — там же.
  cardCompact: {flex: 1, minWidth: 0},
  image: {
    width: '100%',
    height: 200,
    backgroundColor: colors.gray100
  },
  // `height: undefined` здесь обязателен и не лишний: высота из `image` иначе
  // осталась бы и победила пропорцию — `aspectRatio` работает только там, где
  // один из размеров не задан.
  imageCompact: {height: undefined, aspectRatio: 4 / 3},
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
  badgeCompact: {
    top: spacing.xs,
    left: spacing.xs,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: radius.sm - 2
  },
  badgePremium: {backgroundColor: colors.accent},
  badgeVip: {backgroundColor: colors.secondary},
  badgeText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  badgeTextCompact: {fontSize: 9, letterSpacing: 0.2},
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
  titleCompact: {fontSize: 13},
  location: {
    fontSize: fontSize.sm,
    color: colors.neutral
  },
  locationCompact: {fontSize: 11},
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
  priceCompact: {marginTop: 2, fontSize: 15},
  priceUnit: {
    fontSize: fontSize.sm,
    fontWeight: '400',
    color: colors.neutral
  },
  priceUnitCompact: {fontSize: 10}
})
