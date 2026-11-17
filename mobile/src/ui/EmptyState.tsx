import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
  style?: StyleProp<ViewStyle>;
}

/** A quiet card for "nothing here yet", with one way forward at most. */
export function EmptyState({ icon, title, body, action, style }: EmptyStateProps) {
  const { palette } = useTheme();

  return (
    <Card style={[styles.card, style]}>
      <Ionicons name={icon} size={22} color={palette.mutedForeground} />
      <AppText variant="bodyStrong">{title}</AppText>
      {body ? (
        <AppText variant="caption" tone="muted">
          {body}
        </AppText>
      ) : null}
      {action ? (
        <Button
          label={action.label}
          size="sm"
          variant="secondary"
          icon={
            action.icon ? (
              <Ionicons name={action.icon} size={14} color={palette.secondaryForeground} />
            ) : undefined
          }
          onPress={action.onPress}
          style={styles.action}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'flex-start', gap: space.sm },
  action: { marginTop: space.xs },
});
