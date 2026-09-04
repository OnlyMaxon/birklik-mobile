import {useState} from 'react'
import {Pressable, ScrollView, StyleSheet, Text} from 'react-native'
import {router} from 'expo-router'

import {useAuth} from '@/auth/auth-provider'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, spacing} from '@/theme/theme'

/**
 * Подтверждение почты.
 *
 * Признак `emailVerified` живёт в учётке Firebase и обновляется только при
 * перезапросе токена — сам по себе он не «доедет» после того, как человек
 * нажмёт ссылку в письме. Поэтому здесь есть кнопка проверки: она заново
 * читает состояние учётки.
 *
 * На сайте эта же вещь однажды вышла боком иначе: там подтверждение не
 * доезжало до сессионной куки, и человек оставался неподтверждённым до
 * перевхода. В приложении куки нет, достаточно перечитать учётку.
 */
export default function VerifyEmailScreen() {
  const {t} = useLanguage()
  const {user, emailVerified, resendVerification, signOut} = useAuth()

  const [checking, setChecking] = useState(false)
  const [sent, setSent] = useState(false)

  const check = async () => {
    setChecking(true)
    try {
      await user?.reload()
      // reload обновляет объект учётки на месте; провайдер узнаёт об этом от
      // onAuthStateChanged не всегда, поэтому решение принимаем здесь же.
      if (user?.emailVerified) router.replace('/')
    } catch {
      // Нет сети — просто останемся на экране, состояние не портим.
    } finally {
      setChecking(false)
    }
  }

  const resend = async () => {
    try {
      await resendVerification()
      setSent(true)
    } catch {
      // Слишком частые запросы Firebase отклоняет; отдельного текста для этого
      // не заводим — человек видит, что письмо не пришло, и повторит позже.
    }
  }

  if (emailVerified) {
    router.replace('/')
    return null
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t.auth.verifyEmailTitle}</Text>
      <Text style={styles.body}>{t.auth.verifyEmailBody}</Text>
      {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}

      <PrimaryButton title={t.auth.verifyEmailCheck} onPress={check} loading={checking} />

      <Pressable onPress={resend} style={styles.link} disabled={sent}>
        <Text style={[styles.linkText, sent && styles.linkTextMuted]}>
          {sent ? t.auth.verifyEmailSent : t.auth.verifyEmailResend}
        </Text>
      </Pressable>

      <Pressable onPress={signOut} style={styles.link}>
        <Text style={styles.linkMuted}>{t.buttons.logout}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.base,
    backgroundColor: colors.white
  },
  title: {fontSize: fontSize.xxl, fontWeight: '700', color: colors.text, textAlign: 'center'},
  body: {fontSize: fontSize.base, color: colors.gray600, textAlign: 'center', lineHeight: 22},
  email: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.base
  },
  link: {alignItems: 'center', paddingVertical: spacing.sm},
  linkText: {color: colors.primary, fontSize: fontSize.sm, fontWeight: '600'},
  linkTextMuted: {color: colors.gray400},
  linkMuted: {color: colors.neutral, fontSize: fontSize.sm}
})
