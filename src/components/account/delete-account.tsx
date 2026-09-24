import {useState} from 'react'
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'

import {FormField} from '@/components/form-field'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import {deleteAccount, WrongPasswordError} from '@/services/account-service'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

/**
 * Удаление аккаунта из приложения.
 *
 * ⚠️ Требование Google для выхода в магазин: приложение с регистрацией обязано
 * давать удалиться изнутри. Второй обязательный путь — общедоступная страница
 * сайта `/account-deletion`, её адрес идёт в анкету «Безопасность данных».
 *
 * Два шага намеренно. Сначала свёрнутая ссылка, и только по нажатию —
 * подтверждение с паролем: действие необратимо, и случайное касание в списке
 * настроек стоить аккаунта не должно. Пароль здесь не формальность, Firebase и
 * сам откажет — вход в приложении живёт неделями, а он требует свежего.
 */
export function DeleteAccountSection() {
  const {t, language} = useLanguage()
  const content = t.pages.accountDeletion

  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      await deleteAccount(password)
      // Уводим на главную до сообщения: экраны кабинета читают профиль, а его
      // больше нет — остаться здесь значит показать пустые поля и ошибки чтения.
      router.replace('/')
      Alert.alert(content.doneTitle, content.doneText)
    } catch (err) {
      setError(err instanceof WrongPasswordError ? content.wrongPassword : content.failed)
      setBusy(false)
    }
  }

  const confirm = () => {
    Alert.alert(content.title, content.warning, [
      {text: t.buttons.cancel, style: 'cancel'},
      {text: content.deleteButton, style: 'destructive', onPress: run}
    ])
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={({pressed}) => [styles.link, pressed && styles.linkPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.linkText}>{content.title}</Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>{content.title}</Text>
      <Text style={styles.body}>{content.whatTitle}</Text>
      {content.items.map(item => (
        <Text key={item} style={styles.item}>
          {'•'} {item}
        </Text>
      ))}
      <Text style={styles.note}>{content.bookingsNote}</Text>
      <Text style={styles.note}>{content.paymentsNote}</Text>
      <Text style={styles.warning}>{content.warning}</Text>

      <FormField
        label={content.passwordLabel}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        editable={!busy}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        title={content.deleteButton}
        onPress={confirm}
        loading={busy}
        disabled={busy || password.length === 0}
        style={styles.danger}
      />

      <Pressable onPress={() => setOpen(false)} disabled={busy} style={styles.cancel}>
        <Text style={styles.cancelText}>
          {language === 'en' ? 'Cancel' : language === 'ru' ? 'Отмена' : 'Ləğv et'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  // Приглушённая ссылка: путь к удалению обязан быть на виду, но подталкивать
  // к нему нечего.
  link: {alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.base},
  linkPressed: {opacity: 0.6},
  linkText: {fontSize: fontSize.sm, color: colors.gray500, textDecorationLine: 'underline'},

  panel: {
    gap: spacing.sm,
    padding: spacing.base,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.white
  },
  heading: {fontSize: fontSize.base, fontWeight: '700', color: colors.text},
  body: {fontSize: fontSize.sm, fontWeight: '600', color: colors.gray700},
  item: {fontSize: fontSize.sm, color: colors.gray600, lineHeight: 20},
  note: {fontSize: fontSize.xs, color: colors.gray500, lineHeight: 18},
  warning: {fontSize: fontSize.sm, fontWeight: '700', color: colors.error, lineHeight: 20},
  error: {fontSize: fontSize.sm, color: colors.error},
  danger: {backgroundColor: colors.error},
  cancel: {alignSelf: 'center', paddingVertical: spacing.sm},
  cancelText: {fontSize: fontSize.sm, color: colors.gray500}
})
