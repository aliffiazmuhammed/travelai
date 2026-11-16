import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GalleryFootnotes, GalleryLocalTransport, GalleryWeather } from '@/api/explore';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Card } from '@/ui';

import { PracticalitiesBody, hasPracticalities } from './Practicalities';

/**
 * The practical notes as one tappable row. Keeps a long trip page focused on
 * the plan, and puts weather, transport and safety a tap away instead of a
 * screenful down.
 */
export function GoodToKnowRow({
  weather,
  transport,
  footnotes,
}: {
  weather?: GalleryWeather;
  transport?: GalleryLocalTransport;
  footnotes?: GalleryFootnotes;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  if (!hasPracticalities({ weather, transport, footnotes })) return null;

  return (
    <>
      <Card
        onPress={() => setOpen(true)}
        accessibilityLabel="Good to know: weather, getting around and staying safe"
        style={styles.row}
      >
        <View style={[styles.icon, { backgroundColor: palette.muted }]}>
          <Ionicons name="compass-outline" size={17} color={palette.primary} />
        </View>
        <View style={styles.rowText}>
          <AppText variant="bodyStrong">Good to know</AppText>
          <AppText variant="caption" tone="muted">
            Weather, getting around and staying safe
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={palette.mutedForeground} />
      </Card>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => setOpen(false)}
            style={[StyleSheet.absoluteFill, styles.scrim]}
          />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: palette.card,
                borderColor: palette.border,
                paddingBottom: insets.bottom + space.lg,
              },
            ]}
          >
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.rowText}>
                <AppText variant="heading">Good to know</AppText>
                <AppText variant="caption" tone="muted">
                  Weather, getting around and staying safe.
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={() => setOpen(false)}
                style={[styles.close, { backgroundColor: palette.muted }]}
              >
                <Ionicons name="close" size={16} color={palette.foreground} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
              contentContainerStyle={styles.sheetBody}
            >
              <PracticalitiesBody weather={weather} transport={transport} footnotes={footnotes} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    gap: space.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(127,140,134,0.4)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexShrink: 1 },
  sheetBody: { paddingBottom: space.sm },
});
