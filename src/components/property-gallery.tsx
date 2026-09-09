import {useRef, useState} from 'react'
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from 'react-native'
import {Image} from 'expo-image'
import {Ionicons} from '@expo/vector-icons'

import {colors, fontSize, radius, spacing} from '@/theme/theme'

const {width} = Dimensions.get('window')
const HEIGHT = Math.round(width * 0.72)

type Props = {
  images: string[]
}

/**
 * Галерея объявления — по образцу `image-gallery.tsx` с сайта.
 *
 * ⚠️ Главное здесь — снимок показывается ЦЕЛИКОМ, без обрезки, а поля по бокам
 * заполняются им же в размытии. Владельцы жаловались, когда карточку резало: у
 * части объявлений снимки узкие или низкие, и `cover` съедал половину кадра.
 * На сайте это решено размытой подложкой, здесь так же.
 *
 * Подложка и основной кадр — один и тот же адрес, поэтому вторая загрузка не
 * происходит: `expo-image` берёт его из своего кэша.
 *
 * Листается пролистыванием и лентой миниатюр, счётчик показывает место в
 * наборе. Нажатие открывает снимок на весь экран — тоже как на сайте.
 */
export function PropertyGallery({images}: Props) {
  const [index, setIndex] = useState(0)
  const [full, setFull] = useState(false)
  const listRef = useRef<FlatList<string>>(null)

  if (images.length === 0) {
    return (
      <View style={[styles.main, styles.empty]}>
        <Ionicons name="image-outline" size={40} color={colors.gray300} />
      </View>
    )
  }

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width)
    if (next !== index) setIndex(next)
  }

  const goTo = (next: number) => {
    setIndex(next)
    listRef.current?.scrollToIndex({index: next, animated: true})
  }

  return (
    <View>
      <FlatList
        ref={listRef}
        data={images}
        keyExtractor={(uri, i) => `${uri}-${i}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        getItemLayout={(_, i) => ({length: width, offset: width * i, index: i})}
        renderItem={({item}) => (
          <Pressable onPress={() => setFull(true)} style={styles.main}>
            {/* Размытая подложка: тот же кадр, растянутый и размытый. Небольшое
                увеличение прячет полупрозрачную кайму по краям — на сайте для
                этого стоит scale(1.1). */}
            <Image
              source={{uri: item}}
              style={styles.backdrop}
              contentFit="cover"
              blurRadius={24}
            />
            <Image source={{uri: item}} style={styles.photo} contentFit="contain" />
          </Pressable>
        )}
      />

      <View style={styles.counter}>
        <Text style={styles.counterText}>
          {index + 1} / {images.length}
        </Text>
      </View>

      {images.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbs}
        >
          {images.map((uri, i) => (
            <Pressable key={`${uri}-thumb-${i}`} onPress={() => goTo(i)}>
              <Image
                source={{uri}}
                style={[styles.thumb, i === index && styles.thumbActive]}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <Modal visible={full} transparent animationType="fade" onRequestClose={() => setFull(false)}>
        <Pressable style={styles.fullBackdrop} onPress={() => setFull(false)}>
          <Image source={{uri: images[index]}} style={styles.fullImage} contentFit="contain" />

          <View style={styles.fullCounter}>
            <Text style={styles.fullCounterText}>
              {index + 1} / {images.length}
            </Text>
          </View>

          <Pressable style={styles.fullClose} onPress={() => setFull(false)} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.white} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  main: {width, height: HEIGHT, backgroundColor: colors.gray900},
  empty: {alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray100},
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    width,
    height: HEIGHT,
    transform: [{scale: 1.1}],
    opacity: 0.82
  },
  photo: {width, height: HEIGHT},
  counter: {
    position: 'absolute',
    top: HEIGHT - 34,
    right: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(7, 21, 52, 0.74)'
  },
  counterText: {color: colors.white, fontSize: fontSize.xs, fontWeight: '600'},
  thumbs: {gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.sm},
  thumb: {
    width: 64,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: 'transparent'
  },
  thumbActive: {borderColor: colors.primary},
  fullBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  fullImage: {width: '100%', height: '80%'},
  fullCounter: {position: 'absolute', bottom: 40},
  fullCounterText: {color: colors.white, fontSize: fontSize.sm},
  fullClose: {position: 'absolute', top: 48, right: spacing.md}
})
