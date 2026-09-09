import {useState} from 'react'
import {StyleSheet, Text, TextInput, View} from 'react-native'
import {router} from 'expo-router'

import type {Comment, Property} from '@birklik/core/types'

import {useAuth} from '@/auth/auth-provider'
import {PrimaryButton} from '@/components/primary-button'
import {useLanguage} from '@/i18n/language-provider'
import {addComment} from '@/services/interactions-service'
import {colors, fontSize, radius, spacing} from '@/theme/theme'

type Props = {
  property: Property
}

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
 */
export function CommentsSection({property}: Props) {
  const {t} = useLanguage()
  const {user} = useAuth()

  const [comments, setComments] = useState<Comment[]>(property.comments ?? [])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

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
          </View>
        ))
      )}
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
  commentText: {fontSize: fontSize.sm, color: colors.gray700, lineHeight: 20}
})
