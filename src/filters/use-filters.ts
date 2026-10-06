import {useCallback, useMemo, useState} from 'react'

import type {LocationCategory, PropertyType} from '@birklik/core/types'

/**
 * Состояние фильтров витрины.
 *
 * Набор повторяет то, что умеет общая `filterProperties`, и совпадает с
 * расширенным фильтром сайта: регион и место внутри него, тип, цена, комнаты,
 * бассейн, удобства, что рядом. Вместимость — добавка телефона, на сайте её в
 * панели фильтров нет.
 *
 * ⚠️ Раньше здесь было вчетверо меньше полей, и это было сознательным
 * сужением: «оставлено то, что действительно делит базу из 72 объявлений».
 * Сужение оказалось неверным — фильтры сайта и приложения разъехались, и
 * человек, привыкший искать «с сауной» или «у метро», в приложении этого не
 * находил. Поля те же, что на сайте, и отбирает их одна и та же функция.
 *
 * Дат заезда и выезда здесь по-прежнему нет: `filterProperties` их принимает,
 * но выбор диапазона — это отдельный календарь, а не ряд кнопок, и он уместен
 * на странице объявления, где бронь и оформляется.
 */
export interface Filters {
  search: string
  city: string
  type: PropertyType | ''
  minPrice: number | null
  maxPrice: number | null
  minGuests: number | null
  rooms: number | null
  hasPool: boolean | null
  /** `rayon` или `metro` — какой справочник мест показывать для города. */
  locationCategory: LocationCategory
  locationTags: string[]
  extraFilters: string[]
  nearbyPlaces: string[]
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  city: '',
  type: '',
  minPrice: null,
  maxPrice: null,
  minGuests: null,
  rooms: null,
  hasPool: null,
  locationCategory: 'rayon',
  locationTags: [],
  extraFilters: [],
  nearbyPlaces: []
}

/**
 * Сколько условий задано — для значка на кнопке фильтров.
 *
 * Считаем так же, как сайт: простые условия по одному, а каждое выбранное
 * удобство, место и «рядом» — своим. Поэтому число совпадает с количеством
 * плашек, которые человек видит в листе, и не расходится с ними.
 *
 * `locationCategory` не в счёт: это не условие отбора, а переключатель
 * справочника — сам по себе он ничего не отсекает.
 */
export function countActive(filters: Filters): number {
  return (
    (filters.city ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.minPrice !== null || filters.maxPrice !== null ? 1 : 0) +
    (filters.minGuests !== null ? 1 : 0) +
    (filters.rooms !== null ? 1 : 0) +
    (filters.hasPool !== null ? 1 : 0) +
    filters.locationTags.length +
    filters.extraFilters.length +
    filters.nearbyPlaces.length
  )
}

export function useFilters() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const patch = useCallback((change: Partial<Filters>) => {
    setFilters(current => ({...current, ...change}))
  }, [])

  const reset = useCallback(() => setFilters(EMPTY_FILTERS), [])

  // Поиск в счёт не идёт: он живёт в отдельной строке над списком и виден сам.
  const activeCount = useMemo(() => countActive(filters), [filters])

  return {filters, patch, reset, activeCount}
}
