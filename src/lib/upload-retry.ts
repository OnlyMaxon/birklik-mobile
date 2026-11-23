import {activeDelay, waitForForeground} from '@/lib/foreground'

/**
 * Одна попытка отправки: обещание, которое отказом или успехом когда-нибудь
 * ответит, и способ её прервать.
 *
 * ⚠️ «Когда-нибудь» — не оборот речи. В разборе 2026-11-23 вторая попытка
 * человека не ответила ВОВСЕ: одиннадцать снимков уехали, двенадцатый повис, и
 * `putFile` не отказал и не завершился. Поэтому `cancel` здесь обязателен.
 */
export interface UploadAttempt {
  done: Promise<unknown>
  cancel: () => void
}

export interface RetryUploadOptions {
  /** Начинает новую отправку. Зовётся заново на каждую попытку. */
  start: () => UploadAttempt
  /** Сколько попыток всего, включая первую. */
  attempts: number
  /** Сколько ждать перед 2-й, 3-й, … попыткой. Короче списка — берём последнее. */
  backoff: readonly number[]
  /** Сколько ВИДИМОГО времени даётся попытке, прежде чем счесть её зависшей. */
  stall: number
  /** Зовётся перед каждой новой попыткой: номер провалившейся и её код. */
  onRetry?: (attempt: number, code: string) => void
}

/** Код отказа, как его отдают Firebase и наши собственные ошибки. */
export const errorCode = (error: unknown): string => {
  const code = (error as {code?: unknown} | null)?.code
  if (typeof code === 'string') return code
  const message = (error as Error | null)?.message
  return typeof message === 'string' && message ? message : 'unknown'
}

/** Отказ по сроку: попытка не двигалась слишком долго с открытым приложением. */
export const STALLED = 'storage/stalled'

const stallError = (): Error => {
  const failure = new Error('upload stalled while visible')
  ;(failure as Error & {code?: string}).code = STALLED
  return failure
}

/**
 * Отправка с повтором и сроком на зависание.
 *
 * Три правила, каждое куплено отказом из разбора 2026-11-23:
 *
 * 1. Начинаем только с открытым приложением. Свёрнутому Android сеть то
 *    придерживает, то нет, и начинать отправку в этот момент — играть в орлянку.
 * 2. Попытку без ответа за `stall` ВИДИМОГО времени прерываем и начинаем
 *    заново: молчащее обещание иначе висит вечно, и экран вместе с ним.
 * 3. Отказ попытки — не отказ дела. Наверх уходит только последний.
 *
 * ⚠️ Повторяем на ЛЮБОЙ отказ, включая отказ по правам. Выбор несимметричный:
 * лишний повтор там, где прав действительно нет, стоит человеку секунды
 * ожидания и понятную ошибку в конце, а пропущенный повтор там, где была лишь
 * осечка связи, стоит ему всей подачи. Да и «нет прав» в фоне бывает
 * ненастоящим: истёкший пропуск App Check приходит тем же
 * `storage/unauthorized` и обновляется сам, стоит вернуться в приложение.
 */
export async function retryUpload(options: RetryUploadOptions): Promise<void> {
  const {start, attempts, backoff, stall, onRetry} = options

  for (let attempt = 1; ; attempt += 1) {
    await waitForForeground()

    const sending = start()
    // Молчаливый обработчик: прерванная попытка отказывает уже ПОСЛЕ того, как
    // гонку выиграл срок, и без него такой отказ всплыл бы «необработанным» и
    // шумел в журнале на каждом зависании.
    sending.done.catch(() => {})

    const clock = activeDelay(stall)
    let stalled = false

    try {
      await Promise.race([
        sending.done,
        clock.promise.then(() => {
          stalled = true
          // Прерываем — и всё равно бросаем своё. Прерывание само отклоняет
          // `done`, и обычно отказом гонка и кончается; но реализация, которая
          // на `cancel` не отвечает, оставила бы гонку нерешённой навсегда.
          sending.cancel()
          throw stallError()
        })
      ])
      return
    } catch (error) {
      // ⚠️ Отказ подменяется НАМЕРЕННО, и это нашлось прогоном.
      //
      // `sending.cancel()` отклоняет `done` синхронно, то есть раньше, чем
      // успеет выброситься наша ошибка, и гонку выигрывает отказ
      // `storage/canceled`. На последней попытке именно он уходил наверх — в
      // окно человеку и в донесение. Получалось «отменено», хотя никто ничего
      // не отменял: загрузка повисла. Такая подмена кода и стоила нам пяти
      // месяцев в прошлый раз, поэтому здесь важен не удобный код, а правдивый.
      const failure = stalled ? stallError() : error
      if (attempt >= attempts) throw failure
      onRetry?.(attempt, stalled ? STALLED : errorCode(error))
      await activeDelay(backoff[attempt - 1] ?? backoff[backoff.length - 1] ?? 0).promise
    } finally {
      clock.cancel()
    }
  }
}
