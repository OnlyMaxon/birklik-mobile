import {useState} from 'react'
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text} from 'react-native'
import {router} from 'expo-router'

import {authErrorMessage} from '@birklik/core/utils/auth-errors'
import {validateName, validatePhoneNumber} from '@birklik/core/utils/validators'

import {useAuth} from '@/auth/auth-provider'
import {FormField} from '@/components/form-field'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import {errorCode} from '@/lib/error-code'
import {colors, fontSize, spacing} from '@/theme/theme'

export default function RegisterScreen() {
  const {language, t} = useLanguage()
  const {signUp} = useAuth()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fail = (code: string) => {
    setError(authErrorMessage(code, language) ?? t.messages.error)
  }

  const submit = async () => {
    setError('')

    // Проверки идут ДО создания учётки — тот же порядок, что на сайте, и по той
    // же причине: отклони мы имя или телефон после создания, учётка уже
    // существует, и повторная попытка упрётся в «почта занята». Человек не
    // сможет зарегистрироваться вообще.
    if (password !== confirm) return fail('form/passwords-do-not-match')
    if (password.length < 6) return fail('auth/weak-password')
    if (!validateName(name)) return fail('auth/invalid-name')
    if (!validatePhoneNumber(phone)) return fail('auth/invalid-phone-number')

    setLoading(true)
    try {
      await signUp(email, password, name, phone)
      router.replace('/verify-email')
    } catch (err) {
      fail(errorCode(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t.nav.register}</Text>

        <FormField
          label={t.auth.fullName}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          textContentType="name"
        />

        <FormField
          label={t.auth.phone}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />

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
          textContentType="newPassword"
        />

        <FormField
          label={t.auth.confirmPassword}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton
          title={t.nav.register}
          onPress={submit}
          loading={loading}
          disabled={!name || !phone || !email || !password || !confirm}
        />

        <Pressable onPress={() => router.replace('/login')} style={styles.link}>
          <Text style={styles.linkText}>
            {t.auth.hasAccount} {t.nav.login}
          </Text>
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
  linkText: {color: colors.primary, fontSize: fontSize.sm, fontWeight: '600'}
})
