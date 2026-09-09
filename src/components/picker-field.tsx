import {useMemo, useState} from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

export interface PickerOption {
  value: string
  label: string
}

type Props = {
  label: string
  placeholder: string
  options: PickerOption[]
  value: string
  onChange: (value: string) => void
}

/**
 * Выбор одного значения из длинного списка.
 *
 * ⚠️ Заведено ради городов. Их в справочнике около семидесяти, и набором
 * «пилюль» они занимали пол-экрана формы — пролистать до цены было целым делом.
 * На сайте в этом месте выпадающий список, здесь — лист с поиском: на телефоне
 * искать глазами в семидесяти названиях дольше, чем набрать три буквы.
 *
 * Для коротких наборов (типы жилья, удобства) это излишне — там «пилюли»
 * нагляднее, потому что видно всё сразу.
 */
export function PickerField({label, placeholder, options, value, onChange}: Props) {
  const {t} = useLanguage()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selected = options.find(option => option.value === value)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return options
    return options.filter(option => option.label.toLowerCase().includes(query))
  }, [options, search])

  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Text style={[styles.value, !selected && styles.placeholder]}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.gray400} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.gray600} />
            </Pressable>
          </View>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t.buttons.search}
            placeholderTextColor={colors.gray400}
            style={styles.search}
            autoCorrect={false}
          />

          <FlatList
            data={filtered}
            keyExtractor={option => option.value}
            keyboardShouldPersistTaps="handled"
            renderItem={({item}) => {
              const active = item.value === value
              return (
                <Pressable
                  style={({pressed}) => [styles.option, pressed && styles.optionPressed]}
                  onPress={() => {
                    onChange(item.value)
                    setSearch('')
                    setOpen(false)
                  }}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {item.label}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              )
            }}
            ListEmptyComponent={<Text style={styles.empty}>{t.messages.noResults}</Text>}
          />
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.gray700,
    marginBottom: spacing.xs
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 13
  },
  value: {fontSize: fontSize.sm, color: colors.text},
  placeholder: {color: colors.gray400},
  sheet: {flex: 1, backgroundColor: colors.white, paddingTop: spacing.xl},
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm
  },
  sheetTitle: {fontSize: fontSize.lg, fontWeight: '700', color: colors.text},
  search: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: colors.text
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray200
  },
  optionPressed: {backgroundColor: colors.gray50},
  optionText: {fontSize: fontSize.base, color: colors.text},
  optionTextActive: {color: colors.primary, fontWeight: '600'},
  empty: {padding: spacing.md, fontSize: fontSize.sm, color: colors.neutral}
})
