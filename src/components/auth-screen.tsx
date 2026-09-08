import {type ReactNode} from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import {Image} from 'expo-image'

import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  title: string
  subtitle?: string
  children: ReactNode
  /** Ссылки под карточкой: «нет учётной записи», «выйти» и подобное. */
  footer?: ReactNode
}

/**
 * Общая обёртка экранов входа, регистрации и подтверждения почты.
 *
 * Раньше каждый из трёх рисовал заголовок и поля сам, без логотипа и без
 * карточки — выглядело голо. Здесь повторено устройство `.auth-page` с сайта:
 * светлая подложка, логотип сверху, содержимое в карточке с тенью.
 *
 * Подложка сплошная, а не тремя градиентами, как в CSS: радиальные заливки в
 * React Native требуют отдельной библиотеки с нативной частью, а вклад их в
 * узкий экран телефона неразличим.
 */
export function AuthScreen({title, subtitle, children, footer}: Props) {
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require('@/assets/images/logo.png')}
          style={styles.logo}
          contentFit="contain"
        />

        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>

          <View style={styles.body}>{children}</View>
        </View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.gray50},
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.lg
  },
  logo: {width: 190, height: 190 / 4},
  card: {
    width: '100%',
    maxWidth: 420,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200,
    ...shadow.base
  },
  header: {alignItems: 'center', marginBottom: spacing.lg, gap: spacing.xs},
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center'
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.neutral,
    textAlign: 'center',
    lineHeight: 20
  },
  body: {gap: spacing.base},
  footer: {alignItems: 'center', gap: spacing.sm}
})
