import {Pressable, StyleSheet, Text, View} from 'react-native'

import type {Language} from '@birklik/core/types'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

const OPTIONS: Array<{code: Language; label: string}> = [
  {code: 'az', label: 'AZ'},
  {code: 'ru', label: 'RU'},
  {code: 'en', label: 'EN'}
]

/** Переключатель языка для шапки. Выбор запоминается между запусками. */
export function LanguageSwitch() {
  const {language, setLanguage} = useLanguage()

  return (
    <View style={styles.row}>
      {OPTIONS.map(option => {
        const active = option.code === language
        return (
          <Pressable
            key={option.code}
            onPress={() => setLanguage(option.code)}
            style={[styles.item, active && styles.itemActive]}
            hitSlop={6}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginRight: spacing.sm
  },
  item: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm
  },
  itemActive: {
    backgroundColor: colors.primaryDark
  },
  label: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: '600',
    opacity: 0.65
  },
  labelActive: {
    opacity: 1
  }
})
