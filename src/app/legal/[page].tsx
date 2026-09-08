import {ScrollView, StyleSheet, Text, View} from 'react-native'
import {Stack, useLocalSearchParams} from 'expo-router'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

/**
 * Страницы из подвала сайта: о нас, контакты, условия, конфиденциальность,
 * пользовательское соглашение.
 *
 * Тексты берутся из общего пакета — тех же файлов, что читает сайт. Копировать
 * их сюда нельзя: это документы, они меняются, и вторая копия разойдётся с
 * первой незаметно, а расхождение в пользовательском соглашении между сайтом и
 * приложением — не косметика.
 *
 * Четыре из пяти страниц устроены одинаково (заголовок и разделы), контакты —
 * иначе, отдельными полями. Поэтому у них разная отрисовка.
 */

const PAGES = ['about', 'contact', 'terms', 'privacy', 'userAgreement'] as const
export type LegalPage = (typeof PAGES)[number]

function isLegalPage(value: string | undefined): value is LegalPage {
  return !!value && (PAGES as readonly string[]).includes(value)
}

export default function LegalPageScreen() {
  const {page} = useLocalSearchParams<{page: string}>()
  const {t} = useLanguage()

  if (!isLegalPage(page)) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t.messages.error}</Text>
      </View>
    )
  }

  const data = t.pages[page]
  const title = data.title

  return (
    <>
      <Stack.Screen options={{title: t.footer[page]}} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{title}</Text>

        {page === 'contact' ? <ContactBody /> : <Sections page={page} />}
      </ScrollView>
    </>
  )
}

/** Разделы: у условий, конфиденциальности и соглашения есть номера, у «о нас» нет. */
function Sections({page}: {page: Exclude<LegalPage, 'contact'>}) {
  const {t} = useLanguage()
  const data = t.pages[page]
  const lastUpdated = 'lastUpdated' in data ? data.lastUpdated : undefined

  return (
    <>
      {lastUpdated ? <Text style={styles.updated}>{lastUpdated}</Text> : null}

      {data.sections.map((section, index) => {
        const number = 'number' in section ? section.number : undefined
        return (
          <View key={`${section.title}-${index}`} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {number ? `${number}. ` : ''}
              {section.title}
            </Text>
            {/* Содержимое приходит одной строкой с переносами — так и рисуем,
                разбирать его на абзацы незачем. */}
            <Text style={styles.body}>{section.content}</Text>
          </View>
        )
      })}
    </>
  )
}

function ContactBody() {
  const {t} = useLanguage()
  const c = t.pages.contact

  const rows: Array<[string, string]> = [
    [c.phone, c.phoneNumber],
    [c.email, c.emailAddress],
    [c.address, c.addressValue],
    [c.socialNetworks, `${c.facebook}\n${c.instagram}`]
  ]

  return (
    <>
      <Text style={styles.body}>{c.intro}</Text>

      <View style={styles.card}>
        {rows.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.body}>{c.closing}</Text>
    </>
  )
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  content: {padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.base},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  title: {fontSize: fontSize.xl, fontWeight: '800', color: colors.text, lineHeight: 30},
  updated: {fontSize: fontSize.xs, color: colors.gray400},
  section: {gap: spacing.xs},
  sectionTitle: {fontSize: fontSize.base, fontWeight: '700', color: colors.text},
  body: {fontSize: fontSize.sm, color: colors.gray700, lineHeight: 22},
  muted: {fontSize: fontSize.base, color: colors.neutral},
  card: {
    backgroundColor: colors.gray50,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.gray200,
    padding: spacing.base,
    gap: spacing.sm
  },
  row: {gap: 2},
  rowLabel: {fontSize: fontSize.xs, fontWeight: '700', color: colors.gray500, textTransform: 'uppercase'},
  rowValue: {fontSize: fontSize.sm, color: colors.text, lineHeight: 20}
})
