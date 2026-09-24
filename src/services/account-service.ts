import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  getAuth
} from '@react-native-firebase/auth'

const auth = getAuth()

const CALLABLE = 'https://europe-west1-birklik-65289.cloudfunctions.net/deleteAccount'

export class WrongPasswordError extends Error {
  constructor() {
    super('wrong-password')
    this.name = 'WrongPasswordError'
  }
}

/**
 * Удаление аккаунта вместе со всеми данными.
 *
 * ⚠️ Требование Google, а не наша придумка: приложение с регистрацией обязано
 * давать удалиться изнутри, иначе его не выпустят. Тот же путь есть на сайте —
 * страница `/account-deletion`, её адрес идёт в анкету «Безопасность данных».
 *
 * Чистит **сервер** (`deleteAccount` в firebase-functions). Из приложения это
 * сделать нельзя: правила не дают тронуть ни чужие брони на его объявлениях, ни
 * снимки, загруженные с другого устройства, ни его комментарии и оценки на
 * ЧУЖИХ объявлениях, а `deleteUser` есть только у Admin SDK.
 *
 * ⚠️ Повторный ввод пароля обязателен не для красоты: Firebase отказывает в
 * «чувствительных» действиях, если вход старше пяти минут, а в приложении вход
 * живёт неделями. `reauthenticateWithCredential` обновляет его и заодно служит
 * подтверждением намерения.
 *
 * Обращение прямым POST, а не через `@react-native-firebase/functions`:
 * вызываемая функция — обычный запрос с токеном входа в заголовке, ровно так же
 * устроена проверка покупки в `billing-service.ts`. Ещё один нативный модуль
 * ради этого не нужен, а каждый новый модуль требует пересборки.
 */
export async function deleteAccount(password: string): Promise<void> {
  const user = auth.currentUser
  if (!user?.email) throw new Error('not-authenticated')

  try {
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, password)
    )
  } catch (error) {
    const code = (error as {code?: string})?.code ?? ''
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      throw new WrongPasswordError()
    }
    throw error
  }

  // Токен берём ПОСЛЕ повторного входа: старый мог протухнуть, а у свежего
  // заодно обновлён признак недавней аутентификации.
  const token = await user.getIdToken(true)

  const response = await fetch(CALLABLE, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
    body: JSON.stringify({data: {}})
  })

  const body = (await response.json().catch(() => null)) as
    | {result?: {ok?: boolean}; error?: {status?: string}}
    | null

  if (!response.ok || !body?.result?.ok) {
    throw new Error(body?.error?.status ?? `delete-failed-${response.status}`)
  }

  // Выход отдельно вызывать не нужно и даже вредно: пользователя в Firebase уже
  // нет, и `signOut` может отказать. Состояние входа обнулит сам слушатель
  // `onAuthStateChanged` — токен стал недействительным.
}
