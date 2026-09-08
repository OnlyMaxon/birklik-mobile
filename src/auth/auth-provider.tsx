import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import {AppState} from 'react-native'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User
} from '@react-native-firebase/auth'
import {doc, getDoc, setDoc} from '@react-native-firebase/firestore'

import {auth, db} from '@/lib/firebase'

/**
 * Вход в приложении.
 *
 * Устроен проще, чем на сайте, и намеренно. Там после входа клиент меняет
 * idToken на сессионную куку — она нужна серверному рендеру, чтобы страницы
 * под защитой знали пользователя ещё до отрисовки. Здесь сервера нет: SDK сам
 * хранит вход между запусками и обновляет токен, менять его не на что.
 *
 * Отсюда же исчезает целый класс граблей сайта: там кука и клиентский SDK
 * могли разойтись во мнении, кто вошёл, и страницы перекидывали друг на друга
 * по кругу. Двух источников истины здесь нет.
 */

export interface Profile {
  id: string
  name: string
  email: string
  phone: string
  avatar?: string
}

interface AuthValue {
  user: User | null
  profile: Profile | null
  /** null пока неизвестно — первая проверка входа асинхронна. */
  loading: boolean
  emailVerified: boolean
  /**
   * Перечитывает учётку у Firebase и возвращает свежий признак подтверждения.
   *
   * Нужна потому, что `emailVerified` не приходит сам: человек подтверждает
   * почту в браузере, а приложение об этом никак не узнаёт — ни события, ни
   * обновления токена не происходит.
   */
  refreshUser: () => Promise<boolean>
  /** Право модератора живёт в заявке токена, а не в документе профиля. */
  isModerator: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string, phone: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  resendVerification: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

function avatarFor(name: string): string {
  // Тот же способ, что на сайте, чтобы аватар совпадал у одного человека
  // в приложении и в браузере.
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a365d&color=fff`
}

export function AuthProvider({children}: {children: ReactNode}) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isModerator, setIsModerator] = useState(false)
  // ⚠️ Подтверждение почты держим ОТДЕЛЬНЫМ состоянием, а не читаем из
  // `user.emailVerified`.
  //
  // `reload()` обновляет объект учётки НА МЕСТЕ: поле внутри меняется, а ссылка
  // остаётся прежней. React такого не замечает, перерисовки нет — и приложение
  // считало человека неподтверждённым даже после успешной проверки. Ровно на
  // это и наткнулись: почту подтвердили, а приложение не подхватило.
  const [emailVerified, setEmailVerified] = useState(false)

  const refreshUser = useCallback(async () => {
    const current = auth.currentUser
    if (!current) return false
    try {
      await current.reload()
      setEmailVerified(current.emailVerified)
      return current.emailVerified
    } catch {
      // Нет сети — оставляем как есть, врать в обе стороны нельзя.
      return emailVerified
    }
  }, [emailVerified])

  // Проверяем при каждом возврате в приложение. Это и есть боевой случай:
  // человек уходит в почту, жмёт ссылку и возвращается — событий от Firebase
  // при этом не приходит, узнать можно только спросив.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && auth.currentUser && !auth.currentUser.emailVerified) {
        void refreshUser()
      }
    })
    return () => subscription.remove()
  }, [refreshUser])

  useEffect(() => {
    return onAuthStateChanged(auth, async current => {
      setUser(current)
      setEmailVerified(current?.emailVerified ?? false)

      if (!current) {
        setProfile(null)
        setIsModerator(false)
        setLoading(false)
        return
      }

      // Заявка приезжает в токене. Поле isModerator в документе профиля
      // существует, но им пользуется только серверная рассылка жалоб — правом
      // оно не является, и доверять ему нельзя.
      try {
        const token = await current.getIdTokenResult()
        setIsModerator(token.claims?.moderator === true)
      } catch {
        setIsModerator(false)
      }

      // Профиль лежит отдельным документом: имя и телефон в учётке Firebase не
      // хранятся. Правила пускают к нему только его владельца и модератора.
      try {
        const snapshot = await getDoc(doc(db, 'users', current.uid))
        const data = snapshot.data() ?? {}
        setProfile({
          id: current.uid,
          name: (data.name as string) || current.displayName || '',
          email: current.email ?? '',
          phone: (data.phone as string) || '',
          avatar: data.avatar as string | undefined
        })
      } catch {
        // Документа может не быть, если регистрация оборвалась между созданием
        // учётки и записью профиля. Вход при этом действителен — показываем
        // то, что знаем из учётки, вместо того чтобы выкидывать человека.
        setProfile({
          id: current.uid,
          name: current.displayName || '',
          email: current.email ?? '',
          phone: ''
        })
      }

      setLoading(false)
    })
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      profile,
      loading,
      emailVerified,
      refreshUser,
      isModerator,

      signIn: async (email, password) => {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      },

      signUp: async (email, password, name, phone) => {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
        const displayName = name.trim()

        await updateProfile(credential.user, {displayName})
        await sendEmailVerification(credential.user)

        // Профиль пишет сам клиент — на сайте это делает сервер под
        // сервис-аккаунтом, здесь сервера нет. Правила такую запись разрешают:
        // идентификатор документа обязан совпадать с вошедшим, а признаки
        // модератора в теле запрещены.
        await setDoc(doc(db, 'users', credential.user.uid), {
          name: displayName,
          // Почту берём из учётки, а не из формы: там она уже приведена
          // Firebase к каноническому виду.
          email: credential.user.email ?? '',
          phone: phone.trim(),
          avatar: avatarFor(displayName),
          createdAt: new Date().toISOString()
        })
      },

      signOut: async () => {
        await firebaseSignOut(auth)
      },

      resetPassword: async email => {
        await sendPasswordResetEmail(auth, email.trim())
      },

      resendVerification: async () => {
        if (auth.currentUser) await sendEmailVerification(auth.currentUser)
      }
    }),
    [user, profile, loading, emailVerified, refreshUser, isModerator]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth вызван вне AuthProvider')
  return value
}
