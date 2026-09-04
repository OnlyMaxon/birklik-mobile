import {useCallback, useMemo, useState} from 'react'

import type {PropertyType} from '@birklik/core/types'

/**
 * Состояние фильтров витрины.
 *
 * Набор полей намеренно уже, чем `FilterState` на сайте: там есть ещё удобства,
 * категории мест, метро и даты. Здесь оставлено то, что действительно делит
 * базу из 72 объявлений — регион, тип, цена, вместимость и текст. Остальное
 * добавлять, когда появится, что делить.
 */
export interface Filters {
  search: string
  city: string
  type: PropertyType | ''
  minPrice: number | null
  maxPrice: number | null
  minGuests: number | null
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  city: '',
  type: '',
  minPrice: null,
  maxPrice: null,
  minGuests: null
}

/** Сколько условий задано — для значка на кнопке фильтров. */
export function countActive(filters: Filters): number {
  return (
    (filters.city ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.minPrice !== null || filters.maxPrice !== null ? 1 : 0) +
    (filters.minGuests !== null ? 1 : 0)
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
