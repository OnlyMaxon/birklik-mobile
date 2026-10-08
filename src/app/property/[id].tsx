import {useEffect, useState} from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native'
import {Stack, router, useLocalSearchParams} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import type {Property} from '@birklik/core/types'
import {isTierActive} from '@birklik/core/utils/premium-helper'

import {useAuth} from '@/auth/auth-provider'
import {BookingCard} from '@/components/booking-card'
import {CommentsSection} from '@/components/comments-section'
import {FavoriteButton} from '@/components/favorite-button'
import {RatingWidget} from '@/components/rating-widget'
import {PropertyCard} from '@/components/property-card'
import {PropertyGallery} from '@/components/property-gallery'
import {PropertyMap} from '@/components/property-map'
import {useLanguage} from '@/i18n/language-provider'
import {getProperty, getSimilarProperties} from '@/services/property-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

const {width} = Dimensions.get('window')

export default function PropertyScreen() {
  const {id} = useLocalSearchParams<{id: string}>()
  const {language, t} = useLanguage()
  const {user} = useAuth()

  const [property, setProperty] = useState<Property | null>(null)
  const [similar, setSimilar] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    getProperty(id)
      .then(found => {
        if (!found) {
          setNotFound(true)
          return
        }
        setProperty(found)
        // Похожие грузим отдельно и молча: их отсутствие не повод портить
        // страницу — раздел просто не появится.
        getSimilarProperties(found)
          .then(setSimilar)
          .catch(() => setSimilar([]))
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  // Объявление, снятое с витрины, сюда не доезжает — служба отдаёт null. Это
  // не «не найдено» в буквальном смысле, но для гостя разницы нет, а
  // показывать истёкшее по прямой ссылке нельзя.
  if (notFound || !property) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>{t.errors.errorNotFound}</Text>
      </View>
    )
  }

  const title = property.title?.[language] || property.title?.az || ''
  const description = property.description?.[language] || property.description?.az || ''
  const address = property.address?.[language] || property.address?.az || ''
  const premium = isTierActive(property, 'premium')
  const vip = !premium && isTierActive(property, 'vip')
  const phone = property.owner?.phone
  // Имя владельца. На сайте оно стоит над телефоном в блоке «Контакты», а в
  // приложении не показывалось вовсе, хотя `owner` приходит целиком тем же
  // документом — читали из него один телефон.
  const ownerName = property.owner?.name
  // Владелец ли смотрящий. На сайте это приходит сверху (`isOwner` в
  // PropertyDetails), здесь считаем на месте: сервера, который подставил бы
  // признак, у приложения нет.
  const isOwner = Boolean(user && property.ownerId && property.ownerId === user.uid)

  return (
    <>
      <Stack.Screen options={{title}} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {/* Галерея — со счётчиком, лентой миниатюр и просмотром на весь экран.
            Кадр не обрезается, поля заполняет он же в размытии: ровно так
            устроена галерея на сайте, и ровно из-за обрезки владельцы там
            когда-то жаловались. */}
        <PropertyGallery images={property.images ?? []} />

        <View style={styles.favorite}>
          <FavoriteButton propertyId={property.id} favorites={property.favorites} size="large" />
        </View>

        <View style={styles.body}>
          {(premium || vip) && (
            <View style={[styles.badge, premium ? styles.badgePremium : styles.badgeVip]}>
              <Text style={styles.badgeText}>{premium ? 'PREMIUM' : 'VIP'}</Text>
            </View>
          )}

          <View style={styles.titleRow}>
            <Text style={styles.title}>{title}</Text>
            {/* «Поделиться» — системное окно устройства. Ссылка ведёт на сайт:
                у приложения нет своих адресов, а получатель может оказаться и
                без приложения вовсе. */}
            <Pressable
              onPress={() =>
                void Share.share({
                  message: `${title}\nhttps://birklik.az/property/${property.id}`
                })
              }
              hitSlop={8}
              style={styles.shareButton}
              accessibilityRole="button"
              accessibilityLabel={t.buttons.share}
            >
              <Ionicons name="share-social-outline" size={20} color={colors.primary} />
            </Pressable>
          </View>

          <Text style={styles.location}>
            {[property.city, property.district].filter(Boolean).join(' · ')}
          </Text>

          {/* Код объявления — как `#{property.id}` на сайте. По нему владелец и
              поддержка находят запись, поэтому он на виду, а не в подвале. */}
          <Text style={styles.code} selectable>
            #{property.id}
          </Text>

          {typeof property.price?.daily === 'number' && (
            <Text style={styles.price}>
              {property.price.daily} ₼{' '}
              <Text style={styles.priceUnit}>/ {t.property.perNight}</Text>
            </Text>
          )}

          <View style={styles.facts}>
            <Fact value={String(property.rooms)} label={t.property.rooms} />
            <Fact value={`${property.area}`} label={t.property.sqm} />
            <Fact value={String(property.maxGuests)} label={t.property.guests} />
          </View>

          {/* Повышение тарифа — только владельцу и только на своём объявлении,
              как `OwnerActions` на сайте. Правила видимости те же: VIP не
              предлагаем тому, у кого уже VIP или премиум; премиум — тому, у
              кого премиум.

              ⚠️ Кнопки сайта ведут в Azericard, здесь они ведут в наш экран с
              оплатой через Google Play. Продавать цифровой товар внутри
              приложения мимо Play запрещено, и копировать поведение сайта
              буквально было бы нарушением.

              ⚠️ Пока только Android — так же, как вход из «Моих объявлений».
              В App Store товаров ещё нет; появятся — снимать обе оговорки
              вместе, иначе два входа разойдутся в поведении. */}
          {isOwner && Platform.OS === 'android' ? (
            <View style={styles.ownerActions}>
              {property.listingTier !== 'vip' && property.listingTier !== 'premium' ? (
                <Pressable
                  style={[styles.tierButton, styles.tierVip]}
                  onPress={() =>
                    router.push({pathname: '/account/promote/[id]', params: {id: property.id}})
                  }
                >
                  <Ionicons name="star" size={15} color={colors.white} />
                  <Text style={styles.tierText}>VIP</Text>
                </Pressable>
              ) : null}

              {property.listingTier !== 'premium' ? (
                <Pressable
                  style={[styles.tierButton, styles.tierPremium]}
                  onPress={() =>
                    router.push({pathname: '/account/promote/[id]', params: {id: property.id}})
                  }
                >
                  <Ionicons name="diamond" size={15} color={colors.white} />
                  <Text style={styles.tierText}>{t.pricing.premium}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {description ? (
            <Section title={t.property.description}>
              <Text style={styles.paragraph}>{description}</Text>
            </Section>
          ) : null}

          {property.amenities?.length ? (
            <Section title={t.property.amenities}>
              <View style={styles.amenities}>
                {property.amenities.map(amenity => (
                  <View key={amenity} style={styles.amenity}>
                    <Text style={styles.amenityText}>
                      {t.amenities?.[amenity as keyof typeof t.amenities] ?? amenity}
                    </Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {address ? (
            <Section title={t.property.address}>
              <Text style={styles.paragraph}>{address}</Text>
            </Section>
          ) : null}

          {/* Координаты бывают не у всех записей — у старых объявлений их нет,
              и рисовать карту в точке (0, 0) в Гвинейском заливе нельзя. */}
          {property.coordinates?.lat && property.coordinates?.lng ? (
            <Section title={t.property.location}>
              <PropertyMap
                latitude={property.coordinates.lat}
                longitude={property.coordinates.lng}
                label={title}
              />
            </Section>
          ) : null}

          <Section title={t.property.bookingRequest}>
            <BookingCard property={property} />
          </Section>

          {/* Звонок остаётся рядом с бронью, а не вместо неё: за всё время
              работы площадки договаривались именно звонком. */}
          {(ownerName || phone) ? (
            <View style={styles.owner}>
              <Text style={styles.ownerLabel}>{t.property.contact}</Text>
              {ownerName ? <Text style={styles.ownerName}>{ownerName}</Text> : null}
              {phone ? (
                <Pressable
                  style={styles.callButton}
                  onPress={() => Linking.openURL(`tel:${phone}`)}
                >
                  <Text style={styles.callButtonText}>{phone}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <RatingWidget property={property} />

          <Section title={t.property.comments}>
            <CommentsSection property={property} />
          </Section>
        </View>

        {similar.length > 0 && (
          <View style={styles.similar}>
            <Text style={styles.similarTitle}>{t.property.similarListings}</Text>
            {similar.map(item => (
              <PropertyCard key={item.id} property={item} />
            ))}
          </View>
        )}
      </ScrollView>
    </>
  )
}

function Fact({value, label}: {value: string; label: string}) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  )
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  content: {paddingBottom: spacing.xxl},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    padding: spacing.xl
  },
  notFound: {fontSize: fontSize.lg, color: colors.neutral},
  slide: {width, height: 280, backgroundColor: colors.gray100},
  slideEmpty: {backgroundColor: colors.gray200},
  favorite: {position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 1},
  body: {padding: spacing.md, gap: spacing.sm},
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm
  },
  badgePremium: {backgroundColor: colors.accent},
  badgeVip: {backgroundColor: colors.secondary},
  badgeText: {color: colors.white, fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.5},
  titleRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  title: {flex: 1, fontSize: fontSize.xxl, fontWeight: '700', color: colors.text},
  shareButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  location: {fontSize: fontSize.base, color: colors.neutral},
  code: {fontSize: fontSize.xs, color: colors.gray400},
  similar: {paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md},
  similarTitle: {fontSize: fontSize.lg, fontWeight: '700', color: colors.text},
  price: {fontSize: fontSize.title, fontWeight: '700', color: colors.primary, marginTop: spacing.xs},
  priceUnit: {fontSize: fontSize.base, fontWeight: '400', color: colors.neutral},
  facts: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.base
  },
  fact: {
    flex: 1,
    backgroundColor: colors.gray50,
    borderRadius: radius.base,
    paddingVertical: spacing.base,
    alignItems: 'center',
    gap: 2
  },
  factValue: {fontSize: fontSize.xl, fontWeight: '700', color: colors.text},
  factLabel: {fontSize: fontSize.xs, color: colors.neutral},
  section: {marginTop: spacing.lg, gap: spacing.sm},
  sectionTitle: {fontSize: fontSize.lg, fontWeight: '600', color: colors.text},
  paragraph: {fontSize: fontSize.base, lineHeight: 24, color: colors.gray700},
  amenities: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  amenity: {
    backgroundColor: colors.gray50,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm
  },
  amenityText: {fontSize: fontSize.sm, color: colors.gray700},
  // Повышение тарифа владельцу: две кнопки в ряд, под ценой и фактами.
  ownerActions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.base},
  tierButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.base,
    ...shadow.sm
  },
  // Цвета те же, что у значков тарифа на карточке, — чтобы кнопка и значок,
  // который появится после покупки, читались как одно и то же.
  tierVip: {backgroundColor: colors.secondary},
  tierPremium: {backgroundColor: colors.accent},
  tierText: {color: colors.white, fontSize: fontSize.sm, fontWeight: '700'},
  // Блок «Контакты» — заголовок, имя владельца, кнопка звонка. Порядок тот же,
  // что в карточке брони на сайте.
  owner: {marginTop: spacing.xl, gap: spacing.xs},
  ownerLabel: {fontSize: fontSize.sm, color: colors.neutral, fontWeight: '600'},
  ownerName: {fontSize: fontSize.lg, color: colors.text, fontWeight: '700'},
  callButton: {
    marginTop: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.base,
    paddingVertical: spacing.base,
    alignItems: 'center',
    ...shadow.sm
  },
  callButtonText: {color: colors.white, fontSize: fontSize.base, fontWeight: '600'}
})
