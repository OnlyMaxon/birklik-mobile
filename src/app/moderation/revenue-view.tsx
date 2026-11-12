import {useState} from 'react'
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native'

import type {MonthlyRevenue, RevenueProvider, Translations} from '@birklik/core/types'

import {colors, fontSize, radius, spacing} from '@/theme/theme'

/**
 * Раздел «Выручка» в модераторке приложения.
 *
 * Тот же, что на сайте, и подписи у них общие — из словаря, а не свои. Считает
 * не он: числа приходят готовыми из коллекции `revenue/{YYYY-MM}`, которую
 * собирает триггер `recordRevenue` в функциях по журналу платежей.
 *
 * ⚠️ Числа БРУТТО — столько заплатили покупатели. Apple и Google удерживают
 * свою долю, и на счёт придёт меньше. Оговорка под итогом обязательна: без неё
 * владелец сверит итог с поступлением и решит, что счётчик врёт.
 *
 * Вынесен отдельным файлом, а не вшит в `index.tsx`: тот уже под девятьсот
 * строк, и шесть разделов в нём живут одним полотном. Седьмой класть туда же
 * значило бы сделать файл нечитаемым окончательно.
 */

const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
] as const

/** Знак валюты для сумм «как заплатили». Незнакомую пишем кодом: `10 PLN`. */
const CURRENCY_SIGNS: Record<string, string> = {AZN: '₼', USD: '$', EUR: '€'}

const PROVIDERS: RevenueProvider[] = ['azericard', 'app_store', 'google_play']

/**
 * Сумма для показа: `55 ₼`, `16.83 ₼`.
 *
 * Дробь показывается только когда она есть: манатные покупки все целые, и
 * `55.00 ₼` рядом с ценой «55 ₼» на экране тарифов выглядело бы другой суммой.
 */
