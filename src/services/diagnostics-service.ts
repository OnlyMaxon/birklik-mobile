import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import {Platform} from 'react-native'

import {auth} from '@/lib/firebase'

/**
 * Донесение о том, чем кончилась подача объявления.
 *
 * ## Откуда это взялось
 *
 * 2026-11-21 человек с 17 действующими объявлениями дважды не смог подать
 * восемнадцатое. Разбор занял двое суток, и восстановить ход событий удалось
 * только по именам и времени загруженных фотографий, оставшихся в хранилище:
 * самой ошибки не было нигде. В `account/add.tsx` стоял `catch` без переменной —
 * приложение читало причину отказа и выбрасывало её, — а на сервере записи не
 * возникало вовсе, потому что объявление пишется в базу напрямую с устройства и
 * между приложением и Firestore нет ни одной нашей функции.
 *
 * ## Два решения, без которых всё это бесполезно
 *
 * ⚠️ **Код придумывает УСТРОЙСТВО, а не сервер.** Человек должен увидеть код
 * сразу, в том же окне, — в том числе когда донесение до нас не доехало. А не
 * доезжает оно ровно в самом интересном случае: когда беда в связи. Получи код
 * с сервера — и при обрыве человеку нечего было бы нам назвать.
 *
 * ⚠️ **Не доехавшее донесение не теряется.** Оно кладётся в память телефона и
 * дошлётся при следующем запуске (`flushPendingReports`). Иначе мы знали бы
 * только о тех отказах, при которых связь была, то есть именно не о тех, что
 * нужны.
 *
 * Отправка НИКОГДА не бросает исключение и никогда не заставляет ждать: вторая
 * ошибка поверх первой подменила бы человеку настоящую причину.
 */

/** Вызываемая функция. Обычный POST с токеном входа — так же, как в `billing-service`. */
const CALLABLE =
  'https://europe-west1-birklik-65289.cloudfunctions.net/reportClientError'

/** Очередь недоехавших донесений. */
const QUEUE_KEY = 'birklik:pending-reports'
/** Дальше очередь не растёт: сломанное приложение не должно копить мегабайты. */
const QUEUE_LIMIT = 20

/**
 * Буквы кода. Без `I`, `O`, `0`, `1` намеренно: код человек читает вслух по
 * телефону, а эти четыре знака на слух и на вид не отличить друг от друга.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Почему подача не удалась — на этом же ключе стоит текст для человека. */
export type FailureCause =
  | 'leftApp'
  | 'signedOut'
  | 'photo'
  | 'network'
  | 'rights'
  | 'unknown'

export type SubmitStep = 'location' | 'photos' | 'saving' | 'payment'

export interface SubmitOutcome {
  outcome: 'success' | 'error'
  /** На каком шаге закончилось. */
  step?: SubmitStep
  photosTotal?: number
  photosDone?: number
  durationMs?: number
  /** Выходил ли человек из приложения во время подачи — см. `use-watermark`. */
  backgrounded?: boolean
  /**
   * Сколько раз отправка снимка срывалась и начиналась заново (`uploadOne`).
   *
   * ⚠️ Ноль здесь при успехе — не пустая графа, а ответ: повторы не понадобились.
   * Число больше нуля при успехе означает, что подача доехала ТОЛЬКО благодаря
   * им; число при отказе означает, что повтор не спас и причина глубже.
   */
  retries?: number
  /** Чем сорвалась последняя попытка: `код@снимок/попытка`. */
  retryCode?: string
  tier?: string
  /** Номер объявления — при успехе. */
  propertyId?: string
  /** Код записи, уже показанный человеку. */
  code: string
  cause?: FailureCause
  errorName?: string
  errorCode?: string
  errorMessage?: string
}

