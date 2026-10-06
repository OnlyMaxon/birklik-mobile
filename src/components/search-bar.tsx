import {Keyboard, Pressable, StyleSheet, Text, TextInput, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  value: string
  onChangeText: (value: string) => void
  onOpenFilters: () => void
  onSearch: () => void
  activeCount: number
}

/**
 * Строка поиска с кнопкой, как в шапке сайта.
 *
 * ⚠️ Кнопка «Искать» ничего не ЗАПУСКАЕТ: на телефоне список пересобирается на
 * каждую букву, и к моменту нажатия нужное уже найдено. Она убирает клавиатуру
 * и возвращает список к началу — на сайте то же нажатие и правда запускает
 * поиск, но там между полем и выдачей целый экран, а здесь клавиатура закрывает
 * половину списка, и выйти из неё человеку нужнее.
 *
 * Поэтому кнопка есть, но она не притворяется, будто без неё поиск не идёт.
 */
export function SearchBar({value, onChangeText, onOpenFilters, onSearch, activeCount}: Props) {
  const {t} = useLanguage()

  const submit = () => {
    Keyboard.dismiss()
    onSearch()
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.field}>
          <Ionicons name="search-outline" size={17} color={colors.gray400} />
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={t.search.placeholder}
            placeholderTextColor={colors.gray400}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={submit}
            clearButtonMode="while-editing"
          />
        </View>

        <Pressable onPress={submit} style={styles.searchButton} accessibilityRole="button">
          <Ionicons name="search" size={16} color={colors.white} />
          <Text style={styles.searchText}>{t.search.button}</Text>
        </Pressable>
      </View>

      <Pressable onPress={onOpenFilters} style={styles.filterButton} accessibilityRole="button">
        <Ionicons name="options-outline" size={15} color={colors.primary} />
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
  wrap: {gap: spacing.sm},
  row: {flexDirection: 'row', gap: spacing.sm, alignItems: 'center'},
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.base,
    backgroundColor: colors.white,
    borderRadius: radius.base,
    ...shadow.sm
  },
  input: {
    flex: 1,
    paddingRight: spacing.base,
    paddingVertical: spacing.base,
    fontSize: fontSize.base,
    color: colors.text
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radius.base,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    ...shadow.sm
  },
  searchText: {color: colors.white, fontSize: fontSize.sm, fontWeight: '700'},
  filterButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.base,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  filterText: {color: colors.primary, fontSize: fontSize.xs, fontWeight: '700'},
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
