import {StyleSheet, Text, View} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'

import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

// Временный экран: он существует, чтобы проверить, что каркас собирается и
// оформление совпадает с сайтом. Заменяется списком объявлений, как только
// подключим Firebase.
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.card}>
        <Text style={styles.title}>Birklik.az</Text>
        <Text style={styles.subtitle}>Azərbaycanda günlük kirayə evlər</Text>
        <View style={styles.swatches}>
          <View style={[styles.swatch, {backgroundColor: colors.primary}]} />
          <View style={[styles.swatch, {backgroundColor: colors.secondary}]} />
          <View style={[styles.swatch, {backgroundColor: colors.accent}]} />
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.gray50,
    justifyContent: 'center',
    paddingHorizontal: spacing.md
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.base,
    ...shadow.md
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.primary
  },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.neutral
  },
  swatches: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: radius.base
  }
})
