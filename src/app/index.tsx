import {FlatList, StyleSheet, Text, View} from 'react-native'
import {SafeAreaView} from 'react-native-safe-area-context'

import {cities, propertyTypes} from '@birklik/core/data'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

// Временный экран. Он существует ради одной проверки: что общий пакет
// действительно доезжает до приложения — и до компилятора, и до сборщика.
// Справочник регионов здесь тот же самый, что на сайте, физически один файл.
// Заменяется списком объявлений, как только появится доступ к Firestore.
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Birklik.az</Text>
        <Text style={styles.subtitle}>
          {cities.length} regionu · {propertyTypes.length} növ
        </Text>
      </View>

      <FlatList
        data={cities.slice(0, 20)}
        keyExtractor={city => city.value}
        contentContainerStyle={styles.list}
        renderItem={({item}) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{item.az}</Text>
            <Text style={styles.rowMeta}>{item.ru}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.gray50
  },
  header: {
    padding: spacing.md,
    gap: spacing.xs
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.primary
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.neutral
  },
  list: {
    padding: spacing.md,
    gap: spacing.sm
  },
  row: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    padding: spacing.base,
    ...shadow.sm
  },
  rowTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.text
  },
  rowMeta: {
    fontSize: fontSize.sm,
    color: colors.neutral
  }
})
