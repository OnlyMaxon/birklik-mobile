import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {getLocales} from 'expo-localization'

import type {Language, Translations} from '@birklik/core/types'

import az from '@birklik/core/messages/az/app.json'
import en from '@birklik/core/messages/en/app.json'
import ru from '@birklik/core/messages/ru/app.json'

/**
 * Язык приложения.
 *
 * Переводы берутся из общего пакета — те же файлы читает сайт. Своей копии в
 * приложении нет и быть не должно: разъедутся формулировки.
 *
 * Все три языка подключены статически, а не по требованию. Так надо: Metro
 * собирает бандл заранее и подгружать словарь во время работы не умеет.
 * Все три вместе весят около 90 КБ — на фоне трёхмегабайтного бандла это ничто,
 * а переключение выходит мгновенным и работает без сети.
 */

const CATALOGS: Record<Language, Translations> = {
  az: (az as {App: Translations}).App,
  en: (en as {App: Translations}).App,
  ru: (ru as {App: Translations}).App
}

const LANGUAGES: Language[] = ['az', 'en', 'ru']
const STORAGE_KEY = 'birklik.language'
const DEFAULT_LANGUAGE: Language = 'az'

/**
 * Язык системы, если он нам знаком. Азербайджанский по умолчанию — площадка
 * местная, и для гостя без явного выбора это ближе к истине, чем английский.
 */
function deviceLanguage(): Language {
  for (const locale of getLocales()) {
    const code = locale.languageCode?.toLowerCase()
    if (code && (LANGUAGES as string[]).includes(code)) return code as Language
  }
  return DEFAULT_LANGUAGE
}

interface LanguageValue {
  language: Language
  t: Translations
  setLanguage: (next: Language) => void
}

const LanguageContext = createContext<LanguageValue | null>(null)

export function LanguageProvider({children}: {children: ReactNode}) {
  // Первый кадр рисуется языком системы, а не пустотой: сохранённый выбор
  // читается из хранилища асинхронно, и ждать его — значит показать пустой
  // экран на ровном месте. Если выбор был, он приедет следующим кадром.
  const [language, setLanguageState] = useState<Language>(deviceLanguage)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (saved && (LANGUAGES as string[]).includes(saved)) setLanguageState(saved as Language)
      })
      .catch(() => undefined)
  }, [])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    // Запись не ждём: язык уже переключился на экране, а неудача сохранения
    // означает лишь то, что при следующем запуске возьмётся системный.
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined)
  }, [])

  const value = useMemo(
    () => ({language, t: CATALOGS[language], setLanguage}),
    [language, setLanguage]
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useLanguage вызван вне LanguageProvider')
  return value
}
