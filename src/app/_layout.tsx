import {useEffect, useState} from 'react'
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native'
import {Stack} from 'expo-router'
import {StatusBar} from 'expo-status-bar'
import {SafeAreaProvider} from 'react-native-safe-area-context'

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
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {backgroundColor: colors.primary},
          headerTintColor: colors.white,
          headerTitleStyle: {fontWeight: '600'},
          contentStyle: {backgroundColor: colors.background}
        }}
      >
        <Stack.Screen name="index" options={{title: 'Birklik.az'}} />
      </Stack>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
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
