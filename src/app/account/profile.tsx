import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet} from 'react-native'
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