/** `ELAN-7F3K`. Приставка одна на подачу объявления — других потоков пока нет. */
export function newReportCode(prefix = 'ELAN'): string {
  let tail = ''
  for (let i = 0; i < 4; i += 1) {
    tail += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `${prefix}-${tail}`
}

const codeOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && typeof (error as {code?: unknown}).code === 'string'
    ? ((error as {code: string}).code)
    : ''

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : ''

/**
 * Во что превратить отказ, чтобы человеку можно было сказать правду.
 *
 * ⚠️ Порядок проверок значим. Водяной знак проверяется ПЕРВЫМ: его отказ приходит
 * изнутри загрузки снимков, и общая ветка «что-то с фото» съела бы единственную
 * причину, которую мы умеем назвать точно.
 */
export function classifyFailure(error: unknown): FailureCause {
  const code = codeOf(error)
  const message = messageOf(error)
  const both = `${code} ${message}`.toLowerCase()

  if (both.includes('watermark')) return 'leftApp'
  if (both.includes('not-authenticated') || code.startsWith('auth/')) return 'signedOut'
  if (code === 'unauthenticated') return 'signedOut'

  // Отказ по правам неотличим от отказа App Check — и тот и другой приходят
  // как `permission-denied`. Человеку в обоих случаях нужно одно и то же:
  // «мы не смогли сохранить, напишите нам», а не совет про интернет.
  if (code === 'permission-denied' || code === 'storage/unauthorized') return 'rights'

  if (
    both.includes('network') ||
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'storage/retry-limit-exceeded'
  ) {
    return 'network'
  }

  if (code.startsWith('storage/') || both.includes('image')) return 'photo'

  return 'unknown'
}

/**
 * Всё, что об отказе можно сказать, одним вызовом: и причина для человека, и
 * подробности для нас.
 *
 * ⚠️ `cause` водяного знака отдаётся и в `errorCode` тоже, когда своего кода у
 * ошибки нет. Иначе в донесении осталось бы только слово `Error`, а именно это и
 * было главной бедой разбора 21 ноября.
 */
export function describeFailure(error: unknown): {
  cause: FailureCause
  errorName?: string
  errorCode?: string
  errorMessage?: string
} {
  const message = messageOf(error)
  const code = codeOf(error)
  const inner = (error as {cause?: unknown} | null)?.cause
  return {
    cause: classifyFailure(error),
    errorName: error instanceof Error ? error.name : typeof error,
    errorCode: code || message || undefined,
    // Вложенная причина дописывается, когда есть: отказ знака несёт внутри
    // настоящую ошибку снятия кадра, и без неё непонятно, что именно не вышло.
    errorMessage: inner ? `${message} <- ${messageOf(inner) || codeOf(inner)}` : message || undefined
  }
}

interface Envelope extends SubmitOutcome {
  flow: 'add-listing'
  source: 'app'
  platform: string
  osVersion: string | null
  device: string | null
  appVersion: string | null
  build: string | null
}

/**
 * ⚠️ Версия и номер сборки берутся из `app.json`, а не из нативной части. На
 * андроиде нативный `versionCode` живёт в `android/app/build.gradle`, которого
 * нет в гите и который правится руками, — то есть эти два числа МОГУТ
 * разойтись, и тогда донесение соврёт о сборке. Поднимая версию, поднимать надо
 * в обоих местах; `expo-application`, который умеет читать нативное значение, в
 * проекте не стоит, и тащить его ради одного поля незачем.
 */
function describeBuild(): Pick<Envelope, 'appVersion' | 'build'> {
  const config = Constants.expoConfig
  const build =
    Platform.OS === 'ios'
      ? config?.ios?.buildNumber ?? null
      : config?.android?.versionCode != null
        ? String(config.android.versionCode)
        : null
  return {appVersion: config?.version ?? null, build}
}

function envelope(outcome: SubmitOutcome): Envelope {
  return {
    ...outcome,
    flow: 'add-listing',
    source: 'app',
    platform: Platform.OS,
    osVersion: Device.osVersion ?? null,
    device: Device.modelName ?? null,
    ...describeBuild()
  }
}

async function post(payload: Envelope): Promise<boolean> {
  try {
    // Токен входа прикладывается, если он есть. Если его нет — отправляем без
    // него: «слетел вход» это одна из причин, которые мы ищем, и требовать
    // вошедшего значило бы не узнать о ней никогда. Функция это допускает.
    const token = await auth.currentUser?.getIdToken().catch(() => null)
    const response = await fetch(CALLABLE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: `Bearer ${token}`} : {})
      },
      body: JSON.stringify({data: payload})
    })
    return response.ok
  } catch {
    return false
  }
}

async function queue(payload: Envelope): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(QUEUE_KEY)
    const list = stored ? (JSON.parse(stored) as Envelope[]) : []
    list.push(payload)
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-QUEUE_LIMIT)))
  } catch {
    // Память телефона недоступна — донесение теряется, и это предел возможного.
  }
}

/**
 * Рассказать серверу, чем кончилась подача. Не бросает и не возвращает ошибку:
 * зовётся из того же места, где человеку уже показывают окно.
 */
export async function reportSubmit(outcome: SubmitOutcome): Promise<void> {
  const payload = envelope(outcome)
  if (!(await post(payload))) await queue(payload)
}

/**
 * Дослать то, что не уехало. Зовётся при запуске приложения.
 *
 * Очередь опустошается ДО отправки: донесение о вчерашнем отказе не стоит того,
 * чтобы застрять в очереди навсегда и мешать новым. Не доехало второй раз —
 * значит не доехало.
 */
export async function flushPendingReports(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(QUEUE_KEY)
    if (!stored) return
    await AsyncStorage.removeItem(QUEUE_KEY)
    const list = JSON.parse(stored) as Envelope[]
    for (const payload of list) await post(payload)
  } catch {
    // Молча: это дослылка, а не работа человека.
  }
}
