import {Image} from 'expo-image'
import {Pressable, StyleSheet} from 'react-native'
import {router} from 'expo-router'

/**
 * Логотип в шапке. Тот же файл, что на сайте (`logo-1024x256.png`), поэтому
 * начертание и цвета совпадают, а не «примерно похожи».
 *
 * Нажатие ведёт на главную. На самой главной это ничего не меняет — так же
 * ведёт себя логотип на сайте.
 *
 * Размер задан по ширине, высота выводится из пропорции 4:1 — растягивать
 * логотип нельзя, а `contentFit: contain` сам по себе высоту не подберёт.
 */
const WIDTH = 148
const HEIGHT = WIDTH / 4

export function HeaderLogo() {
  return (
    <Pressable
      onPress={() => router.replace('/')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Birklik.az"
    >
      <Image
        source={require('@/assets/images/logo.png')}
        style={styles.logo}
        contentFit="contain"
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  logo: {
    width: WIDTH,
    height: HEIGHT
  }
})
