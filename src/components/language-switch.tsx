import {useState} from 'react'
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native'

import type {Language} from '@birklik/core/types'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

// Порядок и подписи как в шапке сайта.
const OPTIONS: Array<{code: Language; label: string}> = [
  {code: 'az', label: 'AZ'},
  {code: 'en', label: 'EN'},
  {code: 'ru', label: 'RU'}
]

/**
 * Переключатель языка. Повторяет `.lang-current` из шапки сайта: серая обводка
 * и тёмные буквы в покое, зелёная заливка при открытом списке.
 *
 * Раньше три языка стояли в шапке подряд и занимали её половину. Теперь одна
 * кнопка с текущим языком, а выбор — списком по нажатию, как на сайте.
 *
 * Список открывается через Modal, а не всплывающим блоком: у экранов навигации
 * своя область отрисовки, и обычный absolute обрезался бы границей шапки.
 * Выбор запоминается между запусками — этим ведает провайдер языка.
 */
export function LanguageSwitch() {
  const {language, setLanguage} = useLanguage()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.button, open && styles.buttonOpen]}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Language: ${language.toUpperCase()}`}
      >
        <Text style={[styles.buttonLabel, open && styles.buttonLabelOpen]}>
          {language.toUpperCase()}
        </Text>
        <Text style={[styles.chevron, open && styles.buttonLabelOpen]}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* Нажатие мимо списка закрывает его — как клик вне выпадающего меню
            на сайте. Без этого выйти можно было бы только кнопкой «назад». */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.dropdown}>
            {OPTIONS.map(option => {
              const active = option.code === language
              return (
                <Pressable
                  key={option.code}
                  onPress={() => {
                    setLanguage(option.code)
                    setOpen(false)
                  }}
                  style={({pressed}) => [styles.option, pressed && styles.optionPressed]}
                >
                  <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                    {option.label}
                  </Text>
                  {active && <Text style={styles.check}>✓</Text>}
                </Pressable>
              )
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    // 999px на сайте — здесь достаточно половины высоты.
    borderRadius: 999,
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  buttonOpen: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  buttonLabel: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700'
  },
  buttonLabelOpen: {
    color: colors.white
  },
  chevron: {
    color: colors.text,
    fontSize: fontSize.xs
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.15)'
  },
  dropdown: {
    position: 'absolute',
    // Отступ сверху выводит список под шапку, как на сайте.
    top: 96,
    right: spacing.md,
    minWidth: 110,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.base,
    padding: 4,
    ...shadow.base
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.sm
  },
  optionPressed: {
    backgroundColor: colors.gray100
  },
  optionLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700'
  },
  optionLabelActive: {
    color: colors.primary
  },
  check: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700'
  }
})
