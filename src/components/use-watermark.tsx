import {useCallback, useEffect, useRef, useState} from 'react'
import {AppState, type AppStateStatus, View} from 'react-native'
import {captureRef} from 'react-native-view-shot'

import {WatermarkedImage} from '@/components/watermarked-image'
import type {PickedImage} from '@/services/listing-service'

interface Pending extends PickedImage {
  resolve: (uri: string) => void
  reject: (error: Error) => void
}

/** Столько ждём отрисовку, прежде чем признать снимок неудавшимся. */
const RENDER_TIMEOUT = 8000
/** Кадр после загрузки — чтобы вид успел выложиться. */
const FRAME_DELAY = 32
/**
 * Кадр ПОСЛЕ ВОЗВРАТА в приложение. Больше обычного намеренно: вид только что
 * был не на экране, и системе нужен не один проход отрисовки, чтобы выложить его
 * заново. Снимешь через 32 мс — поймаешь полупустой кадр, то есть вернёшь ровно
 * те чёрные фотографии, от которых ушли ожиданием загрузки ниже.
 */
const RESUME_DELAY = 400

/**
 * ⚠️ `unknown` считается передним планом. На холодном запуске Android успевает
 * отдать именно его, и ждать «настоящего active» значило бы не снять ни одного
 * кадра до первого переключения приложения.
 */
const isForeground = (state: AppStateStatus | null): boolean =>
  state === 'active' || state === 'unknown' || state === null

/**
 * Наложение водяного знака на снимок.
 *
 * ⚠️ Устроено вокруг того, что знак нельзя нарисовать «в стороне»: единственный
 * способ совместить две картинки в React Native — отрисовать их видом и снять
 * его. Значит нужен смонтированный вид, а не чистая функция, — отсюда хук,
 * который возвращает и вид для вставки в экран, и способ его применить.
 *
 * Снимки обрабатываются по одному: вид один, и параллельно снять с него два
 * разных кадра нельзя.
 *
 * Снимаем в PNG, а не сразу в webp: без потерь. Сжатие делает следующий шаг —
 * ровно так же, как на сайте, где холст рисуется целиком, а кодируется один раз.
 *
 * ⚠️ `width`/`height` у `apply` — размер ИТОГОВОГО КАДРА В ТОЧКАХ, а не
 * разрешение картинки. Вид выкладывается именно по ним, и от них же считается
 * логотип. А снимается вид в ПИКСЕЛЯХ устройства, то есть в этот размер,
 * умноженный на плотность экрана: на 420 dpi кадр 328×675 даёт снимок 861×1772.
 * Поэтому `uploadImages` отдаёт сюда картинку, уже подготовленную под пиксельный
 * размер вида, и сам приводит снимок к итоговому размеру после. Нарушить эту
 * пару — вернуть размазанные фотографии, которые здесь однажды уже были.
 */
