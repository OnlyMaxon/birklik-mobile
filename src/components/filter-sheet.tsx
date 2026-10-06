import {useMemo, useState} from 'react'
import {Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {
  cities,
  cityDistricts,
  cityLocationOptions,
  moreFilterOptions,
  nearFilterOptions,
  propertyTypes
} from '@birklik/core/data'
import type {Language, LocationCategory, PropertyType} from '@birklik/core/types'

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

/** Что показывать в быстром ряду — то же, что в расширенном фильтре сайта. */
const QUICK_MORE = ['sauna', 'gazebo', 'kidsZone', 'garage']
const QUICK_NEAR = ['beach', 'sea', 'forest', 'park']

const ROOM_CHOICES = [1, 2, 3, 4, 5, 6, 7]

function cityLabel(value: string, language: Language): string {
  const option = cities.find(city => city.value === value)
  return option ? option[language] : value
}

/**
 * Лист фильтров — тот же набор условий, что в расширенном фильтре сайта.
 *
 * Значения правятся в собственном состоянии и уезжают наружу только по кнопке
 * «Искать»: иначе список под листом перестраивался бы на каждое касание,
 * а закрыть лист без изменений стало бы нельзя.
 *
 * Отбор делает общая `filterProperties` — та же функция, что на сайте. Поэтому
 * «работает так же» здесь не обещание, а устройство: расходиться нечему.
 */
export function FilterSheet({visible, filters, availableCities, onApply, onClose}: Props) {
  const {language, t} = useLanguage()
  const [draft, setDraft] = useState<Filters>(filters)
  const [showMore, setShowMore] = useState(false)
  const [showNear, setShowNear] = useState(false)

  // Лист открывается заново — подхватываем то, что снаружи.
  const open = () => setDraft(filters)

  const patch = (change: Partial<Filters>) => setDraft(current => ({...current, ...change}))

  const toNumber = (text: string): number | null => {
    const value = Number(text.replace(/[^\d]/g, ''))
    return Number.isFinite(value) && value > 0 ? value : null
  }

  /** Подпись удобства или места «рядом» — из общего пакета, своих не выдумываем. */
  const amenityLabel = (key: string): string =>
    (t.amenities as Record<string, string>)[key] ?? key

  const sortByLabel = (a: {key: string}, b: {key: string}) =>
    amenityLabel(a.key).localeCompare(amenityLabel(b.key), language === 'en' ? 'en' : 'az')

  const sortedMore = useMemo(() => [...moreFilterOptions].sort(sortByLabel), [t, language])
  const sortedNear = useMemo(() => [...nearFilterOptions].sort(sortByLabel), [t, language])

  /**
   * Места внутри выбранного города.
   *
   * ⚠️ Справочники у Баку и у остальных городов РАЗНЫЕ, и это не частный
   * случай, а устройство данных. У Баку есть и районы, и метро — они лежат в
   * `cityLocationOptions` и переключаются вкладкой. У прочих городов метро нет
   * вовсе, а посёлки перечислены в `cityDistricts` по городу. Точно так же
   * устроен выбор на сайте.
   */
  const isBaku = draft.city === 'Baku'
  const locationOptions = useMemo(() => {
    if (!draft.city) return []
    if (isBaku) return cityLocationOptions[draft.locationCategory] ?? []
    return (cityDistricts[draft.city] ?? []).map(name => ({key: name, az: name, en: name}))
  }, [draft.city, draft.locationCategory, isBaku])

  /** Названия районов и станций только на азербайджанском и английском. */
  const locationLabel = (option: {key: string; az: string; en: string}) =>
    language === 'en' ? option.en : option.az

  /**
   * Название места по ключу — для плашек выбранного.
   *
   * ⚠️ Ключ у районов и станций Баку это ТРАНСЛИТЕРАЦИЯ (`memar_ecemi`), а не
   * название: `toFilterOptions` в общем пакете прогоняет имя через `toOptionKey`.
   * Показывать ключ человеку нельзя. У посёлков прочих городов ключ совпадает с
   * названием — там подстановка просто ничего не меняет.
   *
   * Ищем в обоих справочниках Баку и в списке текущего города: плашка должна
   * подписываться и тогда, когда выбранное метро лежит в другой вкладке.
   */
  const locationNameByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const option of [...cityLocationOptions.rayon, ...cityLocationOptions.metro]) {
      map.set(option.key, locationLabel(option))
    }
    for (const option of locationOptions) {
      map.set(option.key, locationLabel(option))
    }
    return map
  }, [locationOptions, language])

  /**
   * Выбор места: не больше одного района и не больше одной станции.
   *
   * Повторяет правило сайта. Два района одновременно означали бы «или там, или
   * там» — а отбор у нас складывает условия, и такая выдача была бы пустой.
   */
  const toggleLocation = (key: string) => {
    if (!isBaku) {
      patch({locationTags: draft.locationTags.includes(key) ? [] : [key]})
      return
    }

    const rayons = cityLocationOptions.rayon ?? []
    const metros = cityLocationOptions.metro ?? []
    const chosenRayons = draft.locationTags.filter(tag => rayons.some(o => o.key === tag))
    const chosenMetros = draft.locationTags.filter(tag => metros.some(o => o.key === tag))

    if (draft.locationCategory === 'rayon') {
      patch({locationTags: [...(chosenRayons.includes(key) ? [] : [key]), ...chosenMetros]})
    } else {
      patch({locationTags: [...chosenRayons, ...(chosenMetros.includes(key) ? [] : [key])]})
    }
  }

  const toggleIn = (key: 'extraFilters' | 'nearbyPlaces', value: string) => {
    const current = draft[key]
    patch({
      [key]: current.includes(value) ? current.filter(item => item !== value) : [...current, value]
    } as Partial<Filters>)
  }

  /** Плашки выбранного — как на сайте, каждая снимается нажатием. */
  const chips = [
    ...draft.locationTags.map(key => ({
      id: 'loc-' + key,
      label: locationNameByKey.get(key) ?? key,
      drop: () => toggleLocation(key)
    })),
    ...draft.extraFilters.map(key => ({
      id: 'more-' + key,
      label: amenityLabel(key),
      drop: () => toggleIn('extraFilters', key)
    })),
    ...draft.nearbyPlaces.map(key => ({
      id: 'near-' + key,
      label: amenityLabel(key),
      drop: () => toggleIn('nearbyPlaces', key)
    }))
  ]

  /** Сбрасывает только расширенное, оставляя город, цену и тип. */
  const resetAdvanced = () =>
    patch({extraFilters: [], nearbyPlaces: [], locationTags: []})

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
                onPress={() => patch({city: '', locationTags: [], locationCategory: 'rayon'})}
              />
              {availableCities.map(city => (
                <Chip
                  key={city.value}
                  label={`${cityLabel(city.value, language)} ${city.count}`}
                  active={draft.city === city.value}
                  // Смена города обнуляет места: районы Габалы в Баку не значат
                  // ничего, и оставить их значило бы показать пустую выдачу.
                  onPress={() =>
                    patch(
                      draft.city === city.value
                        ? {city: '', locationTags: [], locationCategory: 'rayon'}
                        : {city: city.value, locationTags: [], locationCategory: 'rayon'}
                    )
                  }
                />
              ))}
            </View>
          </Section>

          {draft.city && locationOptions.length > 0 && (
            <Section title={t.filters.district}>
              {/* Вкладка «район / метро» только у Баку: больше нигде метро нет. */}
              {isBaku && (
                <View style={styles.tabs}>
                  {(['rayon', 'metro'] as LocationCategory[]).map(category => (
                    <Pressable
                      key={category}
                      onPress={() => patch({locationCategory: category})}
                      style={[styles.tab, draft.locationCategory === category && styles.tabActive]}
                    >
                      <Text
                        style={[
                          styles.tabText,
                          draft.locationCategory === category && styles.tabTextActive
                        ]}
                      >
                        {category === 'rayon' ? t.filters.district : 'Metro'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.chips}>
                {locationOptions.map(option => (
                  <Chip
                    key={option.key}
                    label={locationLabel(option)}
                    active={draft.locationTags.includes(option.key)}
                    onPress={() => toggleLocation(option.key)}
                  />
                ))}
              </View>
            </Section>
          )}

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

          <Section title={t.search.rooms}>
            <View style={styles.chips}>
              <Chip
                label={t.search.any}
                active={draft.rooms === null}
                onPress={() => patch({rooms: null})}
              />
              {ROOM_CHOICES.map(count => (
                <Chip
                  key={count}
                  label={String(count)}
                  active={draft.rooms === count}
                  onPress={() => patch({rooms: draft.rooms === count ? null : count})}
                />
              ))}
            </View>
          </Section>

          <Section title={t.search.pool}>
            <View style={styles.chips}>
              <Chip
                label={t.search.any}
                active={draft.hasPool === null}
                onPress={() => patch({hasPool: null})}
              />
              <Chip
                label={t.search.yes}
                active={draft.hasPool === true}
                onPress={() => patch({hasPool: draft.hasPool === true ? null : true})}
              />
              <Chip
                label={t.search.no}
                active={draft.hasPool === false}
                onPress={() => patch({hasPool: draft.hasPool === false ? null : false})}
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

          <Block
            title={t.search.moreFilters}
            count={draft.extraFilters.length}
            expanded={showMore}
            onToggle={() => setShowMore(open => !open)}
            onClear={() => patch({extraFilters: []})}
            clearLabel={t.buttons.clear}
            quick={sortedMore.filter(option => QUICK_MORE.includes(option.key))}
            all={sortedMore}
            chosen={draft.extraFilters}
            label={amenityLabel}
            onToggleOption={key => toggleIn('extraFilters', key)}
          />

          <Block
            title={t.search.near}
            count={draft.nearbyPlaces.length}
            expanded={showNear}
            onToggle={() => setShowNear(open => !open)}
            onClear={() => patch({nearbyPlaces: []})}
            clearLabel={t.buttons.clear}
            quick={sortedNear.filter(option => QUICK_NEAR.includes(option.key))}
            all={sortedNear}
            chosen={draft.nearbyPlaces}
            label={amenityLabel}
            onToggleOption={key => toggleIn('nearbyPlaces', key)}
          />

          {chips.length > 0 && (
            <View style={styles.selected}>
              {chips.map(chip => (
                <Pressable key={chip.id} onPress={chip.drop} style={styles.selectedChip}>
                  <Text style={styles.selectedChipText}>{chip.label}</Text>
                  <Ionicons name="close" size={13} color={colors.primary} />
                </Pressable>
              ))}
              <Pressable onPress={resetAdvanced} style={styles.resetAdvanced}>
                <Text style={styles.resetAdvancedText}>{t.filters.resetAdvanced}</Text>
              </Pressable>
            </View>
          )}
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

/**
 * Складной раздел «Доп. фильтры» и «Рядом».
 *
 * Свёрнут по умолчанию и показывает популярное сразу: в каждом списке больше
 * двадцати пунктов, и развернуть их все значит сделать лист неперелистываемым.
 * На сайте ровно так же — быстрый ряд снаружи, полный список по кнопке.
 */
function Block({
  title,
  count,
  expanded,
  onToggle,
  onClear,
  clearLabel,
  quick,
  all,
  chosen,
  label,
  onToggleOption
}: {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
  onClear: () => void
  clearLabel: string
  quick: Array<{key: string}>
  all: Array<{key: string}>
  chosen: string[]
  label: (key: string) => string
  onToggleOption: (key: string) => void
}) {
  return (
    <View style={styles.section}>
      <Pressable onPress={onToggle} style={styles.blockHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {count > 0 && (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{count}</Text>
          </View>
        )}
        <View style={styles.blockSpacer} />
        {count > 0 && (
          <Pressable onPress={onClear} hitSlop={8}>
            <Text style={styles.clear}>{clearLabel}</Text>
          </Pressable>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.gray400}
        />
      </Pressable>

      <View style={styles.chips}>
        {(expanded ? all : quick).map(option => (
          <Chip
            key={option.key}
            label={label(option.key)}
            active={chosen.includes(option.key)}
            onPress={() => onToggleOption(option.key)}
          />
        ))}
      </View>
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
  blockHead: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  blockSpacer: {flex: 1},
  clear: {fontSize: fontSize.xs, color: colors.neutral, fontWeight: '600'},
  countPill: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5
  },
  countPillText: {color: colors.white, fontSize: fontSize.xs, fontWeight: '700'},
  tabs: {flexDirection: 'row', gap: spacing.xs},
  tab: {
    paddingHorizontal: spacing.base,
    paddingVertical: 6,
    borderRadius: radius.base,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  tabActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  tabText: {fontSize: fontSize.xs, fontWeight: '700', color: colors.gray700},
  tabTextActive: {color: colors.white},
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
  selected: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray100
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary
  },
  selectedChipText: {fontSize: fontSize.xs, color: colors.primary, fontWeight: '600'},
  resetAdvanced: {paddingHorizontal: spacing.sm, paddingVertical: 5},
  resetAdvancedText: {fontSize: fontSize.xs, color: colors.neutral, fontWeight: '600'},
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
