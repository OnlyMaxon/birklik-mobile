import {View} from 'react-native'

import {cityDistricts, cityLocationOptions} from '@birklik/core/data'
import type {LocationCategory} from '@birklik/core/types'

import {PickerField} from '@/components/picker-field'
import {useLanguage} from '@/i18n/language-provider'

type Props = {
  city: string
  locationTags: string[]
  onChange: (tags: string[], category: LocationCategory) => void
}

/**
 * Выбор места внутри города — район, а для Баку ещё и станция метро.
 *
 * ⚠️ Появился 2026-09-26, потому что приложение расходилось с сайтом в данных,
 * а не только в виде. Здесь стояло ПОЛЕ СВОБОДНОГО ТЕКСТА, и `locationTags` не
 * записывались вовсе. Фильтр на сайте отбирает именно по ним — значит любое
 * объявление, поданное с телефона, в отбор по району не попадало никогда.
 * Текстовый поиск его находил, фильтр — нет, и заметить это со стороны было
 * нечем.
 *
 * Правила выбора повторяют сайт (`CityLocationPicker`):
 *
 *  - Баку — не больше одного района И не больше одной станции метро;
 *  - остальные города — один район из `cityDistricts`;
 *  - города, которых нет в `cityDistricts`, второго уровня не имеют вовсе,
 *    и тогда выбирать нечего — раздел не показывается.
 *
 * ⚠️ Порядок меток значим: район первым, метро вторым. Из первой метки
 * получается поле `district`, и на сайте порядок такой же.
 *
 * Вид отличается от сайта намеренно: там флажки списком, здесь два поля с
 * поиском. Данные на выходе те же, а ставить на телефон список из полусотни
 * флажков незачем.
 */
export function CityLocationPicker({city, locationTags, onChange}: Props) {
  const {t, language} = useLanguage()

  const isBaku = city === 'Baku'

  // Подписи берутся так же, как на сайте: английская для английского языка,
  // азербайджанская во всех прочих. Русских названий у мест в справочнике нет.
  const labelOf = (option: {key: string; az: string; en: string}) =>
    language === 'en' ? option.en : option.az

  const rayonOptions = isBaku
    ? cityLocationOptions.rayon
    : (cityDistricts[city] ?? []).map(name => ({key: name, az: name, en: name}))
  const metroOptions = isBaku ? cityLocationOptions.metro : []

  if (rayonOptions.length === 0 && metroOptions.length === 0) return null

  const selectedRayon = locationTags.find(tag => rayonOptions.some(o => o.key === tag)) ?? ''
  const selectedMetro = locationTags.find(tag => metroOptions.some(o => o.key === tag)) ?? ''

  // Пустое значение первым — иначе выбранное место нечем снять.
  const withClear = (options: Array<{key: string; az: string; en: string}>) => [
    {value: '', label: t.buttons.clear},
    ...options.map(option => ({value: option.key, label: labelOf(option)}))
  ]

  const emit = (rayon: string, metro: string, category: LocationCategory) =>
    onChange([rayon, metro].filter(Boolean), category)

  return (
    <View>
      <PickerField
        label={isBaku ? t.listing.districtsTab : t.search.district}
        placeholder={t.listing.selectDistrict}
        options={withClear(rayonOptions)}
        value={selectedRayon}
        onChange={value => emit(value, selectedMetro, 'rayon')}
      />

      {metroOptions.length > 0 ? (
        <PickerField
          label={t.listing.metroTab}
          placeholder={t.listing.selectDistrictMetro}
          options={withClear(metroOptions)}
          value={selectedMetro}
          onChange={value => emit(selectedRayon, value, value ? 'metro' : 'rayon')}
        />
      ) : null}
    </View>
  )
}
