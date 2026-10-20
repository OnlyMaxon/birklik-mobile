import {useCallback, useEffect, useMemo, useState} from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import {Link, Stack, router} from 'expo-router'
import {Image} from 'expo-image'

import type {Booking, CommentReport, Property, Translations} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {
  closeReport,
  decideProperty,
  deleteBookingAsModerator,
  deleteComment,
  deleteProperty,
  getAllBookings,
  getAllComments,
  getAllProperties,
  getAllUsers,
  getPendingProperties,
  getReports,
  setPropertyActive,
  setUserBlocked,
  type CommentWithProperty,
  type ModeratedUser
} from '@/services/moderation-service'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Tab = 'pending' | 'listings' | 'bookings' | 'comments' | 'reports' | 'people'

type StatusFilter = 'all' | 'active' | 'pending' | 'inactive' | 'draft'

const STATUS_FILTERS: StatusFilter[] = ['all', 'active', 'pending', 'inactive', 'draft']

/** Подписи состояний — те же, что на сайте, из общего пакета. */
function statusLabel(t: Translations, value: StatusFilter): string {
  if (value === 'all') return t.moderation.filterAll
  if (value === 'active') return t.moderation.filterActive
  if (value === 'pending') return t.moderation.filterPending
  if (value === 'inactive') return t.moderation.filterHidden
  return t.moderation.filterDrafts
}

/**
 * Модераторка.
 *
 * Работает прямо из приложения, без сервера: правила дают модератору полный
 * доступ на запись, потому что право живёт в заявке токена и подделать его с
 * телефона нельзя.
 *
 * Разделы те же, что на сайте, включая «Люди».
 *
 * ⚠️ Раньше «Люди» здесь намеренно НЕ было, и записанная причина была такая:
 * список из ста сорока учётных записей на телефоне бесполезен, а действий над
 * ними всё равно нет. Второе перестало быть правдой — появилась блокировка
 * (правило Apple 1.2 требует её от приложений с чужим контентом), и теперь
 * раздел нужен. Первое осталось правдой, поэтому список открывается ПОИСКОМ:
 * без запроса показываются только заблокированные, а это ровно те, к кому
 * модератор и возвращается.
 */
