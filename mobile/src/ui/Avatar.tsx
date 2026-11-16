import { StyleSheet, Text, View } from 'react-native';

import { fontFamily, radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

interface AvatarProps {
  name: string;
  size?: number;
  color?: string;
  textColor?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function Avatar({ name, size = 32, color, textColor }: AvatarProps) {
  const { palette } = useTheme();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: color ?? palette.secondary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily.semibold,
          fontSize: Math.round(size * 0.38),
          color: textColor ?? palette.secondaryForeground,
        }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

export interface StackAvatar {
  name: string;
  color?: string;
}

interface AvatarStackProps {
  avatars: readonly StackAvatar[];
  max?: number;
  size?: number;
  /** Match the surface the stack sits on so the overlap rings look cut out. */
  ringColor?: string;
}

export function AvatarStack({ avatars, max = 3, size = 30, ringColor }: AvatarStackProps) {
  const { palette } = useTheme();
  const visible = avatars.slice(0, max);
  const overflow = avatars.length - visible.length;
  const ring = { borderColor: ringColor ?? palette.background };

  return (
    <View style={styles.stack}>
      {visible.map((avatar, index) => (
        <View
          key={`${avatar.name}-${index}`}
          style={[
            styles.ring,
            ring,
            { marginLeft: index === 0 ? 0 : -size * 0.32, zIndex: visible.length - index },
          ]}
        >
          <Avatar name={avatar.name} size={size} color={avatar.color} />
        </View>
      ))}
      {overflow > 0 ? (
        <View style={[styles.ring, ring, { marginLeft: -size * 0.32 }]}>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: radius.pill,
              backgroundColor: palette.muted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily.semibold,
                fontSize: Math.round(size * 0.34),
                color: palette.mutedForeground,
              }}
            >
              +{overflow}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { flexDirection: 'row', alignItems: 'center' },
  ring: { borderWidth: 2, borderRadius: radius.pill },
});
