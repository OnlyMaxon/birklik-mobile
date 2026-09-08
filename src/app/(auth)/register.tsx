import {useState} from 'react'
import {Pressable, StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import {authErrorMessage} from '@birklik/core/utils/auth-errors'
import {validateName, validatePhoneNumber} from '@birklik/core/utils/validators'

import {useAuth} from '@/auth/auth-provider'
import {AuthScreen} from '@/components/auth-screen'
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
  const [agreed, setAgreed] = useState(false)
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
    if (!agreed) {
      setError(t.auth.agreeToTermsRequired)
      return
    }
    if (password !== confirm) return fail('form/passwords-do-not-match')
    if (password.length < 6) return fail('auth/weak-password')
    if (!validateName(name)) return fail('auth/invalid-name')
    if (!validatePhoneNumber(phone)) return fail('auth/invalid-phone-number')

    setLoading(true)
    try {
      await signUp(email, password, name, phone)
      // На подтверждение почты, а не на главный: без подтверждения защитный
      // layout всё равно вернёт сюда, и лишний прыжок только мелькнёт.
      router.replace('/verify-email')
    } catch (err) {
      fail(errorCode(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthScreen
      title={t.nav.register}
      footer={
        <Pressable onPress={() => router.replace('/login')} hitSlop={8}>
          <Text style={styles.footerText}>
            {t.auth.hasAccount} <Text style={styles.footerLink}>{t.nav.login}</Text>
          </Text>
        </Pressable>
      }
    >
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

      {/* Согласие с пользовательским соглашением — как на сайте. Ссылка ведёт
          на сам документ в приложении: его текст берётся из общего пакета, то
          есть совпадает с сайтом дословно. */}
      <Pressable style={styles.agreeRow} onPress={() => setAgreed(value => !value)}>
        <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
          {agreed && <Ionicons name="checkmark" size={14} color={colors.white} />}
        </View>
        <Text style={styles.agreeText}>
          {t.auth.agreeToTermsPrefix}
          <Text
            style={styles.agreeLink}
            // Маршрут динамический, поэтому адрес собирается объектом, а не
            // строкой: строковый вид Expo Router для таких не принимает.
            onPress={() => router.push({pathname: '/legal/[page]', params: {page: 'userAgreement'}})}
          >
            {t.auth.agreeToTermsLink}
          </Text>
        </Text>
      </Pressable>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <PrimaryButton
        title={t.nav.register}
        onPress={submit}
        loading={loading}
        // Кнопка заблокирована без галочки — так же, как на сайте: там
        // `disabled={loading || !agreeToTerms}`.
        disabled={!name || !phone || !email || !password || !confirm || !agreed}
      />
    </AuthScreen>
  )
}

const styles = StyleSheet.create({
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1
  },
  checkboxOn: {backgroundColor: colors.primary, borderColor: colors.primary},
  agreeText: {flex: 1, fontSize: fontSize.sm, color: colors.gray700, lineHeight: 20},
  agreeLink: {color: colors.primary, fontWeight: '700'},
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
