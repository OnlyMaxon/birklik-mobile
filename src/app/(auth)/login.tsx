import {useState} from 'react'
import {Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'

import {authErrorMessage} from '@birklik/core/utils/auth-errors'

import {useAuth} from '@/auth/auth-provider'
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
      // Куда идти дальше, решает защитный layout: у него есть и признак входа,
      // и подтверждение почты. Отсюда просто уходим назад со стопки экранов.
      router.back()
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
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t.nav.login}</Text>

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

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          title={t.nav.login}
          onPress={submit}
          loading={loading}
          disabled={!email.trim() || !password}
        />

        <Pressable onPress={forgotPassword} style={styles.link}>
          <Text style={styles.linkText}>{t.auth.forgotPassword}</Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable onPress={() => router.replace('/register')} style={styles.link}>
          <Text style={styles.linkText}>{t.nav.register}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  content: {padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl},
  title: {fontSize: fontSize.title, fontWeight: '700', color: colors.text, marginBottom: spacing.sm},
  error: {color: colors.error, fontSize: fontSize.sm},
  link: {alignItems: 'center', paddingVertical: spacing.sm},
  linkText: {color: colors.primary, fontSize: fontSize.sm, fontWeight: '600'},
  divider: {height: 1, backgroundColor: colors.gray200, marginVertical: spacing.sm}
})
