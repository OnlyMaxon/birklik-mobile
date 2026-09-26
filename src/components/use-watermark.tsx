import {useCallback, useEffect, useRef, useState} from 'react'
import {View} from 'react-native'
import {captureRef} from 'react-native-view-shot'

import {WatermarkedImage} from '@/components/watermarked-image'
import type {PickedImage} from '@/services/listing-service'

interface Pending extends PickedImage {
  resolve: (uri: string) => void
  reject: () => void
}

/** Столько ждём отрисовку, прежде чем признать снимок неудавшимся. */
const RENDER_TIMEOUT = 8000
/** Кадр после загрузки — чтобы вид успел выложиться. */
const FRAME_DELAY = 32

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

  // ⚠️ Снятие ждёт ЗАГРУЗКИ картинок, а не отсчёта времени. Раньше здесь стоял
  // таймер на 120 мс — и ловил кадр, где картинка ещё проявлялась поверх
  // чёрного фона рамки. В объявления уходили чёрные фотографии, и каждая
  // следующая была темнее: телефон занят обработкой предыдущей, и к сто
  // двадцатой миллисекунде успевает всё меньше. Найдено на устройстве
  // 2026-09-26, по пяти загруженным снимкам подряд.
  useEffect(() => {
    if (!pending || !ready) return

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const uri = await captureRef(viewRef, {format: 'png', quality: 1})
        if (!cancelled) pending.resolve(uri)
      } catch {
        if (!cancelled) pending.reject()
      } finally {
        if (!cancelled) {
          setPending(null)
          setReady(false)
        }
      }
    }, FRAME_DELAY)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pending, ready])

  // Страховка от зависания. Честная ошибка лучше чёрного прямоугольника в
  // объявлении: её человек увидит и повторит, а чёрный снимок уйдёт в базу
  // молча — так эта поломка и прожила незамеченной.
  useEffect(() => {
    if (!pending) return

    let cancelled = false
    const guard = setTimeout(() => {
      if (cancelled) return
      pending.reject()
      setPending(null)
      setReady(false)
    }, RENDER_TIMEOUT)

    return () => {
      cancelled = true
      clearTimeout(guard)
    }
  }, [pending])

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
