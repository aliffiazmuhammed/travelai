import { useState, type ComponentRef, type Ref } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { fontFamily, radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

interface TextFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

export function TextField({
  label,
  hint,
  error,
  containerStyle,
  secureTextEntry,
  style,
  onFocus,
  onBlur,
  ref,
  ...rest
}: TextFieldProps) {
  const { palette } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const canReveal = secureTextEntry === true;
  const borderColor = error ? palette.destructive : focused ? palette.primary : palette.border;

  return (
    <View style={containerStyle}>
      <AppText variant="label" style={styles.label}>
        {label}
      </AppText>
      <View style={[styles.field, { backgroundColor: palette.card, borderColor }]}>
        <TextInput
          ref={ref}
          {...rest}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          style={[styles.input, { color: palette.foreground }, style]}
          placeholderTextColor={palette.mutedForeground}
          selectionColor={palette.primary}
          secureTextEntry={canReveal ? !revealed : secureTextEntry}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {canReveal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed((value) => !value)}
            hitSlop={6}
            style={styles.reveal}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={palette.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <AppText variant="caption" tone="danger" style={styles.note}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted" style={styles.note}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingLeft: 14,
    paddingRight: 4,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    paddingVertical: 12,
  },
  reveal: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { marginTop: 6 },
});
