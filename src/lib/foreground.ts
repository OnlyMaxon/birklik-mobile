import {AppState, type AppStateStatus} from 'react-native'

/**
 * «Приложение на виду» — одно определение на весь проект.
 *
 * Им пользуются два места, и оба обязаны понимать это слово одинаково: водяной
 * знак (`useWatermark`) не рисуется в фоне вовсе, а загрузка снимков в фоне не
 * считает время ожидания. Разойдись они — одно вставало бы на паузу, а другое в
 * ту же секунду объявляло отказ.
 *
 * ⚠️ `unknown` и `null` считаются «на виду» НАМЕРЕННО. Так AppState отвечает в
 * первые мгновения после запуска и на части устройств; счесть это фоном значило
 * бы остановить работу на ровном месте и ждать события, которое уже прошло.
 */
export const isForeground = (state: AppStateStatus | null): boolean =>
  state === 'active' || state === 'unknown' || state === null

/**
 * Ждёт, пока человек вернётся в приложение. Если он уже здесь — не ждёт вовсе.
 */
export function waitForForeground(): Promise<void> {
  if (isForeground(AppState.currentState)) return Promise.resolve()
  return new Promise(resolve => {
    const subscription = AppState.addEventListener('change', state => {
      if (!isForeground(state)) return
      subscription.remove()
      resolve()
    })
  })
}

/**
 * Обещание, которое исполнится через `ms` ВИДИМОГО времени: пока приложение в
 * фоне, отсчёт стоит и возобновляется с того же места.
 *
 * ⚠️ Обычный `setTimeout` здесь не годится, и это не придирка. Android таймеры
 * свёрнутого приложения то замораживает, то нет — именно из-за этого пятимесячный
 * отказ подачи выглядел случайным. Но и доверять им нельзя наоборот: загрузка
 * снимка в фоне законно висит десятки секунд (в разборе 23.11 — 88 секунд, после
 * чего спокойно доехала). Срок, считающий только видимое время, различает «висит,
 * потому что человек ушёл» и «висит, хотя человек смотрит на экран» — а это
 * разные беды с разным лечением.
 *
 * `cancel()` снимает и таймер, и подписку: не вызвать его — оставить подписку на
 * AppState навсегда.
 */
export function activeDelay(ms: number): {promise: Promise<void>; cancel: () => void} {
  let timer: ReturnType<typeof setTimeout> | null = null
  let subscription: {remove: () => void} | null = null
  let left = ms
  let startedAt = 0
  let finish: (() => void) | null = null

  const promise = new Promise<void>(resolve => {
    finish = resolve
  })

  const stop = (): void => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
    left -= Date.now() - startedAt
  }

  const cancel = (): void => {
    stop()
    subscription?.remove()
    subscription = null
  }

  const start = (): void => {
    if (timer !== null || subscription === null) return
    startedAt = Date.now()
    timer = setTimeout(() => {
      timer = null
      cancel()
      finish?.()
    }, Math.max(left, 0))
  }

  subscription = AppState.addEventListener('change', state => {
    if (isForeground(state)) start()
    else stop()
  })

  if (isForeground(AppState.currentState)) start()

  return {promise, cancel}
}
