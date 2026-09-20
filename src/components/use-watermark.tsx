import {useCallback, useEffect, useRef, useState} from 'react'
import {View} from 'react-native'
import {captureRef} from 'react-native-view-shot'

import {WatermarkedImage} from '@/components/watermarked-image'
import type {PickedImage} from '@/services/listing-service'

interface Pending extends PickedImage {
  resolve: (uri: string) => void
  reject: () => void
}

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

  useEffect(() => {
    if (!pending) return

    let cancelled = false

    // Кадр должен успеть отрисоваться до снятия: на первом проходе вид ещё
    // пуст, и снимок вышел бы чёрным.
    const timer = setTimeout(async () => {
      try {
        const uri = await captureRef(viewRef, {format: 'png', quality: 1})
        if (!cancelled) pending.resolve(uri)
      } catch {
        if (!cancelled) pending.reject()
      } finally {
        if (!cancelled) setPending(null)
      }
    }, 120)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [pending])

  const apply = useCallback(
    (image: PickedImage) =>
      new Promise<string>((resolve, reject) => {
        setPending({...image, resolve, reject})
      }),
    []
  )

  const stage = pending ? (
    <WatermarkedImage
      ref={viewRef}
      uri={pending.uri}
      width={pending.width}
      height={pending.height}
    />
  ) : null

  return {stage, apply}
}
