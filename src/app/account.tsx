import {useCallback, useEffect, useState} from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import {Image} from 'expo-image'
import {type Href, router} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import {useAuth} from '@/auth/auth-provider'
import {AccountLinks} from '@/components/account/account-links'
import {useLanguage} from '@/i18n/language-provider'
import {getOwnerBookings, getUserBookings} from '@/services/booking-service'
import {getFavoriteProperties, getOwnerProperties} from '@/services/property-service'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

/**
 * Кабинет — список разделов, а не вкладки.
 *
 * ⚠️ Сначала здесь были вкладки-пилюли в горизонтальной прокрутке, как на
 * сайте. На телефоне это оказалось плохо: четыре подписи не помещаются, часть
 * уезжает за край, и человек не видит, что там ещё есть. На широком экране у
 * сайта такой беды нет.
 *
 * Поэтому разделы разнесены по своим страницам, а здесь — их перечень с
 * количеством. Разделы те же, что на сайте, ничего не убрано и не придумано.
 */
export default function AccountScreen() {
  const {t} = useLanguage()
  const {user, profile, isModerator, signOut} = useAuth()

  const [counts, setCounts] = useState({listings: 0, favorites: 0, bookings: 0})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Здесь нужны только количества для подписей — сами выборки делают свои
  // страницы. Считаем разом: три коротких запроса дешевле, чем пустые цифры.
  const load = useCallback(async () => {
    if (!user) return
    const [own, saved, mine, incoming] = await Promise.allSettled([
      getOwnerProperties(user.uid),
      getFavoriteProperties(user.uid),
      getUserBookings(user.uid),
      getOwnerBookings(user.uid)
    ])
    setCounts({
      listings: own.status === 'fulfilled' ? own.value.length : 0,
      favorites: saved.status === 'fulfilled' ? saved.value.length : 0,
      bookings:
        (mine.status === 'fulfilled' ? mine.value.length : 0) +
        (incoming.status === 'fulfilled' ? incoming.value.length : 0)
    })
  }, [user])

  useEffect(() => {
    // Гость сюда попасть не должен: кабинет открывается только из шапки, а она
    // показывает кнопку лишь вошедшим. Проверка на случай возврата после выхода.
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

  const logout = () =>
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const name = profile?.name || user?.email || ''

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.head}>
        <View style={styles.avatar}>
          {profile?.avatar ? (
            <Image source={{uri: profile.avatar}} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <Text style={styles.avatarLetter}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
          )}
        </View>
        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </View>

      <View style={styles.group}>
        <Row
          icon="home-outline"
          label={t.dashboard.myListings}
          count={counts.listings}
          to="/account/listings"
        />
        <Row icon="add-circle-outline" label={t.dashboard.addListing} to="/account/add" />
        <Row
          icon="bookmark-outline"
          label={t.dashboard.favorites}
          count={counts.favorites}
          to="/account/favorites"
        />
        <Row
          icon="calendar-outline"
          label={t.dashboard.bookings}
          count={counts.bookings}
          to="/account/bookings"
        />
        <Row icon="notifications-outline" label={t.dashboard.notifications} to="/notifications" />
        <Row icon="person-outline" label={t.dashboard.profile} to="/account/profile" last />
      </View>

      {isModerator ? (
        <View style={styles.group}>
          <Row
            icon="shield-checkmark-outline"
            label={t.dashboard.moderation}
            to="/moderation"
            accent
            last
          />
        </View>
      ) : null}

      <AccountLinks />

      <Pressable style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>{t.buttons.logout}</Text>
      </Pressable>
    </ScrollView>
  )
}

function Row({
  icon,
  label,
  count,
  to,
  accent,
  last
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  count?: number
  to: Href
  accent?: boolean
  last?: boolean
}) {
  return (
    <Pressable
      onPress={() => router.push(to)}
      style={({pressed}) => [styles.row, last && styles.rowLast, pressed && styles.rowPressed]}
    >
      <Ionicons name={icon} size={20} color={accent ? colors.primary : colors.gray500} />
      <Text style={[styles.rowLabel, accent && styles.rowLabelAccent]}>{label}</Text>
      {/* Количество только когда оно есть: «Избранное · 0» сообщает не больше,
          чем «Избранное», а шума добавляет. */}
      {count ? <Text style={styles.rowCount}>{count}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
    </Pressable>
  )
}

const AVATAR = 52

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.gray50},
  content: {padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.base},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray50
  },
  head: {flexDirection: 'row', alignItems: 'center', gap: spacing.base},
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  avatarImage: {width: '100%', height: '100%'},
  avatarLetter: {color: colors.white, fontSize: fontSize.xl, fontWeight: '700'},
  headText: {flex: 1},
  name: {fontSize: fontSize.lg, fontWeight: '700', color: colors.text},
  email: {fontSize: fontSize.sm, color: colors.neutral},
  group: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.gray200,
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray200
  },
  rowLast: {borderBottomWidth: 0},
  rowPressed: {backgroundColor: colors.gray50},
  rowLabel: {flex: 1, fontSize: fontSize.base, color: colors.text},
  rowLabelAccent: {color: colors.primary, fontWeight: '600'},
  rowCount: {fontSize: fontSize.sm, color: colors.neutral},
  logout: {alignItems: 'center', paddingVertical: spacing.base},
  logoutText: {color: colors.error, fontSize: fontSize.sm, fontWeight: '600'}
})
