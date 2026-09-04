import {useCallback, useEffect, useState} from 'react'
import {ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View} from 'react-native'
import {Link, router} from 'expo-router'

import type {Property} from '@birklik/core/types'
import {isTierActive, tierExpiresAt, tierRemainingDays} from '@birklik/core/utils/premium-helper'
import {isOnDisplay} from '@birklik/core/utils/display'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {getOwnerProperties} from '@/services/property-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

/**
 * Кабинет.
 *
 * Показывает объявления владельца ЦЕЛИКОМ, включая снятые с витрины: истёкшие,
 * ожидающие модерации и черновики. Ровно за этим сюда и приходят — понять,
 * куда делось объявление, и продлить.
 *
 * Создания и правки объявлений здесь нет: форма с загрузкой десятка фотографий
 * и выбором места на карте — отдельная работа, и на сайте она сделана. Пока
 * приложение показывает состояние, а меняют его в браузере.
 */
export default function AccountScreen() {
  const {t, language} = useLanguage()
  const {user, profile, isModerator, signOut} = useAuth()

  const [listings, setListings] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    try {
      setListings(await getOwnerProperties(user.uid))
    } catch {
      setListings([])
    }
  }, [user])

  useEffect(() => {
    // Гость сюда попасть не должен: экран открывается только из шапки, а она
    // показывает кнопку кабинета лишь вошедшим. Проверка на случай возврата
    // назад после выхода.
    if (!user) {
      router.replace('/')
      return
    }
    load().finally(() => setLoading(false))
  }, [user, load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <FlatList
      style={styles.screen}
      data={listings}
      keyExtractor={property => property.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <View style={styles.head}>
          <Text style={styles.name}>{profile?.name || user?.email}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {profile?.phone ? <Text style={styles.email}>{profile.phone}</Text> : null}
          {isModerator ? (
            <View style={styles.moderatorBadge}>
              <Text style={styles.moderatorText}>{t.dashboard.moderation}</Text>
            </View>
          ) : null}

          <Pressable style={styles.notifications} onPress={() => router.push('/notifications')}>
            <Text style={styles.notificationsText}>{t.dashboard.notifications}</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>
            {t.nav.myListings} · {listings.length}
          </Text>
        </View>
      }
      renderItem={({item}) => <OwnerListing property={item} language={language} t={t} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{t.dashboard.noListings}</Text>
      }
      ListFooterComponent={
        <Pressable
          style={styles.logout}
          onPress={() =>
            Alert.alert(t.buttons.logout, undefined, [
              {
                text: t.buttons.logout,
                style: 'destructive',
                onPress: () => {
                  void signOut()
                  router.replace('/')
                }
              },
              {text: t.buttons.cancel, style: 'cancel'}
            ])
          }
        >
          <Text style={styles.logoutText}>{t.buttons.logout}</Text>
        </Pressable>
      }
    />
  )
}

function OwnerListing({
  property,
  language,
  t
}: {
  property: Property
  language: 'az' | 'en' | 'ru'
  t: ReturnType<typeof useLanguage>['t']
}) {
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
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.gray50},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray50},
  list: {padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl},
  head: {gap: spacing.xs, marginBottom: spacing.sm},
  name: {fontSize: fontSize.xxl, fontWeight: '700', color: colors.text},
  email: {fontSize: fontSize.sm, color: colors.neutral},
  moderatorBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.secondary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.xs
  },
  moderatorText: {color: colors.white, fontSize: fontSize.xs, fontWeight: '700'},
  notifications: {
    marginTop: spacing.base,
    backgroundColor: colors.white,
    borderRadius: radius.base,
    paddingVertical: spacing.base,
    paddingHorizontal: spacing.base,
    ...shadow.sm
  },
  notificationsText: {fontSize: fontSize.base, fontWeight: '600', color: colors.text},
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.gray700,
    marginTop: spacing.md
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.sm,
    ...shadow.sm
  },
  cardPressed: {opacity: 0.75},
  cardHead: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  cardTitle: {flex: 1, fontSize: fontSize.base, fontWeight: '600', color: colors.text},
  tier: {paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm},
  tierPremium: {backgroundColor: colors.accent},
  tierVip: {backgroundColor: colors.secondary},
  tierText: {color: colors.white, fontSize: fontSize.xs, fontWeight: '700'},
  cardRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  status: {paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm},
  statusOn: {backgroundColor: '#e8f5ef'},
  statusOff: {backgroundColor: colors.gray100},
  statusText: {fontSize: fontSize.xs, fontWeight: '600'},
  statusTextOn: {color: colors.primaryDark},
  statusTextOff: {color: colors.gray600},
  price: {fontSize: fontSize.base, fontWeight: '700', color: colors.primary},
  expiry: {fontSize: fontSize.xs, color: colors.neutral},
  empty: {
    fontSize: fontSize.base,
    color: colors.neutral,
    textAlign: 'center',
    paddingVertical: spacing.xl
  },
  logout: {alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.md},
  logoutText: {fontSize: fontSize.base, color: colors.error, fontWeight: '600'}
})
