import {useEffect, useRef} from 'react'
import {
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {useLanguage} from '@/i18n/language-provider'
import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

export type StatusVariant = 'success' | 'error'

type Action = {label: string; onPress: () => void}

type Props = {
  visible: boolean
  variant: StatusVariant
  title: string
  /** Объяснение в одну-две фразы: что произошло и что будет дальше. */
  body?: string
  /** Приписка мелким в рамке — подробность, без которой можно обойтись. */
  note?: string
  primary: Action
  secondary?: Action
  /**
   * Показать связь с поддержкой — звонок и почта. Нужно там, где человек мог
   * потерять сделанное или деньги: у ошибки подачи, у неудачной оплаты.
   */
  support?: boolean
  /** Кнопка «назад» у Android и нажатие по подложке. Не задан — окно не закрыть. */
  onRequestClose?: () => void
}

/**
 * Окно итога действия — вместо системного `Alert.alert`.
 *
 * Зачем свой: системное окно умеет только заголовок, строку и кнопки. На самом
 * важном действии приложения — «Добавить объявление» — этого мало. Человек
 * впервые отдал нам полчаса работы и двадцать снимков и обязан понять три вещи
 * сразу: объявление сохранено, его смотрит человек, и это не отказ. Системная
 * строка «На модерации» не объясняет ни одной из них.
 *
 * ⚠️ Одно окно на успех и на ошибку намеренно. Развести их по двум компонентам
 * значило бы две вёрстки, две анимации и два места, где забудут про поддержку.
 * Отличаются они рисунком, цветом и наличием связи с поддержкой — всё остальное
 * одно и то же.
 *
 * ⚠️ Телефон и почта берутся из общих текстов (`pages.contact`) — тех же, что на
 * странице контактов сайта. Свою копию здесь держать нельзя: номер меняется, и
 * забытая копия отправляет человека в никуда.
 *
 * Появление рисуется руками, а не `animationType` у `Modal`: системное
 * появление на Android — это рывок снизу, одинаковый для «готово» и «ошибка».
 * Мягкое проявление с подрастанием читается как итог, а не как ещё один экран.
 */
export function StatusDialog({
  visible,
  variant,
  title,
  body,
  note,
  primary,
  secondary,
  support,
  onRequestClose
}: Props) {
  const {t} = useLanguage()
  const appear = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!visible) {
      // Сбрасываем сразу: следующее открытие должно начаться с нуля, иначе окно
      // появится уже раскрытым.
      appear.setValue(0)
      return
    }
    Animated.timing(appear, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start()
  }, [visible, appear])

  const accent = variant === 'success' ? colors.primary : colors.error
  const phone = t.pages.contact.phoneNumber
  const email = t.pages.contact.emailAddress

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      <View style={styles.backdrop}>
        {/* Закрытие по подложке — только когда закрывать вообще можно. Там, где
            уводить человека некуда (объявление уже создано), подложка глухая. */}
        <Pressable style={styles.backdropTouch} onPress={onRequestClose} disabled={!onRequestClose} />

        <Animated.View
          style={[
            styles.card,
            {
              opacity: appear,
              transform: [
                {scale: appear.interpolate({inputRange: [0, 1], outputRange: [0.92, 1]})}
              ]
            }
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.cardInner}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Illustration variant={variant} accent={accent} />

            <Text style={styles.title}>{title}</Text>
            {body ? <Text style={styles.body}>{body}</Text> : null}

            {note ? (
              <View style={styles.note}>
                <Ionicons name="information-circle-outline" size={15} color={colors.gray500} />
                <Text style={styles.noteText}>{note}</Text>
              </View>
            ) : null}

            {support ? (
              <View style={styles.support}>
                <Text style={styles.supportTitle}>{t.dialog.supportTitle}</Text>
                <View style={styles.supportRow}>
                  <Pressable
                    style={({pressed}) => [styles.supportButton, pressed && styles.pressed]}
                    onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}
                  >
                    <Ionicons name="call-outline" size={15} color={colors.primary} />
                    <Text style={styles.supportText}>{t.dialog.supportCall}</Text>
                  </Pressable>
                  <Pressable
                    style={({pressed}) => [styles.supportButton, pressed && styles.pressed]}
                    onPress={() => void Linking.openURL(`mailto:${email}`)}
                  >
                    <Ionicons name="mail-outline" size={15} color={colors.primary} />
                    <Text style={styles.supportText}>{t.dialog.supportMail}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <Pressable
              style={({pressed}) => [
                styles.primary,
                {backgroundColor: accent},
                pressed && styles.pressed
              ]}
              onPress={primary.onPress}
            >
              <Text style={styles.primaryText}>{primary.label}</Text>
            </Pressable>

            {secondary ? (
              <Pressable
                style={({pressed}) => [styles.secondary, pressed && styles.pressed]}
                onPress={secondary.onPress}
              >
                <Text style={styles.secondaryText}>{secondary.label}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

/**
 * Рисунок окна: документ под лупой у успеха, оборванная связь у ошибки.
 *
 * Собран из знаков и кругов, а не картинкой: картинку пришлось бы класть
 * файлом, раздавать по плотностям экрана и держать отдельно от цветов темы.
 * Значок с подзначком даёт понятный смысл — «объявление, которое смотрят» — и
 * ничего не весит.
 */
function Illustration({variant, accent}: {variant: StatusVariant; accent: string}) {
  const tint = variant === 'success' ? 'rgba(46, 125, 91, 0.10)' : 'rgba(224, 90, 79, 0.10)'
  const tintSoft = variant === 'success' ? 'rgba(46, 125, 91, 0.06)' : 'rgba(224, 90, 79, 0.06)'

  return (
    <View style={styles.art}>
      <View style={[styles.artOuter, {backgroundColor: tintSoft}]} />
      <View style={[styles.artInner, {backgroundColor: tint}]} />
      <Ionicons
        name={variant === 'success' ? 'document-text-outline' : 'cloud-offline-outline'}
        size={44}
        color={accent}
      />
      <View style={[styles.artBadge, {backgroundColor: accent}]}>
        <Ionicons
          name={variant === 'success' ? 'search' : 'alert'}
          size={15}
          color={colors.white}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(13, 31, 23, 0.55)'
  },
  // Подложка растянута отдельным видом под карточкой: иначе нажатие по самой
  // карточке считалось бы нажатием по подложке и закрывало бы окно.
  backdropTouch: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0},
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    ...shadow.lg
  },
  cardInner: {padding: spacing.lg, alignItems: 'center', gap: spacing.sm},
  art: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs
  },
  artOuter: {position: 'absolute', width: 104, height: 104, borderRadius: 52},
  artInner: {position: 'absolute', width: 76, height: 76, borderRadius: 38},
  // Лупа сидит на краю документа, как будто его разглядывают, — отсюда вынос за
  // круг и обводка цветом карточки.
  artBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 26
  },
  body: {
    fontSize: fontSize.sm,
    color: colors.gray700,
    textAlign: 'center',
    lineHeight: 21
  },
  note: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: colors.gray50,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs
  },
  noteText: {flex: 1, fontSize: 11, color: colors.gray600, lineHeight: 16},
  support: {alignSelf: 'stretch', gap: 6, marginTop: spacing.sm},
  supportTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gray500,
    textTransform: 'uppercase',
    textAlign: 'center'
  },
  supportRow: {flexDirection: 'row', gap: spacing.sm},
  supportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.base,
    paddingVertical: spacing.sm
  },
  supportText: {fontSize: fontSize.xs, fontWeight: '600', color: colors.primary},
  primary: {
    alignSelf: 'stretch',
    borderRadius: radius.base,
    paddingVertical: spacing.base,
    alignItems: 'center',
    marginTop: spacing.base
  },
  primaryText: {color: colors.white, fontSize: fontSize.base, fontWeight: '700'},
  secondary: {alignSelf: 'stretch', paddingVertical: spacing.sm, alignItems: 'center'},
  secondaryText: {color: colors.gray600, fontSize: fontSize.sm, fontWeight: '600'},
  pressed: {opacity: 0.75}
})
