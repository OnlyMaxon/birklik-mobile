import {useState} from 'react'
import {Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native'
import {router} from 'expo-router'

import type {Comment, Property, ReportReason} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import {addComment, reportComment} from '@/services/interactions-service'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

type Props = {
  property: Property
}

/** Порядок и состав причин — те же, что в окне жалобы на сайте. */
const REASONS: ReportReason[] = ['spam', 'inappropriate', 'offensive', 'misleading', 'other']

/**
 * Комментарии к объявлению.
 *
 * Читаются прямо из документа объявления — они там и лежат, отдельной коллекции
 * нет. А вот пишутся через сервер: правила Firestore запрещают клиенту трогать
 * поле `comments`, потому что через него можно было переписать чужие отзывы.
 *
 * Ответы на комментарии здесь пока не делаем: на сайте они есть, но за всё
 * время работы площадки комментариев не оставили ни одного, и ветки ответов
 * были бы работой вхолостую. Появятся комментарии — добавим.
 *
 * ⚠️ Жалоба, в отличие от ответов, обязательна: правила Google Play требуют от
 * приложения с пользовательским контентом встроенный способ пожаловаться. До
 * этого пожаловаться можно было только с сайта, а очередь модерации в
 * приложении жалобы лишь показывала.
 */
export function CommentsSection({property}: Props) {
  const {t} = useLanguage()
  const {user} = useAuth()

  const [comments, setComments] = useState<Comment[]>(property.comments ?? [])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // Жалоба: на какой отзыв, с какой причиной и что ответил сервер.
  const [target, setTarget] = useState<Comment | null>(null)
  const [reason, setReason] = useState<ReportReason>('spam')
  const [details, setDetails] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reported, setReported] = useState('')

  const submit = async () => {
    if (!user) {
      router.push('/login')
      return
    }
    if (!text.trim() || sending) return

    setSending(true)
    setError('')
    try {
      const result = await addComment(property.id, text.trim())
      if (result.success) {
        // Новый комментарий добавляем сверху: список отсортирован свежими
        // вперёд, а перечитывать объявление ради одной записи незачем.
        setComments(current => [result.comment, ...current])
        setText('')
      } else {
        setError(t.messages.error)
      }
    } catch {
      setError(t.messages.error)
    } finally {
      setSending(false)
    }
  }

  const openReport = (comment: Comment) => {
    setTarget(comment)
    setReason('spam')
    setDetails('')
    setReportError('')
  }

  const sendReport = async () => {
    if (!target || reporting) return

    setReporting(true)
    setReportError('')
    try {
      const result = await reportComment(
        property.id,
        target.id,
        target.text,
        reason,
        details.trim() || undefined
      )
      if (result.success) {
        setTarget(null)
        setReported(t.common.reportedSuccess)
      } else {
        // `duplicate` — не поломка, а «вы уже жаловались». Показываем именно
        // это, иначе человек будет жать кнопку и думать, что не отправляется.
        setReportError(result.error === 'duplicate' ? t.common.alreadyReported : t.messages.error)
      }
    } catch {
      setReportError(t.messages.error)
    } finally {
      setReporting(false)
    }
  }

  const reasonLabel = (key: ReportReason) =>
    ({
      spam: t.comments.spam,
      inappropriate: t.comments.inappropriate,
      offensive: t.comments.offensive,
      misleading: t.comments.misleading,
      other: t.comments.other
    })[key]

  return (
    <View style={styles.wrap}>
      {user ? (
        <View style={styles.form}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t.property.addComment}
            placeholderTextColor={colors.gray400}
            style={styles.input}
            multiline
            maxLength={1000}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton
            title={t.property.postComment}
            onPress={submit}
            loading={sending}
            disabled={!text.trim() || sending}
          />
        </View>
      ) : (
        <Text style={styles.hint}>{t.property.signInComment}</Text>
      )}

      {reported ? <Text style={styles.success}>{reported}</Text> : null}

      {comments.length === 0 ? (
        <Text style={styles.empty}>{t.property.noComments}</Text>
      ) : (
        comments.map(comment => (
          <View key={comment.id} style={styles.comment}>
            <View style={styles.commentHead}>
              <Text style={styles.commentAuthor}>{comment.userName}</Text>
              <Text style={styles.commentDate}>{comment.createdAt?.slice(0, 10)}</Text>
            </View>
            <Text style={styles.commentText}>{comment.text}</Text>

            {/* Как на сайте: кнопка видна только вошедшим — жалоба без имени
                подающего бессмысленна, правило «одна на отзыв» держится на нём. */}
            {user ? (
              <Pressable
                onPress={() => openReport(comment)}
                style={({pressed}) => [styles.reportBtn, pressed && styles.reportBtnPressed]}
                hitSlop={8}
              >
                <Text style={styles.reportText}>{t.property.report}</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}

      <Modal
        visible={target !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTarget(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t.comments.reportComment}</Text>

            {target ? (
              <Text style={styles.quote} numberOfLines={3}>
                {target.text}
              </Text>
            ) : null}

            <Text style={styles.label}>{t.comments.reportReason}</Text>
            <View style={styles.reasons}>
              {REASONS.map(key => {
                const active = reason === key
                return (
                  <Pressable
                    key={key}
                    onPress={() => setReason(key)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {reasonLabel(key)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder={t.comments.other}
                placeholderTextColor={colors.gray400}
                style={styles.input}
                multiline
                // Сервер обрезает пояснение на 500 знаках — держим тот же предел
                // здесь, чтобы отказ не приходил уже после отправки.
                maxLength={500}
              />
            </ScrollView>

            {reportError ? <Text style={styles.error}>{reportError}</Text> : null}

            <PrimaryButton title={t.property.report} onPress={sendReport} loading={reporting} />

            <Pressable onPress={() => setTarget(null)} style={styles.cancel}>
              <Text style={styles.cancelText}>{t.buttons.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.base},
  form: {gap: spacing.sm},
  input: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.sm,
    padding: spacing.sm,
    minHeight: 80,
    fontSize: fontSize.sm,
    color: colors.text,
    textAlignVertical: 'top'
  },
  error: {fontSize: fontSize.sm, color: colors.error},
  success: {fontSize: fontSize.sm, color: colors.primary},
  hint: {fontSize: fontSize.sm, color: colors.neutral},
  empty: {fontSize: fontSize.sm, color: colors.gray400},
  comment: {
    backgroundColor: colors.gray50,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 4
  },
  commentHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  commentAuthor: {fontSize: fontSize.sm, fontWeight: '700', color: colors.text},
  commentDate: {fontSize: fontSize.xs, color: colors.gray400},
  commentText: {fontSize: fontSize.sm, color: colors.gray700, lineHeight: 20},

  reportBtn: {alignSelf: 'flex-start', paddingVertical: 2},
  reportBtnPressed: {opacity: 0.6},
  reportText: {fontSize: fontSize.xs, color: colors.neutral, fontWeight: '600'},

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.lg
  },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '85%'
  },
  sheetTitle: {fontSize: fontSize.lg, fontWeight: '800', color: colors.text},
  quote: {
    fontSize: fontSize.xs,
    color: colors.gray400,
    fontStyle: 'italic',
    backgroundColor: colors.gray50,
    borderRadius: radius.sm,
    padding: spacing.sm
  },
  label: {fontSize: fontSize.sm, fontWeight: '600', color: colors.text},
  reasons: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.gray100
  },
  chipActive: {backgroundColor: colors.primary},
  chipText: {fontSize: fontSize.xs, color: colors.gray700},
  chipTextActive: {color: colors.white, fontWeight: '700'},
  cancel: {alignItems: 'center', paddingVertical: spacing.xs},
  cancelText: {fontSize: fontSize.sm, color: colors.neutral}
})
