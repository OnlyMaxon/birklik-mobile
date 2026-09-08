import {useEffect, useRef, useState} from 'react'
import {AppState, Pressable, StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import {useAuth} from '@/auth/auth-provider'
import {AuthScreen} from '@/components/auth-screen'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

// Как на сайте: пока экран открыт, состояние учётки перечитывается раз в три
// секунды. Человек подтверждает почту в браузере и возвращается — приложение
// должно пустить его дальше само, а не ждать нажатия кнопки.
const POLL_MS = 3000

/**
 * Подтверждение почты.
 *
 * ⚠️ Признак `emailVerified` не приезжает сам: ни события, ни обновления
 * токена при подтверждении не происходит. Узнать можно только перечитав учётку,
 * поэтому здесь три способа сразу — опрос по таймеру, проверка при возврате в
 * приложение и кнопка вручную.
 *
 * Обновлением состояния ведает провайдер: `reload()` меняет объект учётки на
 * месте, и без отдельного состояния перерисовки бы не случилось. Именно из-за
 * этого подтверждённая почта однажды не подхватилась вовсе.
 */
export default function VerifyEmailScreen() {
  const {t} = useLanguage()
  const {user, emailVerified, refreshUser, resendVerification, signOut} = useAuth()

  const [checking, setChecking] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // Опрос и возврат в приложение. Оба останавливаются, как только подтверждение
  // получено, — дальше спрашивать не о чем.
  const verified = useRef(emailVerified)
  verified.current = emailVerified

  useEffect(() => {
    if (emailVerified) return

    const timer = setInterval(() => {
      if (!verified.current) void refreshUser()
    }, POLL_MS)

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && !verified.current) void refreshUser()
    })

    return () => {
      clearInterval(timer)
      subscription.remove()
    }
  }, [emailVerified, refreshUser])

  // Переход отдельным эффектом, а не прямо в отрисовке: менять маршрут во время
  // отрисовки нельзя — навигация ругается, а на сайте на таком уже горели.
  useEffect(() => {
    if (emailVerified) router.replace('/')
  }, [emailVerified])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const check = async () => {
    setChecking(true)
    try {
      await refreshUser()
    } finally {
      setChecking(false)
    }
  }

  const resend = async () => {
    if (cooldown > 0) return
    try {
      await resendVerification()
      setSent(true)
      // Минута — тот же запрет на повтор, что на сайте. Firebase иначе начнёт
      // отвечать отказом «слишком много запросов», и письмо не придёт вовсе.
      setCooldown(60)
    } catch {
      // Отдельного текста не заводим: человек видит, что письмо не пришло.
    }
  }

  return (
    <AuthScreen
      title={t.auth.verifyEmailTitle}
      subtitle={t.auth.verifyEmailBody}
      footer={
        <Pressable onPress={signOut} hitSlop={8}>
          <Text style={styles.muted}>{t.buttons.logout}</Text>
        </Pressable>
      }
    >
      <View style={styles.badge}>
        <Ionicons name="mail-outline" size={30} color={colors.primary} />
      </View>

      {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}

      <PrimaryButton title={t.auth.verifyEmailCheck} onPress={check} loading={checking} />

      <Pressable onPress={resend} disabled={cooldown > 0} style={styles.link} hitSlop={8}>
        <Text style={[styles.linkText, cooldown > 0 && styles.linkTextMuted]}>
          {cooldown > 0
            ? `${t.auth.verifyEmailResend} · ${cooldown}`
            : sent
              ? t.auth.verifyEmailSent
              : t.auth.verifyEmailResend}
        </Text>
      </Pressable>
    </AuthScreen>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200,
    alignItems: 'center',
    justifyContent: 'center'
  },
  email: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center'
  },
  link: {alignItems: 'center', paddingVertical: spacing.xs, borderRadius: radius.sm},
  linkText: {color: colors.primary, fontSize: fontSize.sm, fontWeight: '600'},
  linkTextMuted: {color: colors.gray400},
  muted: {color: colors.neutral, fontSize: fontSize.sm}
})
