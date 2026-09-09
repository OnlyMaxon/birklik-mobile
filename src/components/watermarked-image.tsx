import {forwardRef} from 'react'
import {Image, StyleSheet, View} from 'react-native'

type Props = {
  uri: string
  width: number
  height: number
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
  {uri, width, height},
  ref
) {
  const logoWidth = Math.min(width * 0.35, 280)

  return (
    <View ref={ref} collapsable={false} style={[styles.frame, {width, height}]}>
      <Image source={{uri}} style={{width, height}} resizeMode="cover" />
      <Image
        source={require('@/assets/images/logo.png')}
        style={[styles.logo, {width: logoWidth, height: logoWidth / 4}]}
        resizeMode="contain"
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
    marginTop: -20,
    opacity: 0.2
  }
})