export function useWatermark() {
  const viewRef = useRef<View>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [ready, setReady] = useState(false)

  /**
   * ⚠️ На переднем ли плане приложение. Это НЕ украшение, а причина поломки,
   * из-за которой из приложения полгода не создавалось ни одного объявления.
   *
   * Свёрнутое приложение вид не рисует: картинка в нём не догружается, кадр не
   * снимается. Страховка ниже объявляла снимок неудавшимся через восемь секунд,
   * отказ рушил всю подачу, и человек получал «Объявление не сохранилось.
   * Чаще всего дело в связи» — про связь, которая была ни при чём. А уходят в
   * другое приложение почти всегда: двадцать снимков со знаком идут десятки
   * секунд, и всё это время смотреть на полосу незачем.
   *
   * Поэтому ожидание кадра и страховка идут ТОЛЬКО на переднем плане. Вышел
   * человек — работа встаёт; вернулся — снимается кадр и подача продолжается с
   * того же места. Отказ превратился в паузу.
   *
   * ⚠️ Таймеры этим не заменяются: пока приложение свёрнуто, Android замораживает
   * и их тоже — но не всегда и не сразу. Именно поэтому поломка выглядела
   * случайной: в одной попытке страховка не успевала сработать (и в журнале
   * видно, как загрузка просто встала на две с половиной минуты), а в следующей
   * успевала. Полагаться на заморозку нельзя, надо спрашивать состояние.
   */
  const [active, setActive] = useState(() => isForeground(AppState.currentState))
  /** Вернулись из-за спины — первому кадру нужна отсрочка подольше. */
  const resumed = useRef(false)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setActive(current => {
        const next = isForeground(state)
        if (next && !current) resumed.current = true
        return next
      })
    })
    return () => subscription.remove()
  }, [])

  // ⚠️ Снятие ждёт ЗАГРУЗКИ картинок, а не отсчёта времени. Раньше здесь стоял
  // таймер на 120 мс — и ловил кадр, где картинка ещё проявлялась поверх
  // чёрного фона рамки. В объявления уходили чёрные фотографии, и каждая
  // следующая была темнее: телефон занят обработкой предыдущей, и к сто
  // двадцатой миллисекунде успевает всё меньше. Найдено на устройстве
  // 2026-09-26, по пяти загруженным снимкам подряд.
  useEffect(() => {
    // `active` в условии — то самое лечение: на свёрнутом приложении кадр не
    // снимаем вовсе, а не снимаем неудачно.
    if (!pending || !ready || !active) return

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const uri = await captureRef(viewRef, {format: 'png', quality: 1})
        if (!cancelled) {
          resumed.current = false
          pending.resolve(uri)
        }
      } catch (error) {
        // Причина уезжает наверх, а не теряется: по ней экран подачи называет
        // человеку, что случилось, вместо вечного «проверьте интернет».
        // ⚠️ Причина прикладывается ПРИСВОЕНИЕМ, а не вторым доводом `Error`.
        // Поддержку `new Error(msg, {cause})` у Hermes проверять незачем, если
        // можно не зависеть от неё вовсе: потерять причину здесь значит снова
        // остаться с ошибкой без объяснения.
        if (!cancelled) {
          const failure = new Error('watermark-capture-failed')
          ;(failure as Error & {cause?: unknown}).cause = error
          pending.reject(failure)
        }
      } finally {
        if (!cancelled) {
          setPending(null)
          setReady(false)
        }
      }
    }, resumed.current ? RESUME_DELAY : FRAME_DELAY)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pending, ready, active])

  // Страховка от зависания. Честная ошибка лучше чёрного прямоугольника в
  // объявлении: её человек увидит и повторит, а чёрный снимок уйдёт в базу
  // молча — так эта поломка и прожила незамеченной.
  //
  // ⚠️ Тикает ТОЛЬКО на переднем плане. Свёрнутое приложение вид не рисует, и
  // восемь секунд истекали не потому, что телефон не справился, а потому, что
  // рисовать было некому. Отсчёт начинается заново при каждом возврате — это
  // правильно: страховка сторожит отрисовку, а не терпение человека.
  useEffect(() => {
    if (!pending || !active) return

    let cancelled = false
    const guard = setTimeout(() => {
      if (cancelled) return
      pending.reject(new Error('watermark-render-timeout'))
      setPending(null)
      setReady(false)
    }, RENDER_TIMEOUT)

    return () => {
      cancelled = true
      clearTimeout(guard)
    }
  }, [pending, active])

  const apply = useCallback(
    (image: PickedImage) =>
      new Promise<string>((resolve, reject) => {
        setReady(false)
        setPending({...image, resolve, reject})
      }),
    []
  )

  // ⚠️ `key` по адресу снимка обязателен: без него React переиспользует тот же
  // вид для следующей картинки, и счётчик загрузок внутри остаётся прежним —
  // готовность больше никогда не наступит, и всё повиснет до страховки.
  const stage = pending ? (
    <WatermarkedImage
      key={pending.uri}
      ref={viewRef}
      uri={pending.uri}
      width={pending.width}
      height={pending.height}
      onReady={() => setReady(true)}
    />
  ) : null

  return {stage, apply}
}
