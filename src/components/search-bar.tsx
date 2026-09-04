import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  value: string
  onChangeText: (value: string) => void
  onOpenFilters: () => void
  activeCount: number
}

export function SearchBar({value, onChangeText, onOpenFilters, activeCount}: Props) {
  const {t} = useLanguage()

  return (
    <View style={styles.row}>
      <View style={styles.field}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={t.search.placeholder}
          placeholderTextColor={colors.gray400}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <Pressable onPress={onOpenFilters} style={styles.filterButton}>
        <Text style={styles.filterText}>{t.search.filters}</Text>
        {activeCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: spacing.sm, alignItems: 'center'},
  field: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.base,
    ...shadow.sm
  },
  input: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    fontSize: fontSize.base,
    color: colors.text
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.base,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    ...shadow.sm
  },
  filterText: {color: colors.white, fontSize: fontSize.sm, fontWeight: '600'},
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  },
  badgeText: {color: colors.white, fontSize: fontSize.xs, fontWeight: '700'}
})