function money(value: number | undefined, sign = '₼'): string {
  const rounded = Math.round((value ?? 0) * 100) / 100
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)} ${sign}`
}

/** `2026-11` → «Ноябрь 2026». */
function monthLabel(month: string, t: Translations): string {
  const [year, index] = month.split('-')
  const key = MONTH_KEYS[Number(index) - 1]
  return key ? `${t.calendar.months[key]} ${year}` : month
}

function providerLabel(provider: RevenueProvider, t: Translations): string {
  if (provider === 'app_store') return t.moderation.providerAppStore
  if (provider === 'google_play') return t.moderation.providerGooglePlay
  return t.moderation.providerAzericard
}

interface RevenueViewProps {
  months: MonthlyRevenue[]
  failed: boolean
  t: Translations
}

export function RevenueView({months, failed, t}: RevenueViewProps) {
  // Выбранный месяц держим ИМЕНЕМ, а не номером в списке: первого числа в
  // списке появляется новый месяц, и номер поехал бы, а имя нет.
  const [selected, setSelected] = useState('')
  const current = months.find(item => item.month === selected) ?? months[0]

  if (failed) return <Text style={styles.empty}>{t.moderation.loadFailed}</Text>
  if (!current) return <Text style={styles.empty}>{t.moderation.revenueEmpty}</Text>

  const gross = current.grossAzn ?? 0
  const refunded = current.refundedAzn ?? 0

  /** Суммы «как заплатили», по валютам: `75 ₼ · 10 $`. */
  const byCurrency = Object.entries(current.gross ?? {})
    .filter(([, amount]) => typeof amount === 'number' && amount !== 0)
    .map(([code, amount]) => money(amount as number, CURRENCY_SIGNS[code] ?? code))

  return (
    <>
      {months.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.months}
        >
          {months.map(item => {
            const active = item.month === current.month
            return (
              <Pressable
                key={item.month}
                onPress={() => setSelected(item.month)}
                style={[styles.monthChip, active && styles.monthChipActive]}
              >
                <Text style={[styles.monthText, active && styles.monthTextActive]}>
                  {monthLabel(item.month, t)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.totalLabel}>{t.moderation.revenueTotal}</Text>
        <Text style={styles.totalValue}>{money(gross)}</Text>
        <Text style={styles.totalMeta}>
          {current.count ?? 0} {t.moderation.revenuePurchases}
          {byCurrency.length > 1 ? ` · ${byCurrency.join(' · ')}` : ''}
        </Text>

        {refunded > 0 ? (
          <View style={styles.refund}>
            <Text style={styles.refundText}>
              {t.moderation.revenueRefunded}: {money(refunded)} ({current.refundCount ?? 0})
            </Text>
            <Text style={styles.refundStrong}>
              {t.moderation.revenueNet}: {money(gross - refunded)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.blockTitle}>{t.moderation.revenueByStore}</Text>
        {PROVIDERS.map(provider => (
          <View key={provider} style={styles.row}>
            <Text style={styles.rowLabel}>{providerLabel(provider, t)}</Text>
            <Text style={styles.rowValue}>
              {money(current.byProviderAzn?.[provider])}
              <Text style={styles.dim}> · {current.countByProvider?.[provider] ?? 0}</Text>
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.blockTitle}>{t.moderation.revenueByProduct}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t.moderation.revenueTier}</Text>
          <Text style={styles.rowValue}>{money(current.byKindAzn?.tier)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{t.moderation.revenueBoost}</Text>
          <Text style={styles.rowValue}>{money(current.byKindAzn?.boost)}</Text>
        </View>
      </View>

      {/* Оговорки. Первая — всегда: она объясняет, почему итог не сойдётся с
          поступлением на счёт. Остальные — только когда есть что оговаривать. */}
      <View style={styles.notes}>
        <Text style={styles.note}>{t.moderation.revenueGrossNote}</Text>
        {(current.estimatedCount ?? 0) > 0 ? (
          <Text style={styles.note}>
            {t.moderation.revenueEstimatedNote.replace('{count}', String(current.estimatedCount))}
          </Text>
        ) : null}
        {(current.unconvertedCount ?? 0) > 0 ? (
          <Text style={styles.note}>
            {t.moderation.revenueUnconvertedNote.replace(
              '{count}',
              String(current.unconvertedCount)
            )}
          </Text>
        ) : null}
        {(current.missingAmountCount ?? 0) > 0 ? (
          <Text style={styles.note}>
            {t.moderation.revenueMissingNote.replace('{count}', String(current.missingAmountCount))}
          </Text>
        ) : null}
        {current.usdRate ? (
          <Text style={styles.note}>
            {t.moderation.revenueRate}: 1 $ = {current.usdRate} ₼
          </Text>
        ) : null}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  empty: {
    textAlign: 'center',
    color: colors.gray500,
    fontSize: fontSize.sm,
    paddingVertical: spacing.xl
  },
  months: {gap: spacing.xs, paddingVertical: 2},
  monthChip: {
    paddingHorizontal: spacing.base,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  monthChipActive: {backgroundColor: colors.gray700, borderColor: colors.gray700},
  monthText: {fontSize: fontSize.xs, color: colors.gray600, fontWeight: '600'},
  monthTextActive: {color: colors.white},
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: spacing.base,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.gray200
  },
  totalLabel: {
    fontSize: fontSize.xs,
    color: colors.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  totalValue: {
    marginTop: 4,
    fontSize: 34,
    fontWeight: '700',
    color: colors.gray900
  },
  totalMeta: {marginTop: 2, fontSize: fontSize.sm, color: colors.gray500},
  refund: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    gap: 2
  },
  // ⚠️ Не `colors.warning`: та жёлтая (#F4C542) и на белой карточке почти не
  // читается. Здесь тот же тёмный янтарь, что у полосы возвратов на сайте.
  refundText: {fontSize: fontSize.sm, color: '#B45309'},
  refundStrong: {fontSize: fontSize.sm, fontWeight: '700', color: '#B45309'},
  blockTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray100
  },
  rowLabel: {fontSize: fontSize.sm, color: colors.gray700, flexShrink: 1},
  rowValue: {fontSize: fontSize.sm, color: colors.gray900, fontWeight: '600'},
  dim: {color: colors.gray400, fontWeight: '400'},
  notes: {marginTop: spacing.sm, gap: 4},
  note: {fontSize: fontSize.xs, color: colors.gray500, lineHeight: 18}
})
