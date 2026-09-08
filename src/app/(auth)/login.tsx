import {useState} from 'react'
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'

import {authErrorMessage} from '@birklik/core/utils/auth-errors'

import {useAuth} from '@/auth/auth-provider'
import {AuthScreen} from '@/components/auth-screen'
import {FormField} from '@/components/form-field'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import {errorCode} from '@/lib/error-code'
import {colors, fontSize, spacing} from '@/theme/theme'

export default function LoginScreen() {
  const {language, t} = useLanguage()
  const {signIn, resetPassword} = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      // ⚠️ На главный, а не `router.back()`.
      //
      // Раньше уходили назад по стопке — то есть туда, откуда человек нажал
      // «Войти». Из середины прогулки по объявлениям это выглядело так, будто
      // вход ничего не изменил. Теперь после успеха сразу витрина, с
      // `replace` — чтобы кнопкой «назад» не вернуться в форму входа.
      //
      // Неподтверждённую почту перехватит защитный layout: он видит и вход, и
      // подтверждение, и уведёт на свой экран сам.
      router.replace('/')
    } catch (err) {
      setError(authErrorMessage(errorCode(err), language) ?? t.messages.error)
    } finally {
      setLoading(false)
    }
  }

  const forgotPassword = async () => {
    if (!email.trim()) {
      setError(authErrorMessage('auth/invalid-email', language) ?? t.messages.error)
      return
    }
    try {
      await resetPassword(email)
      Alert.alert(t.auth.resetPassword, t.auth.resetLinkSent)
    } catch (err) {
      setError(authErrorMessage(errorCode(err), language) ?? t.messages.error)
    }
  }

  return (
    <AuthScreen
      title={t.nav.login}
      footer={
        <Pressable onPress={() => router.replace('/register')} hitSlop={8}>
          <Text style={styles.footerText}>
            {t.auth.noAccount} <Text style={styles.footerLink}>{t.nav.register}</Text>
          </Text>
        </Pressable>
      }
    >
      <FormField
        label={t.auth.email}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress"
      />

      <FormField
        label={t.auth.password}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        textContentType="password"
      />

      <Pressable onPress={forgotPassword} style={styles.forgot} hitSlop={8}>
        <Text style={styles.forgotText}>{t.auth.forgotPassword}</Text>
      </Pressable>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <PrimaryButton
        title={t.nav.login}
        onPress={submit}
        loading={loading}
        disabled={!email.trim() || !password}
      />
    </AuthScreen>
  )
}

const styles = StyleSheet.create({
  forgot: {alignSelf: 'flex-end', paddingVertical: 2},
  forgotText: {color: colors.primary, fontSize: fontSize.sm, fontWeight: '600'},
  errorBox: {
    backgroundColor: '#fdecea',
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    padding: spacing.sm
  },
  errorText: {color: colors.error, fontSize: fontSize.sm, textAlign: 'center'},
  footerText: {color: colors.neutral, fontSize: fontSize.sm},
  footerLink: {color: colors.primary, fontWeight: '700'}
})
