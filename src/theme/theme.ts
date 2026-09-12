/**
 * Единственный источник оформления приложения.
 *
 * Значения перенесены один в один из веба — `src/app/base.css` в репозитории
 * Birklik.az. Дизайн там уже разложен на переменные, поэтому приложение
 * совпадает с сайтом по цвету, а не «примерно похоже».
 *
 * Меняя цвет здесь, поменяй и там: общего файла у двух проектов нет и быть не
 * может — React Native не читает CSS.
 */

export const colors = {
  // Зелёный — меню, контейнеры, шапки
  primary: '#2E7D5B',
  primaryLight: '#4a9971',
  primaryDark: '#1d5940',

  // Синий — второстепенные действия
  secondary: '#4DA8DA',
  secondaryLight: '#72bce4',
  secondaryDark: '#2d88ba',

  // Оранжевый — поиск, статусы, платные тарифы
  accent: '#FF7A00',
  accentLight: '#ff9833',
  accentDark: '#cc6200',

  text: '#1A1A1A',
  background: '#FFFFFF',
  neutral: '#6B7280',
  white: '#FFFFFF',

  gray50: '#F5F5F5',
  gray100: '#EBEBEB',
  gray200: '#E0E0E0',
  gray300: '#CACACA',
  gray400: '#A0A0A0',
  gray500: '#6F6F6F',
  gray600: '#4A4A4A',
  gray700: '#333333',
  gray800: '#1F1F1F',
  gray900: '#111111',

  success: '#10b981',
  warning: '#F4C542',
  error: '#E05A4F',

  // Тёмный фон подложки страницы — на вебе это background у html
  backdrop: '#0d1f17'
} as const

/**
 * Радиусы. На вебе заданы в rem от 16px — здесь пересчитаны в точки:
 * 0.35rem → 6, 0.75rem → 12, 0.95rem → 15, 1.25rem → 20, 1.5rem → 24.
 */
export const radius = {
  sm: 6,
  base: 12,
  md: 15,
  lg: 20,
  xl: 24
} as const

/**
 * Тени. В CSS это одна строка, в React Native — набор свойств, причём разный
 * на двух платформах: iOS рисует по shadowOffset и shadowRadius, Android
 * знает только elevation. Поэтому здесь готовые объекты под расстановку,
 * а не перевод формулы.
 */
export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2
  },
  base: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4
  },
  md: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 8
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 16},
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 16
  }
} as const

/** Шаг отступов. На вебе разнобой, здесь сведено к сетке в 4 точки. */
export const spacing = {
  xs: 4,
  sm: 8,
  base: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
} as const

/**
 * Шрифты. На вебе Manrope, Sora и Outfit подключены через веб-шрифты; в
 * приложении их надо положить файлами и загрузить через expo-font, иначе
 * названия ничего не значат. Пока не загружены — здесь системные, чтобы
 * приложение не притворялось, будто шрифт уже тот самый.
 */
export const fonts = {
  body: undefined as string | undefined,
  display: undefined as string | undefined,
  hero: undefined as string | undefined
} as const

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  title: 28,
  hero: 34
} as const

export const theme = {colors, radius, shadow, spacing, fonts, fontSize} as const