export default function ModerationScreen() {
  const {t} = useLanguage()
  const {isModerator, loading: authLoading} = useAuth()

  const [tab, setTab] = useState<Tab>('pending')
  const [pending, setPending] = useState<Property[]>([])
  const [allListings, setAllListings] = useState<Property[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [comments, setComments] = useState<CommentWithProperty[]>([])
  const [reports, setReports] = useState<CommentReport[]>([])
  const [users, setUsers] = useState<ModeratedUser[]>([])
  // Человек, открытый в окне. Отдельно от `blockTarget`: сначала смотрим
  // данные, и только потом подтверждаем блокировку — два разных вопроса.
  const [openUser, setOpenUser] = useState<ModeratedUser | null>(null)
  const [blockTarget, setBlockTarget] = useState<ModeratedUser | null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [blocking, setBlocking] = useState(false)
  const [userQuery, setUserQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Набор состояний тот же, что на сайте. `draft` включён намеренно: это
  // неоплаченные платные объявления, и модератору надо видеть, что они висят.
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'pending' | 'inactive' | 'draft'
  >('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

  const load = useCallback(async () => {
    // allSettled: отказ одной выборки не должен оставлять экран пустым целиком.
    const [p, l, b, c, r, u] = await Promise.allSettled([
      getPendingProperties(),
      getAllProperties(),
      getAllBookings(),
      getAllComments(),
      getReports(),
      getAllUsers()
    ])
    if (p.status === 'fulfilled') setPending(p.value)
    if (l.status === 'fulfilled') setAllListings(l.value)
    if (b.status === 'fulfilled') setBookings(b.value)
    if (c.status === 'fulfilled') setComments(c.value)
    if (r.status === 'fulfilled') setReports(r.value)
    if (u.status === 'fulfilled') setUsers(u.value)
  }, [])

  useEffect(() => {
    // Ждём, пока провайдер выяснит заявку из токена: до этого `isModerator`
    // ложен у всех, и настоящего модератора выбросило бы с экрана.
    if (authLoading) return
    if (!isModerator) {
      router.replace('/')
      return
    }
    load().finally(() => setLoading(false))
  }, [authLoading, isModerator, load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }, [load])

  /**
   * Отбор в списке всех объявлений — как на сайте: поиск, состояние, порядок.
   *
   * Ищем шире, чем там: сайт смотрит название и владельца, здесь добавлены
   * город, район, телефон и КОД объявления. Модератор чаще всего приходит
   * именно с кодом — из жалобы или письма.
   */
  const foundListings = useMemo(() => {
    const query = search.trim().toLowerCase()

    return allListings
      .filter(property => {
        const matchStatus = statusFilter === 'all' || property.status === statusFilter
        if (!matchStatus) return false
        if (!query) return true

        return [
          property.title?.az,
          property.title?.en,
          property.title?.ru,
          property.city,
          property.district,
          property.id,
          property.owner?.name,
          property.owner?.phone
        ]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(query))
      })
      .sort((a, b) => {
        const first = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const second = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return sortOrder === 'newest' ? second - first : first - second
      })
  }, [allListings, search, statusFilter, sortOrder])

  /**
   * Кого показать в разделе «Люди».
   *
   * ⚠️ Без запроса — только заблокированные, и это не экономия, а смысл
   * раздела: сто сорок учётных записей подряд на телефоне никому не нужны, а
   * вернуться к заблокированному нужно часто. Остальных находим поиском.
   */
  const foundUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase()
    if (!query) return users.filter(person => person.blocked)

    return users.filter(person =>
      [person.name, person.email, person.phone]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    )
  }, [users, userQuery])

  /** Подтверждённая блокировка или разблокировка. */
  const applyBlock = async () => {
    if (!blockTarget) return
    const blockingNow = blockTarget.blocked !== true

    setBlocking(true)
    try {
      await setUserBlocked(blockTarget.id, blockingNow, blockingNow ? blockReason.trim() : '')
      setBlockTarget(null)
      setBlockReason('')
      // Окно профиля закрываем: данные в нём уже устарели.
      setOpenUser(null)
      await load()
    } catch {
      Alert.alert(t.moderation.blockFailed)
    } finally {
      setBlocking(false)
    }
  }

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    try {
      await action()
      await load()
    } catch {
      Alert.alert(t.messages.error)
    } finally {
      setBusy(null)
    }
  }

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const tabs: Array<{key: Tab; label: string; count: number}> = [
    {key: 'pending', label: t.dashboard.pending, count: pending.length},
    {key: 'listings', label: t.moderation.allListings, count: allListings.length},
    {key: 'bookings', label: t.dashboard.bookings, count: bookings.length},
    {key: 'comments', label: t.property.comments, count: comments.length},
    {key: 'reports', label: t.moderation.viewReports, count: reports.filter(r => r.status !== 'closed').length},
    // В счётчике — заблокированные, а не все: число «140» рядом с подписью
    // ничего модератору не говорит, а «2» говорит сразу.
    {key: 'people', label: t.moderation.peopleTab, count: users.filter(u => u.blocked).length}
  ]

  return (
    <>
      <Stack.Screen options={{title: t.dashboard.moderation}} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map(item => (
            <Pressable
              key={item.key}
              onPress={() => setTab(item.key)}
              style={[styles.tab, tab === item.key && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>
                {item.label}
                {item.count > 0 ? ` · ${item.count}` : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === 'pending' &&
          (pending.length === 0 ? (
            // Не `dashboard.noListings`: та подпись — «вы ещё не добавили
            // объявления», про свои. Модератор смотрит чужие, и пустота здесь
            // значит «проверять нечего».
            <Text style={styles.empty}>{t.messages.noResults}</Text>
          ) : (
            pending.map(property => (
              <View key={property.id} style={styles.card}>
                <Link href={`/property/${property.id}`} asChild>
                  <Pressable>
                    <Text style={styles.cardTitle}>
                      {property.title?.az || property.title?.en || property.id}
                    </Text>
                  </Pressable>
                </Link>
                <Text style={styles.meta}>
                  {[property.city, property.type].filter(Boolean).join(' · ')} ·{' '}
                  {property.price?.daily} ₼
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.button, styles.accept]}
                    disabled={busy === property.id}
                    onPress={() => void run(property.id, () => decideProperty(property.id, true))}
                  >
                    <Text style={styles.acceptText}>{t.buttons.approve}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, styles.reject]}
                    disabled={busy === property.id}
                    onPress={() => void run(property.id, () => decideProperty(property.id, false))}
                  >
                    <Text style={styles.rejectText}>{t.buttons.reject}</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ))}

        {tab === 'listings' && (
          <>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t.moderation.searchListings}
              placeholderTextColor={colors.gray400}
              style={styles.search}
              autoCorrect={false}
            />

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
            >
              {STATUS_FILTERS.map(value => {
                const active = statusFilter === value
                // Количество рядом с каждым состоянием, кроме «все»: там оно
                // повторяло бы число на самой вкладке.
                const count =
                  value === 'all' ? 0 : allListings.filter(item => item.status === value).length
                return (
                  <Pressable
                    key={value}
                    onPress={() => setStatusFilter(value)}
                    style={[styles.filter, active && styles.filterActive]}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>
                      {statusLabel(t, value)}
                      {count > 0 ? ` · ${count}` : ''}
                    </Text>
                  </Pressable>
                )
              })}

              <Pressable
                onPress={() => setSortOrder(prev => (prev === 'newest' ? 'oldest' : 'newest'))}
                style={styles.filter}
              >
                <Text style={styles.filterText}>
                  {sortOrder === 'newest'
                    ? `↓ ${t.moderation.sortNewest}`
                    : `↑ ${t.moderation.sortOldest}`}
                </Text>
              </Pressable>
            </ScrollView>
          </>
        )}

        {tab === 'listings' &&
          (foundListings.length === 0 ? (
            <Text style={styles.empty}>{t.messages.noResults}</Text>
          ) : (
            foundListings.map(property => {
              const active = property.status === 'active'
              return (
                <View key={property.id} style={styles.card}>
                  <Link href={`/property/${property.id}`} asChild>
                    <Pressable style={styles.listingHead}>
                      {/* Главный снимок рядом с названием: по одному заголовку
                          объявление не узнать, а модератор проходит их подряд. */}
                      {property.images?.[0] ? (
                        <Image
                          source={{uri: property.images[0]}}
                          style={styles.thumb}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={[styles.thumb, styles.thumbEmpty]} />
                      )}

                      <View style={styles.listingText}>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {property.title?.az || property.title?.en || property.id}
                        </Text>
                        {/* Статус пишем как есть: в базе попадаются значения,
                            которых нет в типе, и подменять их «неизвестно» —
                            терять сведения. */}
                        <Text style={styles.meta}>
                          {property.status} · {property.listingTier} ·{' '}
                          {[property.city, property.type].filter(Boolean).join(' · ')}
                        </Text>
                        <Text style={styles.small}>#{property.id}</Text>
                      </View>
                    </Pressable>
                  </Link>

                  <View style={styles.actions}>
                    {/* Правка любого объявления — то же, что редактор модератора
                        на сайте: содержимое, статус, тариф и срок. */}
                    <Pressable
                      style={[styles.button, styles.accept]}
                      onPress={() =>
                        router.push({pathname: '/moderation/edit/[id]', params: {id: property.id}})
                      }
                    >
                      <Text style={styles.acceptText}>{t.dashboard.edit}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.button, active ? styles.reject : styles.accept]}
                      disabled={busy === property.id}
                      onPress={() =>
                        void run(property.id, () => setPropertyActive(property.id, !active))
                      }
                    >
                      <Text style={active ? styles.rejectText : styles.acceptText}>
                        {active ? t.buttons.hide : t.buttons.show}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.button, styles.danger]}
                      disabled={busy === property.id}
                      onPress={() =>
                        Alert.alert(t.buttons.delete, undefined, [
                          {
                            text: t.buttons.delete,
                            style: 'destructive',
                            onPress: () => void run(property.id, () => deleteProperty(property.id))
                          },
                          {text: t.buttons.cancel, style: 'cancel'}
                        ])
                      }
                    >
                      <Text style={styles.dangerText}>{t.buttons.delete}</Text>
                    </Pressable>
                  </View>
                </View>
              )
            })
          ))}

        {tab === 'bookings' &&
          (bookings.length === 0 ? (
            <Text style={styles.empty}>{t.dashboard.bookingNoBookings}</Text>
          ) : (
            bookings.map(booking => (
              <View key={booking.id} style={styles.card}>
                <Text style={styles.cardTitle}>
                  {booking.checkInDate} → {booking.checkOutDate}
                </Text>
                <Text style={styles.meta}>
                  {booking.userName} · {booking.userPhone} · {booking.status}
                </Text>
                <Text style={styles.meta}>
                  {booking.nights} {t.booking.nights} · {booking.totalPrice} ₼
                </Text>

                <Pressable
                  style={[styles.button, styles.danger]}
                  disabled={busy === booking.id}
                  onPress={() =>
                    Alert.alert(t.buttons.delete, undefined, [
                      {
                        text: t.buttons.delete,
                        style: 'destructive',
                        onPress: () =>
                          void run(booking.id, () => deleteBookingAsModerator(booking.id))
                      },
                      {text: t.buttons.cancel, style: 'cancel'}
                    ])
                  }
                >
                  <Text style={styles.dangerText}>{t.buttons.delete}</Text>
                </Pressable>
              </View>
            ))
          ))}

        {tab === 'comments' &&
          (comments.length === 0 ? (
            <Text style={styles.empty}>{t.property.noComments}</Text>
          ) : (
            comments.map(comment => (
              <View key={`${comment.propertyId}-${comment.id}`} style={styles.card}>
                <Text style={styles.cardTitle}>{comment.userName}</Text>
                <Text style={styles.meta}>{comment.text}</Text>
                <Text style={styles.small}>
                  {comment.propertyTitle} · {comment.createdAt?.slice(0, 10)}
                </Text>

                <Pressable
                  style={[styles.button, styles.danger]}
                  disabled={busy === comment.id}
                  onPress={() =>
                    void run(comment.id, () => deleteComment(comment.propertyId, comment.id))
                  }
                >
                  <Text style={styles.dangerText}>{t.buttons.delete}</Text>
                </Pressable>
              </View>
            ))
          ))}

        {tab === 'reports' &&
          (reports.length === 0 ? (
            <Text style={styles.empty}>{t.messages.noResults}</Text>
          ) : (
            reports.map(report => (
              <View key={report.id} style={styles.card}>
                <Text style={styles.cardTitle}>{report.reason}</Text>
                <Text style={styles.meta}>{report.reportedByName}</Text>
                <Text style={styles.small}>
                  {report.status} · {report.createdAt?.slice(0, 10)}
                </Text>

                {report.status !== 'closed' ? (
                  <Pressable
                    style={[styles.button, styles.accept]}
                    disabled={busy === report.id}
                    onPress={() => void run(report.id, () => closeReport(report.id))}
                  >
                    <Text style={styles.acceptText}>{t.buttons.approve}</Text>
                  </Pressable>
                ) : null}
              </View>
            ))
          ))}

        {tab === 'people' && (
          <>
            <TextInput
              style={styles.search}
              placeholder={t.search.placeholder}
              placeholderTextColor={colors.gray400}
              value={userQuery}
              onChangeText={setUserQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />

            {foundUsers.length === 0 ? (
              <Text style={styles.empty}>
                {userQuery.trim() ? t.messages.noResults : t.moderation.blockedBadge + ': 0'}
              </Text>
            ) : (
              foundUsers.map(person => (
                <Pressable
                  key={person.id}
                  style={styles.person}
                  onPress={() => setOpenUser(person)}
                >
                  <View style={styles.personAvatar}>
                    {person.avatar ? (
                      <Image source={{uri: person.avatar}} style={styles.personAvatarImage} />
                    ) : (
                      <Text style={styles.personInitial}>
                        {(person.name?.charAt(0) || '?').toUpperCase()}
                      </Text>
                    )}
                  </View>

                  <View style={styles.personText}>
                    <View style={styles.personNameRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {person.name || '—'}
                      </Text>
                      {person.blocked ? (
                        <Text style={styles.blockedBadge}>{t.moderation.blockedBadge}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.small} numberOfLines={1}>
                      {person.email || '—'}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Окно человека — то же, что на сайте: кто это, как с ним связаться,
          когда зарегистрировался, и одна кнопка действия. */}
      <Modal
        visible={openUser !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenUser(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpenUser(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {openUser ? (
              <>
                <View style={styles.sheetAvatar}>
                  {openUser.avatar ? (
                    <Image source={{uri: openUser.avatar}} style={styles.sheetAvatarImage} />
                  ) : (
                    <Text style={styles.sheetInitial}>
                      {(openUser.name?.charAt(0) || '?').toUpperCase()}
                    </Text>
                  )}
                </View>

                <Text style={styles.sheetName}>{openUser.name || '—'}</Text>
                <Text style={styles.meta}>{openUser.email || '—'}</Text>
                {openUser.phone ? <Text style={styles.meta}>{openUser.phone}</Text> : null}
                {openUser.createdAt ? (
                  <Text style={styles.small}>{openUser.createdAt.slice(0, 10)}</Text>
                ) : null}

                {openUser.blocked && openUser.blockedReason ? (
                  <View style={styles.reasonBox}>
                    <Text style={styles.reasonLabel}>{t.moderation.blockReason}</Text>
                    <Text style={styles.reasonText}>{openUser.blockedReason}</Text>
                  </View>
                ) : null}

                {/* Кнопка одна и меняется по состоянию: показывать рядом обе
                    значило бы предлагать бессмысленное в половине случаев. */}
                <Pressable
                  style={[styles.button, openUser.blocked ? styles.accept : styles.danger]}
                  onPress={() => {
                    setBlockReason('')
                    setBlockTarget(openUser)
                  }}
                >
                  <Text style={openUser.blocked ? styles.acceptText : styles.dangerText}>
                    {openUser.blocked ? t.moderation.unblockUser : t.moderation.blockUser}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Подтверждение с обязательной причиной. Отдельным окном поверх
          предыдущего: человека надо выбрать, прочитать последствия и только
          потом нажать. */}
      <Modal
        visible={blockTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !blocking && setBlockTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => !blocking && setBlockTarget(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {blockTarget ? (
              <>
                <Text style={styles.sheetName}>
                  {blockTarget.blocked ? t.moderation.unblockTitle : t.moderation.blockTitle}
                </Text>
                <Text style={styles.meta}>
                  {blockTarget.name || '—'} · {blockTarget.email || '—'}
                </Text>

                <Text style={styles.hint}>
                  {blockTarget.blocked ? t.moderation.unblockHint : t.moderation.blockReasonHint}
                </Text>

                {!blockTarget.blocked ? (
                  <TextInput
                    style={styles.reasonInput}
                    placeholder={t.moderation.blockReasonPlaceholder}
                    placeholderTextColor={colors.gray400}
                    value={blockReason}
                    onChangeText={setBlockReason}
                    multiline
                    maxLength={500}
                    editable={!blocking}
                  />
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    style={[styles.button, styles.reject]}
                    disabled={blocking}
                    onPress={() => setBlockTarget(null)}
                  >
                    <Text style={styles.rejectText}>{t.buttons.cancel}</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.button,
                      blockTarget.blocked ? styles.accept : styles.danger,
                      // Причина обязательна: её увидит человек. Сервер
                      // отказывает по той же причине — кнопка лишь не даёт
                      // дойти до отказа.
                      (blocking || (!blockTarget.blocked && !blockReason.trim())) && styles.buttonOff
                    ]}
                    disabled={blocking || (!blockTarget.blocked && !blockReason.trim())}
                    onPress={() => void applyBlock()}
                  >
                    {blocking ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <Text style={blockTarget.blocked ? styles.acceptText : styles.dangerText}>
                        {blockTarget.blocked
                          ? t.moderation.confirmUnblock
                          : t.moderation.confirmBlock}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.gray50},
  content: {padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray50
  },
  tabs: {gap: spacing.xs, paddingVertical: 2},
  tab: {
    paddingHorizontal: spacing.base,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  tabActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  tabText: {fontSize: fontSize.sm, fontWeight: '600', color: colors.gray600},
  tabTextActive: {color: colors.white},
  empty: {fontSize: fontSize.sm, color: colors.neutral, paddingVertical: spacing.lg},
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.xs,
    ...shadow.sm
  },
  cardTitle: {fontSize: fontSize.base, fontWeight: '700', color: colors.text},
  search: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: colors.text
  },
  listingHead: {flexDirection: 'row', gap: spacing.sm},
  listingText: {flex: 1, gap: 2},
  thumb: {width: 84, height: 63, borderRadius: radius.sm},
  thumbEmpty: {backgroundColor: colors.gray100},
  filters: {gap: spacing.xs, paddingVertical: 2},
  filter: {
    paddingHorizontal: spacing.base,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  filterActive: {backgroundColor: colors.gray700, borderColor: colors.gray700},
  filterText: {fontSize: fontSize.xs, color: colors.gray600, fontWeight: '600'},
  filterTextActive: {color: colors.white},
  meta: {fontSize: fontSize.sm, color: colors.gray600, lineHeight: 20},
  small: {fontSize: fontSize.xs, color: colors.gray400},
  actions: {flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs},
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs
  },
  accept: {backgroundColor: colors.primary},
  acceptText: {color: colors.white, fontSize: fontSize.sm, fontWeight: '700'},
  reject: {backgroundColor: colors.gray100},
  rejectText: {color: colors.gray700, fontSize: fontSize.sm, fontWeight: '600'},
  danger: {backgroundColor: '#fdecea'},
  dangerText: {color: colors.error, fontSize: fontSize.sm, fontWeight: '600'},
  buttonOff: {opacity: 0.45},

  // ─────────────── Люди и блокировка ───────────────

  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    ...shadow.sm
  },
  personAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  personAvatarImage: {width: 42, height: 42},
  personInitial: {fontSize: fontSize.base, fontWeight: '700', color: colors.gray600},
  personText: {flex: 1, gap: 2},
  personNameRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  blockedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    fontSize: fontSize.xs,
    fontWeight: '700',
    overflow: 'hidden'
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center'
  },
  sheetAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.xs
  },
  sheetAvatarImage: {width: 64, height: 64},
  sheetInitial: {fontSize: fontSize.xl, fontWeight: '700', color: colors.gray600},
  sheetName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center'
  },

  // Объяснение последствий. Намеренно не мелкое и не серое: это единственное
  // место, где модератор читает, что произойдёт, до нажатия.
  hint: {
    fontSize: fontSize.sm,
    color: colors.gray600,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: spacing.sm
  },
  reasonBox: {
    width: '100%',
    backgroundColor: '#fef2f2',
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
    marginTop: spacing.sm
  },
  reasonLabel: {fontSize: fontSize.xs, fontWeight: '700', color: '#7f1d1d'},
  reasonText: {fontSize: fontSize.sm, color: '#7f1d1d', lineHeight: 19},
  reasonInput: {
    width: '100%',
    minHeight: 84,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
    textAlignVertical: 'top'
  }
})
