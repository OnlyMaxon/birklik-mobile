import {StyleSheet, Text, TextInput, View, type TextInputProps} from 'react-native'

import {colors, fontSize, radius, spacing} from '@/theme/theme'

type Props = TextInputProps & {
  label: string
}

/** Поле формы с подписью. Одно на все формы, чтобы они не разъезжались. */
export function FormField({label, style, ...input}: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={colors.gray400}
        // Автозамена в полях почты и телефона портит ввод чаще, чем помогает.
        autoCorrect={false}
        {...input}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {gap: spacing.xs},
  label: {fontSize: fontSize.sm, fontWeight: '600', color: colors.gray700},
  input: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: radius.base,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.base,
    fontSize: fontSize.base,
    color: colors.text,
    backgroundColor: colors.white
  }
})
