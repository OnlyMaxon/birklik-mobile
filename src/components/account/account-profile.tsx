import {useState} from 'react'
import {Alert, StyleSheet, Text, View} from 'react-native'

import {validateName, validatePhoneNumber} from '@birklik/core/utils/validators'

import {useAuth} from '@/auth/auth-provider'
import {DeleteAccountSection} from '@/components/account/delete-account'
import {FormField} from '@/components/form-field'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

/**
 * Профиль: имя и телефон.
 *
 * Почта не правится — она и есть учётная запись, её смена требует повторного
 * подтверждения. На сайте так же.
 *
 * Проверки те же, что при регистрации, и из того же общего пакета: расходиться
 * им нельзя, иначе имя, принятое здесь, окажется негодным там.
 */
export function AccountProfile() {
  const {t, language} = useLanguage()
  const {user, profile, updateProfile} = useAuth()

  const [name, setName] = useState(profile?.name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setError('')

    if (!validateName(name)) {
      setError(t.dashboard.fullNameRequired)
      return
    }
    if (!validatePhoneNumber(phone)) {
      setError(
        language === 'en'
          ? 'Invalid phone number'
          : language === 'ru'
            ? 'Неверный номер телефона'
            : 'Yanlış telefon nömrəsi'
      )
      return
    }

    setSaving(true)
    try {
      await updateProfile({name: name.trim(), phone: phone.trim()})
      Alert.alert(t.dashboard.profileUpdated)
    } catch {
      setError(t.dashboard.profileUpdateFailed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <FormField label={t.auth.fullName} value={name} onChangeText={setName} autoCapitalize="words" />
      <FormField label={t.auth.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      <View style={styles.readonly}>
        <Text style={styles.readonlyLabel}>{t.auth.email}</Text>
        <Text style={styles.readonlyValue}>{user?.email}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton title={t.buttons.save} onPress={save} loading={saving} disabled={saving} />

      {/* Удаление аккаунта. Google требует путь к нему изнутри приложения —
          без этого приложение в магазин не выпустят. */}
      <View style={styles.danger}>
        <DeleteAccountSection />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.base},
  // Отделено чертой: это не часть правки профиля, а отдельное необратимое
  // действие, и соседство с кнопкой «Сохранить» здесь было бы опасным.
  danger: {marginTop: spacing.lg, paddingTop: spacing.base, borderTopWidth: 1, borderTopColor: colors.gray200},
  readonly: {
    backgroundColor: colors.gray50,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2
  },
  readonlyLabel: {fontSize: fontSize.xs, color: colors.gray500, fontWeight: '700'},
  readonlyValue: {fontSize: fontSize.sm, color: colors.gray600},
  error: {fontSize: fontSize.sm, color: colors.error}
})
