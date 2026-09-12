import {useEffect, useState} from 'react'
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native'
import {Stack} from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import {StatusBar} from 'expo-status-bar'
import {SafeAreaProvider} from 'react-native-safe-area-context'

import {AuthProvider} from '@/auth/auth-provider'
import {AccountButton} from '@/components/account-button'
import {HeaderLogo} from '@/components/header-logo'
import {LanguageSwitch} from '@/components/language-switch'
import {NotificationsButton} from '@/components/notifications-button'
import {PushRegistrar} from '@/components/push-registrar'
import {LanguageProvider} from '@/i18n/language-provider'
import {initAppCheck} from '@/lib/firebase'
import {colors, fontSize, spacing} from '@/theme/theme'

// Заставкой распоряжаемся сами, а не полагаемся на автоскрытие.
//
// Ниже мы намеренно держим первый экран до готовности App Check. При
// автоскрытии заставка уходит по первой отрисовке, то есть человек успевал бы
// увидеть голый крутящийся кружок между логотипом и содержимым. Теперь логотип
// висит ровно до момента, когда есть что показать.
//
// Вызов на уровне модуля, до первой отрисовки: позже уже поздно. Отказ гасится
// намеренно — на этом месте исключение оставило бы приложение без интерфейса.
SplashScreen.preventAutoHideAsync().catch(() => undefined)

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
      // Заставка уходит в обоих случаях: и когда всё хорошо, и когда App Check
      // не поднялся. Иначе сообщение об ошибке осталось бы под ней, и вместо
      // объяснения человек смотрел бы на застывший логотип.
      .finally(() => {
        void SplashScreen.hideAsync().catch(() => undefined)
      })
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
          {/* Шапка светлая, поэтому и значки строки состояния тёмные. */}
          <StatusBar style="dark" />
          {/* Пуши: регистрация токена и переходы по нажатию. Ничего не рисует,
              но обязан быть внутри AuthProvider — токен пишется в профиль. */}
          <PushRegistrar />
          <Stack
            screenOptions={{
              // Шапка белая с серой чертой снизу — как `.header` на сайте.
              // Раньше она была зелёной: приложение и сайт выглядели разными
              // продуктами, а на зелёном фоне не имели смысла ни серая обводка
              // кнопки языка, ни тёмные буквы на ней.
              headerStyle: {backgroundColor: colors.white},
              headerTintColor: colors.text,
              headerTitleStyle: {fontWeight: '600', color: colors.text},
              headerShadowVisible: true,
              contentStyle: {backgroundColor: colors.background},
              // Язык, уведомления и учётная запись в шапке на всех экранах.
              // Отдельного раздела настроек нет, кабинет открывается той же
              // кнопкой. Порядок как на сайте: язык, колокольчик, учётная запись.
              headerRight: () => (
                <View style={styles.headerActions}>
                  <LanguageSwitch />
                  <NotificationsButton />
                  <AccountButton />
                </View>
              )
            }}
          >
            <Stack.Screen
              name="index"
              options={{
                // Логотип вместо надписи — как в шапке сайта.
                headerTitle: () => <HeaderLogo />,
                headerTitleAlign: 'left',
                // ⚠️ Стрелка «назад» на главном экране обязана отсутствовать.
                // Expo Router рисует её, если в стопке что-то есть, — а после
                // прогулки по объявлениям она там всегда есть. Возвращаться с
                // главного некуда: это корень, и стрелка обманывала.
                headerBackVisible: false,
                headerLeft: () => null
              }}
            />
            {/* Заголовок ставит сама страница — там название объявления. */}
            <Stack.Screen name="property/[id]" options={{title: ''}} />
            <Stack.Screen name="account" options={{title: ''}} />
            <Stack.Screen name="notifications" options={{title: ''}} />
            {/* Модераторка. Право проверяется на самом экране по заявке из
                токена — маршрут скрывать бессмысленно, решают правила. */}
            <Stack.Screen name="moderation" options={{title: ''}} />
            {/* Страницы из подвала сайта. Заголовок ставит сама страница — он
                зависит от того, какой документ открыт. */}
            <Stack.Screen name="legal/[page]" options={{title: ''}} />
            {/* Вход и регистрация приходят листом поверх содержимого: человек
                попадает сюда из середины работы и должен вернуться туда же. */}
            {/* На самих экранах входа в шапке остаётся только выбор языка.
                Кнопка «Войти» там предлагала бы войти на экране входа, а
                колокольчик и учётная запись гостю всё равно ни к чему. */}
            <Stack.Screen
              name="(auth)/login"
              options={{presentation: 'modal', title: '', headerRight: () => <LanguageSwitch />}}
            />
            <Stack.Screen
              name="(auth)/register"
              options={{presentation: 'modal', title: '', headerRight: () => <LanguageSwitch />}}
            />
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
