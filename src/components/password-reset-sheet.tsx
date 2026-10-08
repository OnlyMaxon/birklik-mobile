import {useEffect, useState} from 'react'
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'

import {authErrorMessage} from '@birklik/core/utils/auth-errors'

import {FormField} from '@/components/form-field'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import {errorCode} from '@/lib/error-code'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

type Props = {
  visible: boolean
  /** Адрес из формы входа — подставляется, но остаётся видимым и правимым. */
  initialEmail: string
  onSend: (email: string) => Promise<void>
  onClose: () => void
}

/**
 * Окно сброса пароля.
 *
 * ⚠️ Адрес спрашивается ОТДЕЛЬНО, а не берётся молча из формы входа. Раньше
 * приложение брало его из поля над кнопкой и показывало «ссылка отправлена на
 * почту», не называя какую. Выглядело заглушкой: человек не нажимал ничего,
 * относящегося к адресу, и проверить, куда ушло письмо, было нечем.
 *
 * ⚠️ В ответе адрес НАЗЫВАЕТСЯ. Это не украшение: Firebase с включённой защитой
 * от перебора отвечает успехом и на адрес, которого в базе нет вовсе, — иначе
 * по ответу можно было бы выяснять, кто у нас зарегистрирован. Значит «ссылка
 * отправлена» ничего не доказывает, и единственное, чем человек может себе
 * помочь, — увидеть адрес и заметить в нём опечатку.
 *
 * ⚠️ Поэтому же здесь НЕЛЬЗЯ писать «такого аккаунта нет», даже если бы мы это
 * знали: подсказка сломала бы ту самую защиту.
 *
 * Так же устроено на сайте — там это окно поверх формы входа.
 */
export function PasswordResetSheet({visible, initialEmail, onSend, onClose}: Props) {
  const {language, t} = useLanguage()
  const insets = useSafeAreaInsets()

  const [email, setEmail] = useState(initialEmail)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')

  // Окно открывается заново — подхватываем то, что набрано в форме входа, и
  // стираем прошлый ответ: показывать «отправлено на X» поверх нового адреса
  // было бы прямым обманом.
  useEffect(() => {
    if (visible) {
      setEmail(initialEmail)
      setSentTo('')
      setError('')
    }
  }, [visible, initialEmail])

  const send = async () => {
    const address = email.trim()
    if (!address) {
      setError(authErrorMessage('auth/invalid-email', language) ?? t.messages.error)
      return
    }

    setError('')
    setSending(true)
    try {
      await onSend(address)
      setSentTo(address)
    } catch (err) {
      setError(authErrorMessage(errorCode(err), language) ?? t.messages.error)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Нажатие внутри окна не должно его закрывать. */}
        <Pressable style={[styles.sheet, {paddingBottom: insets.bottom + spacing.md}]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={styles.title}>{t.auth.resetPassword}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>{t.buttons.close}</Text>
            </Pressable>
          </View>

          {sentTo ? (
            <View style={styles.done}>
              <Text style={styles.doneText}>{t.auth.resetLinkSent}</Text>
              {/* Адрес отдельной строкой и крупнее: именно его человек и
                  пришёл проверить. */}
              <Text style={styles.doneEmail}>{sentTo}</Text>
              <Text style={styles.doneHint}>{t.auth.resetCheckSpam}</Text>
            </View>
          ) : (
            <>
              <FormField
                label={t.auth.email}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                textContentType="emailAddress"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <PrimaryButton
                title={t.buttons.send}
                onPress={send}
                loading={sending}
                disabled={sending}
              />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end'
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {fontSize: fontSize.lg, fontWeight: '700', color: colors.text},
  close: {fontSize: fontSize.base, color: colors.primary, fontWeight: '600'},
  error: {fontSize: fontSize.sm, color: colors.error},
  done: {gap: spacing.xs, paddingBottom: spacing.sm},
  doneText: {fontSize: fontSize.base, color: colors.text},
  doneEmail: {fontSize: fontSize.base, fontWeight: '700', color: colors.primary},
  doneHint: {fontSize: fontSize.sm, color: colors.neutral, lineHeight: 20}
})
