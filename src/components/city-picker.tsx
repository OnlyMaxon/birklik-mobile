import {useMemo, useState} from 'react'
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {cities} from '@birklik/core/data'
import {placeMatchScore} from '@birklik/core/data'
import type {Language} from '@birklik/core/types'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

type Available = {value: string; count: number}

type Props = {
  value: string
  /** Регионы, где объявления действительно есть, с числом. */
  available: Available[]
  onChange: (city: string) => void
}

/** Сколько подсказок показывать — больше утомляет, меньше не покрывает. */
const LIMIT = 6

/**
 * Выбор региона строкой с подсказками.
 *
 * ⚠️ Раньше здесь был ряд кнопок — по кнопке на каждый регион. При пятнадцати
 * регионах он занимал три ряда и был главной причиной, по которой лист
 * фильтров не помещался в экран. Строка занимает один ряд всегда.
 *
 * Подсказки ищет `placeMatchScore` из общего пакета — та же функция, что
 * помогает поиску на сайте. Она прощает опечатки и знает все написания:
 * «Gebele», «Qabala» и «Габала» приводят к одному городу. ⚠️ Писать своё
 * сравнение здесь было бы ошибкой: тогда приложение и сайт угадывали бы
 * по-разному, а человек этого не ждёт.
 *
 * Предлагаются ТОЛЬКО регионы, где объявления есть. Справочник городов вчетверо
 * шире реальной географии, и подсказать пустой регион значит завести в никуда.
 */
export function CityPicker({value, available, onChange}: Props) {
  const {language, t} = useLanguage()
  const [query, setQuery] = useState('')

  /** Все написания региона — по ним и ищем. */
  const spellings = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const item of available) {
      const option = cities.find(city => city.value === item.value)
      map.set(
        item.value,
        option ? [option.value, option.az, option.en, option.ru] : [item.value]
      )
    }
    return map
  }, [available])

  const label = (city: string): string => {
    const option = cities.find(item => item.value === city)
    return option ? option[language as Language] : city
  }

  const suggestions = useMemo(() => {
    // Пусто — показываем то, где объявлений больше всего. Так строка остаётся
    // полезной и до первой буквы, а не выглядит мёртвым полем.
    if (!query.trim()) return available.slice(0, LIMIT)

    return available
      .map(item => ({
        item,
        score: Math.max(...(spellings.get(item.value) ?? []).map(name => placeMatchScore(name, query)))
      }))
      .filter(entry => entry.score > 0)
      // Сначала точность совпадения, при равной — где объявлений больше.
      .sort((a, b) => b.score - a.score || b.item.count - a.item.count)
      .slice(0, LIMIT)
      .map(entry => entry.item)
  }, [query, available, spellings])

  // Регион выбран — строка и подсказки больше не нужны, нужна только плашка
  // с возможностью передумать.
  if (value) {
    return (
      <Pressable
        onPress={() => {
          onChange('')
          setQuery('')
        }}
        style={styles.chosen}
      >
        <Ionicons name="location" size={15} color={colors.white} />
        <Text style={styles.chosenText}>{label(value)}</Text>
        <Ionicons name="close" size={15} color={colors.white} />
      </Pressable>
    )
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.field}>
        <Ionicons name="search-outline" size={16} color={colors.gray400} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={t.search.city}
          placeholderTextColor={colors.gray400}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.gray400} />
          </Pressable>
        ) : null}
      </View>

      {suggestions.length > 0 ? (
        <View style={styles.chips}>
          {suggestions.map(item => (
            <Pressable
              key={item.value}
              onPress={() => {
                onChange(item.value)
                setQuery('')
              }}
              style={styles.chip}
            >
              <Text style={styles.chipText}>{label(item.value)}</Text>
              <Text style={styles.chipCount}>{item.count}</Text>
            </Pressable>
          ))}
        </View>
      ) : query.trim() ? (
        // ⚠️ «Не нашлось» только ПОСЛЕ ввода. Сначала сообщение показывалось
        // всегда — в том числе когда список регионов пуст, потому что
        // объявления не загрузились. Человек ничего не искал, а ему отвечали,
        // что ничего не найдено; на снимке с устройства это видно сразу.
        <Text style={styles.empty}>{t.messages.noResults}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.sm},
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.base,
    backgroundColor: colors.white
  },
  input: {
    flex: 1,
    paddingVertical: spacing.base,
    fontSize: fontSize.base,
    color: colors.text
  },
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  chipText: {fontSize: fontSize.sm, color: colors.gray700},
  chipCount: {fontSize: fontSize.xs, color: colors.neutral, fontWeight: '700'},
  chosen: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.primary
  },
  chosenText: {fontSize: fontSize.sm, color: colors.white, fontWeight: '600'},
  empty: {fontSize: fontSize.sm, color: colors.neutral, paddingVertical: spacing.xs}
})
