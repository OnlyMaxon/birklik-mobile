import {ActivityIndicator, Pressable, StyleSheet, Text} from 'react-native'

import {colors, fontSize, radius, shadow, spacing} from '@/theme/theme'

type Props = {
  title: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
}

export function PrimaryButton({title, onPress, loading, disabled}: Props) {
  const inactive = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={({pressed}) => [
        styles.button,
        inactive && styles.buttonInactive,
        pressed && !inactive && styles.buttonPressed
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.base,
    paddingVertical: spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    ...shadow.sm
  },
  buttonInactive: {backgroundColor: colors.gray300},
  buttonPressed: {backgroundColor: colors.primaryDark},
  text: {color: colors.white, fontSize: fontSize.base, fontWeight: '600'}
})
