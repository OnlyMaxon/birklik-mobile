import {getApp} from '@react-native-firebase/app'
import {getAuth} from '@react-native-firebase/auth'
import {getFirestore} from '@react-native-firebase/firestore'
import {getStorage} from '@react-native-firebase/storage'
import {initializeAppCheck, ReactNativeFirebaseAppCheckProvider} from '@react-native-firebase/app-check'

/**
 * Подключение к тому же боевому проекту, что и сайт: `birklik-65289`.
 * Настройки берутся из google-services.json, отдельного конфига в коде нет.
 *
 * ⚠️ Взят НАТИВНЫЙ клиент (@react-native-firebase), а не веб-версия firebase.
 * Это не вкусовщина: в проекте включён App Check в режиме enforcement и на
 * Firestore, и на аутентификации. Любой запрос под публичным API-ключом без
 * действительного токена App Check получает 401. Веб-версия SDK умеет получать
 * такой токен только через reCAPTCHA, а она работает лишь в браузере.
 *
 * Отсюда же следует, что **Expo Go не подходит**: нативных модулей Firebase в
 * нём нет. Разработка идёт на собственной сборке (expo-dev-client).
 */

export const app = getApp()
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

let appCheckReady = false

/**
 * Включает App Check. Вызывать ОДИН раз при старте приложения и обязательно
 * ДО первого обращения к Firestore или входу — иначе первые запросы уйдут без
 * токена и вернутся с 401.
 *
 * На вебе эти же грабли уже ловили: App Check должен быть поднят раньше getAuth.
 *
 * Провайдеры разные по платформам и оба требуют регистрации в консоли Firebase:
 * Play Integrity для Android, App Attest для iOS. Пока приложение не
 * зарегистрировано там, в отладочной сборке работает debug-провайдер — он
 * печатает токен в консоль, и этот токен надо внести в консоль руками.
 */
export async function initAppCheck(): Promise<void> {
  if (appCheckReady) return

  const provider = new ReactNativeFirebaseAppCheckProvider()

  // Ветки разделены целиком, а не одним полем debugToken на обе. Причина не в
  // красоте: переменные с приставкой EXPO_PUBLIC_ подставляются в бандл строкой
  // на этапе сборки. Оставь ссылку на токен в общей ветке — и он уедет в
  // боевую сборку тоже, откуда его достанут из файла приложения. А
  // зарегистрированный debug-токен позволяет обойти проверку подлинности
  // вообще. Здесь при __DEV__ === false вся ветка с ним недостижима и
  // выбрасывается сборщиком.
  if (__DEV__) {
    const debugToken = process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN
    provider.configure({
      android: {provider: 'debug', debugToken},
      apple: {provider: 'debug', debugToken}
    })
  } else {
    provider.configure({
      android: {provider: 'playIntegrity'},
      apple: {provider: 'appAttestWithDeviceCheckFallback'}
    })
  }

  await initializeAppCheck(app, {provider, isTokenAutoRefreshEnabled: true})
  appCheckReady = true
}
