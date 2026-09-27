import {KeyboardAvoidingView, ScrollView, StyleSheet} from 'react-native'
import {Stack} from 'expo-router'

import {AccountProfile} from '@/components/account/account-profile'
import {useLanguage} from '@/i18n/language-provider'
import {colors, spacing} from '@/theme/theme'

export default function ProfileScreen() {
  const {t} = useLanguage()

  return (
    <>
      <Stack.Screen options={{title: t.dashboard.profile}} />
      <KeyboardAvoidingView
        style={styles.screen}
        // ⚠️ `padding` и на Android тоже. Раньше здесь стояло `undefined`, то есть
        // KeyboardAvoidingView на Android не делал НИЧЕГО, а поле держалось на
        // `windowSoftInputMode="adjustResize"`: система ужимала окно, и разметка
        // по центру сама уезжала вверх. С `edgeToEdgeEnabled=true` окно больше не
        // ужимается — приложение рисует под клавиатурой, и поле пароля уходило
        // под неё. RN 0.86 читает отступы клавиатуры на обеих платформах.
        behavior="padding"
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <AccountProfile />
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  content: {padding: spacing.md, paddingBottom: spacing.xxl}
})
