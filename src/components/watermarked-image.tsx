import {forwardRef, useCallback, useRef} from 'react'
import {Image, StyleSheet, View} from 'react-native'

type Props = {
  uri: string
  width: number
  height: number
  /** Обе картинки отрисованы — вид можно снимать. */
  onReady?: () => void
}

/**
 * Снимок с водяным знаком — ровно тем же, что накладывает сайт.
 *
 * ⚠️ Геометрия скопирована из `applyWatermark` в `image-compression.ts`
 * веб-репозитория: логотип по центру, шириной в 35% кадра но не шире 280 точек,
 * прозрачность 0.20. Разойдутся числа — и фотографии из приложения станет видно
 * среди остальных, а знак затем и ставится, чтобы снимки не растаскивали.
 *
 * Вид рисуется за экраном и снимается `react-native-view-shot`: модуль
 * обработки изображений умеет только менять размер, поворачивать и обрезать —
 * наложить одну картинку на другую он не может.
 */
export const WatermarkedImage = forwardRef<View, Props>(function WatermarkedImage(
  {uri, width, height, onReady},
  ref
) {
  // ⚠️ Снимать вид можно только когда отрисованы ОБЕ картинки. Раньше снятие
  // шло по таймеру на 120 мс — и ловило кадр, где картинка ещё не проявилась, а
  // под ней чёрный фон. Отсюда были чёрные фотографии в объявлениях, причём
  // каждая следующая темнее предыдущей: телефон занят обработкой предыдущей, и
  // к 120-й миллисекунде успевает всё меньше.
  const loaded = useRef(0)
  const markLoaded = useCallback(() => {
    loaded.current += 1
    if (loaded.current === 2) onReady?.()
  }, [onReady])
  // Ровно формула сайта: `Math.min(canvasW * 0.35, 280)`.
  const logoWidth = Math.min(width * 0.35, 280)
  // На сайте высота берётся из пропорций самого файла логотипа:
  // `logoW * (logo.height / logo.width)`. Оба файла — 4:1 (веб 512×128,
  // приложение 1024×256), поэтому деление на 4 даёт то же число. Заменят
  // логотип на другой пропорции — поправить обе стороны разом.
  const logoHeight = logoWidth / 4

  return (
    <View ref={ref} collapsable={false} style={[styles.frame, {width, height}]}>
      {/* ⚠️ fadeDuration={0} обязателен. На Android у Image есть плавное
          проявление длиной 300 мс по умолчанию, и снимок вида ловил картинку
          полупрозрачной — поверх чёрного фона рамки. Ровно это и делало
          фотографии тёмными. */}
      <Image
        source={{uri}}
        style={{width, height}}
        resizeMode="cover"
        fadeDuration={0}
        onLoad={markLoaded}
      />
      <Image
        source={require('@/assets/images/logo.png')}
        style={[
          styles.logo,
          {
            width: logoWidth,
            height: logoHeight,
            // ⚠️ Сдвиг вверх на ПОЛОВИНУ ВЫСОТЫ ЛОГОТИПА, а не на постоянные 20
            // точек, как было. У сайта знак стоит ровно в середине:
            // `y = (canvasH - logoH) / 2`. Постоянный сдвиг совпадал с этим
            // только при ширине логотипа в 160 точек, а на полноразмерном кадре
            // (логотип 280) знак уезжал на 15 точек ниже центра — то есть
            // снимки из приложения и из браузера различались на глаз.
            marginTop: -logoHeight / 2
          }
        ]}
        resizeMode="contain"
        fadeDuration={0}
        onLoad={markLoaded}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  frame: {
    // За краем экрана: вид нужен только для снятия, показывать его человеку
    // незачем.
    position: 'absolute',
    left: -10000,
    top: 0,
    backgroundColor: '#000'
  },
  logo: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    // Сдвиг задаётся в разметке: он зависит от высоты логотипа, а она — от
    // ширины кадра. Прозрачность та же, что у сайта: `ctx.globalAlpha = 0.20`.
    opacity: 0.2
  }
})
