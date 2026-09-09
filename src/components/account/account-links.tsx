import {Pressable, StyleSheet, Text, View} from 'react-native'
import {router} from 'expo-router'
import {Ionicons} from '@expo/vector-icons'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

// Порядок как в подвале сайта.
const PAGES = ['about', 'contact', 'terms', 'privacy', 'userAgreement'] as const

/**
 * Ссылки на документы площадки — то, что на сайте лежит в подвале.
 *
 * В приложении подвала нет: страницы прокручиваются каждая своя, и общего низа
 * у них не бывает. Поэтому документы собраны здесь, в кабинете, — это
 * единственное место, куда человек приходит «по делам учётной записи».
 *
 * Тексты берутся из общего пакета, тех же файлов, что читает сайт.
 */
export function AccountLinks() {
  const {t} = useLanguage()

  return (
    <View style={styles.wrap}>
      {PAGES.map(page => (
        <Pressable
          key={page}
          style={({pressed}) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push({pathname: '/legal/[page]', params: {page}})}
        >
          <Text style={styles.label}>{t.footer[page]}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.gray400} />
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.white,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.gray200,
    overflow: 'hidden'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray200
  },
  rowPressed: {backgroundColor: colors.gray50},
  label: {fontSize: fontSize.sm, color: colors.text}
})
