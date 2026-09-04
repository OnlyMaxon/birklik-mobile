import {useState} from 'react'
import {Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native'

import {cities, propertyTypes} from '@birklik/core/data'
import type {Language, PropertyType} from '@birklik/core/types'

import {PrimaryButton} from '@/components/primary-button'
import {EMPTY_FILTERS, type Filters} from '@/filters/use-filters'
import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

type Props = {
  visible: boolean
  filters: Filters
  /** Регионы, где объявления действительно есть, с числом. */
  availableCities: Array<{value: string; count: number}>
  onApply: (next: Filters) => void
  onClose: () => void
}

function cityLabel(value: string, language: Language): string {
  const option = cities.find(city => city.value === value)
  return option ? option[language] : value
}

/**
 * Лист фильтров.
 *
 * Значения правятся в собственном состоянии и уезжают наружу только по кнопке
 * «Применить»: иначе список под листом перестраивался бы на каждое касание,
 * а закрыть лист без изменений стало бы нельзя.
 */
export function FilterSheet({visible, filters, availableCities, onApply, onClose}: Props) {
  const {language, t} = useLanguage()
  const [draft, setDraft] = useState<Filters>(filters)

  // Лист открывается заново — подхватываем то, что снаружи.
  const open = () => setDraft(filters)

  const patch = (change: Partial<Filters>) => setDraft(current => ({...current, ...change}))

  const toNumber = (text: string): number | null => {
    const value = Number(text.replace(/[^\d]/g, ''))
    return Number.isFinite(value) && value > 0 ? value : null
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={open}
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.headTitle}>{t.search.filters}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.headClose}>{t.buttons.close}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Section title={t.search.whereGoing}>
            <View style={styles.chips}>
              <Chip
                label={t.search.any}
                active={!draft.city}
                onPress={() => patch({city: ''})}
              />
              {availableCities.map(city => (
                <Chip
                  key={city.value}
                  label={`${cityLabel(city.value, language)} ${city.count}`}
                  active={draft.city === city.value}
                  onPress={() => patch({city: draft.city === city.value ? '' : city.value})}
                />
              ))}
            </View>
          </Section>

          <Section title={t.search.propertyType}>
            <View style={styles.chips}>
              <Chip label={t.search.any} active={!draft.type} onPress={() => patch({type: ''})} />
              {propertyTypes.map(type => (
                <Chip
                  key={type}
                  label={t.propertyTypes[type as keyof typeof t.propertyTypes] ?? type}
                  active={draft.type === type}
                  onPress={() =>
                    patch({type: draft.type === type ? '' : (type as PropertyType)})
                  }
                />
              ))}
            </View>
          </Section>

          <Section title={t.search.priceRange}>
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                placeholder={t.search.minPrice}
                placeholderTextColor={colors.gray400}
                keyboardType="number-pad"
                value={draft.minPrice?.toString() ?? ''}
                onChangeText={text => patch({minPrice: toNumber(text)})}
              />
              <TextInput
                style={styles.input}
                placeholder={t.search.maxPrice}
                placeholderTextColor={colors.gray400}
                keyboardType="number-pad"
                value={draft.maxPrice?.toString() ?? ''}
                onChangeText={text => patch({maxPrice: toNumber(text)})}
              />
            </View>
          </Section>

          <Section title={t.search.guests}>
            <View style={styles.chips}>
              <Chip
                label={t.search.any}
                active={draft.minGuests === null}
                onPress={() => patch({minGuests: null})}
              />
              {[2, 4, 6, 8, 10].map(count => (
                <Chip
                  key={count}
                  label={`${count}+`}
                  active={draft.minGuests === count}
                  onPress={() => patch({minGuests: draft.minGuests === count ? null : count})}
                />
              ))}
            </View>
          </Section>
        </ScrollView>

        <View style={styles.foot}>
          <Pressable
            onPress={() => setDraft({...EMPTY_FILTERS, search: draft.search})}
            style={styles.reset}
          >
            <Text style={styles.resetText}>{t.buttons.reset}</Text>
          </Pressable>
          <View style={styles.apply}>
            <PrimaryButton title={t.buttons.search} onPress={() => onApply(draft)} />
          </View>
        </View>
      </View>
    </Modal>
  )
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Chip({label, active, onPress}: {label: string; active: boolean; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  sheet: {flex: 1, backgroundColor: colors.white},
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100
  },
  headTitle: {fontSize: fontSize.xl, fontWeight: '700', color: colors.text},
  headClose: {fontSize: fontSize.base, color: colors.primary, fontWeight: '600'},
  body: {padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xl},
  section: {gap: spacing.sm},
  sectionTitle: {fontSize: fontSize.base, fontWeight: '600', color: colors.gray700},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  chip: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  chipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  chipText: {fontSize: fontSize.sm, color: colors.gray700},
  chipTextActive: {color: colors.white, fontWeight: '600'},
  row: {flexDirection: 'row', gap: spacing.sm},
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.base,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    fontSize: fontSize.base,
    color: colors.text
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray100
  },
  reset: {paddingHorizontal: spacing.md, paddingVertical: spacing.base},
  resetText: {fontSize: fontSize.base, color: colors.neutral, fontWeight: '600'},
  apply: {flex: 1}
})
