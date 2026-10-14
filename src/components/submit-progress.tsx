import {useEffect, useRef} from 'react'
import {Animated, Easing, Modal, StyleSheet, Text, View} from 'react-native'
import {Ionicons} from '@expo/vector-icons'

import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  visible: boolean
  /** Доля сделанного, 0…1. Считается по настоящим шагам, а не по таймеру. */
  progress: number
  /** Что происходит прямо сейчас. */
  label: string
}

/**
 * Полоса загрузки при подаче объявления.
 *
 * ⚠️ Полоса **настоящая**: доля приходит от вызывающего по сделанным шагам —
 * найденное место, загруженный снимок, сохранённый документ. Бегунок «ради
 * вида», доезжающий до конца за две секунды и потом стоящий полминуты, хуже
 * системного кружка: он обещает срок, которого никто не обещал.
 *
 * Зачем вообще: подача объявления — самое долгое действие в приложении.
 * Двадцать снимков с водяным знаком на небыстром телефоне это десятки секунд, и
 * системный кружок всё это время не отличим от зависшего приложения. Человек
 * жмёт «назад» и теряет полчаса работы. Поэтому здесь и доля, и число снимков,
 * и запрет закрывать окно.
 *
 * Окно намеренно не закрывается ни кнопкой «назад», ни нажатием: прервать
 * загрузку снимков на середине нечем, а объявление к этому моменту могло уже
 * создаться.
 */
export function SubmitProgress({visible, progress, label}: Props) {
  const width = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current

  // Доля доезжает плавно, а не прыжком: шаги разной длины, и рывок с 10% на 70%
  // читается как сбой.
  useEffect(() => {
    Animated.timing(width, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 320,
      easing: Easing.out(Easing.cubic),
      // Ширину нативный поток анимировать не умеет — только непрозрачность и
      // превращения. Полоса одна, кадры на ней не теряются.
      useNativeDriver: false
    }).start()
  }, [progress, width])

  // Пульсация знака — признак жизни на тех участках, где доля подолгу не
  // меняется: один большой снимок может грузиться секунд десять.
  useEffect(() => {
    if (!visible) {
      pulse.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true
        })
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [visible, pulse])

  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100)

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Animated.View
            style={[
              styles.icon,
              {
                transform: [
                  {scale: pulse.interpolate({inputRange: [0, 1], outputRange: [1, 1.12]})}
                ],
                opacity: pulse.interpolate({inputRange: [0, 1], outputRange: [0.85, 1]})
              }
            ]}
          >
            <Ionicons name="cloud-upload-outline" size={30} color={colors.primary} />
          </Animated.View>

          <Text style={styles.label}>{label}</Text>

          <View style={styles.track}>
            <Animated.View
              style={[
                styles.fill,
                {
                  width: width.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%']
                  })
                }
              ]}
            />
          </View>

          <Text style={styles.percent}>{percent}%</Text>
        </View>
      </View>
    </Modal>
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
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.lg
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(46, 125, 91, 0.10)'
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 20
  },
  track: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.gray100,
    overflow: 'hidden',
    marginTop: spacing.xs
  },
  fill: {height: 8, borderRadius: 4, backgroundColor: colors.primary},
  percent: {fontSize: 11, fontWeight: '700', color: colors.gray500}
})
