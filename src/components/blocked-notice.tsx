import {Linking, Pressable, StyleSheet, Text, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {useAuth} from '@/auth/auth-provider'
import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

/**
 * Полоса с причиной блокировки — то, что видит сам заблокированный человек.
 *
 * ⚠️ Без неё блокировка выглядит поломкой приложения: кнопки есть, нажатия
 * ничего не делают, объявления пропали с витрины. Человек звонит в поддержку с
 * «у вас всё сломалось», и говорить с ним не о чем. Показывать причину —
 * решение владельца площадки, а не техническая необходимость.
 *
 * ⚠️ Полоса ОБЪЯСНЯЕТ, а не запрещает. Запрет делают правила Firestore и
 * проверка на сервере; спрятать полосу, подправив профиль, человек не может —
 * правила держат поля `blocked*` закрытыми.
 *
 * Ставится на экраны, где запрет и всплывёт: профиль и подача объявления.
 * Узнать о блокировке лучше ДО того, как заполнишь анкету и получишь отказ.
 */
export function BlockedNotice() {
  const {profile} = useAuth()
  const {t} = useLanguage()

  if (!profile?.blocked) return null

  const phone = t.pages.contact.phoneNumber
  const email = t.pages.contact.emailAddress

  return (
    <View style={styles.box} accessibilityRole="alert">
      <View style={styles.head}>
        <Ionicons name="ban-outline" size={18} color="#b91c1c" />
        <Text style={styles.title}>{t.blocked.title}</Text>
      </View>

      <Text style={styles.body}>{t.blocked.body}</Text>

      {profile.blockedReason ? (
        <View style={styles.reason}>
          <Text style={styles.reasonLabel}>{t.blocked.reasonLabel}</Text>
          <Text style={styles.reasonText}>{profile.blockedReason}</Text>
        </View>
      ) : null}

      <Text style={styles.body}>{t.blocked.listingsHidden}</Text>

      <Text style={styles.body}>{t.blocked.contact}</Text>
      <View style={styles.contacts}>
        <Pressable onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}>
          <Text style={styles.link}>{phone}</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(`mailto:${email}`)}>
          <Text style={styles.link}>{email}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    borderRadius: radius.base,
    padding: spacing.base,
    gap: spacing.xs,
    marginBottom: spacing.base
  },
  head: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  title: {fontSize: fontSize.base, fontWeight: '700', color: '#b91c1c'},
  body: {fontSize: fontSize.sm, color: '#7f1d1d', lineHeight: 20},
  reason: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2
  },
  reasonLabel: {fontSize: fontSize.xs, fontWeight: '700', color: '#7f1d1d'},
  reasonText: {fontSize: fontSize.sm, color: '#7f1d1d', lineHeight: 19},
  contacts: {flexDirection: 'row', gap: spacing.base, flexWrap: 'wrap'},
  link: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#b91c1c',
    textDecorationLine: 'underline'
  }
})
