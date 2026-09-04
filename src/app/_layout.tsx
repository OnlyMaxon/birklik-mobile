import {useEffect, useState} from 'react'
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native'
import {Stack} from 'expo-router'
import {StatusBar} from 'expo-status-bar'
import {SafeAreaProvider} from 'react-native-safe-area-context'

import {AuthProvider} from '@/auth/auth-provider'
import {AccountButton} from '@/components/account-button'
import {LanguageSwitch} from '@/components/language-switch'
import {LanguageProvider} from '@/i18n/language-provider'
import {initAppCheck} from '@/lib/firebase'
import {colors, fontSize, spacing} from '@/theme/theme'

// Тёмная тема пока не делается: на вебе её нет, а разъезжаться в оформлении
// двум приложениям одного продукта нельзя. В app.json стоит
// userInterfaceStyle: "light" — приложение не следует за системой.
export default function RootLayout() {
  // App Check поднимается ДО первого экрана. В проекте включён enforcement, и
  // запрос, ушедший раньше токена, вернётся с 401 — на вебе на этом уже горели.
  // Поэтому не «запустили и поехали», а именно ждём.
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    initAppCheck()
      .then(() => setReady(true))
      .catch(() => setFailed(true))
  }, [])

  if (failed) {
    // Молча пускать дальше нельзя: без App Check не откроется ни один экран с
    // данными, и пользователь увидит пустоту вместо объяснения.
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Не удалось подключиться к серверу</Text>
        <Text style={styles.hint}>Проверьте соединение и перезапустите приложение</Text>
      </View>
    )
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: {backgroundColor: colors.primary},
              headerTintColor: colors.white,
              headerTitleStyle: {fontWeight: '600'},
              contentStyle: {backgroundColor: colors.background},
              // Язык и учётная запись в шапке на всех экранах. Отдельного раздела
              // настроек нет, а кабинет открывается той же кнопкой.
              headerRight: () => (
                <View style={styles.headerActions}>
                  <LanguageSwitch />
                  <AccountButton />
                </View>
              )
            }}
          >
            <Stack.Screen name="index" options={{title: 'Birklik.az'}} />
            {/* Заголовок ставит сама страница — там название объявления. */}
            <Stack.Screen name="property/[id]" options={{title: ''}} />
            <Stack.Screen name="account" options={{title: ''}} />
            <Stack.Screen name="notifications" options={{title: ''}} />
            {/* Вход и регистрация приходят листом поверх содержимого: человек
                попадает сюда из середины работы и должен вернуться туда же. */}
            <Stack.Screen name="(auth)/login" options={{presentation: 'modal', title: ''}} />
            <Stack.Screen name="(auth)/register" options={{presentation: 'modal', title: ''}} />
            {/* Подтверждение почты жестом не закрыть: пока оно не пройдено,
                уходить с него некуда. */}
            <Stack.Screen
              name="(auth)/verify-email"
              options={{headerShown: false, gestureEnabled: false}}
            />
          </Stack>
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.sm
  },
  error: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.error,
    textAlign: 'center'
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.neutral,
    textAlign: 'center'
  }
})
