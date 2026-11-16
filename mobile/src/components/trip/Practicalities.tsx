import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type {
  GalleryFootnotes,
  GalleryLocalTransport,
  GalleryWeather,
} from '@/api/explore';
import { fontFamily, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Card } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

function Bullets({ items }: { items: string[] }) {
  const { palette } = useTheme();
  if (items.length === 0) return null;

  return (
    <View style={styles.bullets}>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.bullet}>
          <View style={[styles.bulletDot, { backgroundColor: palette.primary }]} />
          <AppText variant="caption" tone="muted" style={styles.bulletText}>
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}

function InfoLine({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.infoLine}>
      <Ionicons name={icon} size={14} color={palette.mutedForeground} />
      <AppText variant="caption" tone="muted" style={styles.infoText}>
        <AppText variant="caption" style={styles.infoLabel}>
          {label}:{' '}
        </AppText>
        {value}
      </AppText>
    </View>
  );
}

function Section({
  icon,
  title,
  children,
  divided,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  divided?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View style={[styles.section, divided && { borderTopColor: palette.border, borderTopWidth: 1 }]}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: palette.muted }]}>
          <Ionicons name={icon} size={14} color={palette.primary} />
        </View>
        <AppText variant="bodyStrong">{title}</AppText>
      </View>
      {children}
    </View>
  );
}

function WeatherBlock({ weather }: { weather: GalleryWeather }) {
  const parts =
    (weather.expected_weather ? 1 : 0) +
    (weather.packing_tips?.length ? 1 : 0) +
    (weather.risks?.length ? 1 : 0) +
    (weather.seasonal_highlights?.length ? 1 : 0);
  if (parts === 0) return null;

  return (
    <Section icon="partly-sunny-outline" title="Weather">
      {weather.expected_weather ? (
        <AppText variant="caption" tone="muted" style={styles.paragraph}>
          {weather.expected_weather}
        </AppText>
      ) : null}
      {weather.packing_tips?.length ? (
        <View style={styles.subBlock}>
          <AppText variant="caption" style={styles.subLabel}>
            PACK
          </AppText>
          <Bullets items={weather.packing_tips} />
        </View>
      ) : null}
      {weather.seasonal_highlights?.length ? (
        <View style={styles.subBlock}>
          <AppText variant="caption" style={styles.subLabel}>
            IN SEASON
          </AppText>
          <Bullets items={weather.seasonal_highlights} />
        </View>
      ) : null}
      {weather.risks?.length ? (
        <View style={styles.subBlock}>
          <AppText variant="caption" style={styles.subLabel}>
            WATCH OUT FOR
          </AppText>
          <Bullets items={weather.risks} />
        </View>
      ) : null}
    </Section>
  );
}

function TransportBlock({ transport }: { transport: GalleryLocalTransport }) {
  const modes = [
    { label: 'On foot', value: transport.walking, icon: 'walk-outline' as IconName },
    { label: 'Auto rickshaw', value: transport.auto_rickshaw, icon: 'car-outline' as IconName },
    { label: 'Local buses', value: transport.local_buses, icon: 'bus-outline' as IconName },
    { label: 'Shared cabs', value: transport.shared_cabs, icon: 'car-sport-outline' as IconName },
  ].filter((mode) => Boolean(mode.value));
  const hasTips = Boolean(transport.tips?.length);
  if (modes.length === 0 && !hasTips) return null;

  return (
    <Section icon="navigate-outline" title="Getting around">
      {modes.map((mode) => (
        <InfoLine
          key={mode.label}
          icon={mode.icon}
          label={mode.label}
          value={mode.value as string}
        />
      ))}
      {transport.tips?.length ? <Bullets items={transport.tips} /> : null}
    </Section>
  );
}

function SafetyBlock({ footnotes }: { footnotes: GalleryFootnotes }) {
  const payment = footnotes.payment ?? {};
  const permits = footnotes.permits ?? {};
  const connectivity = footnotes.connectivity ?? {};
  const hasPermitLines = permits.rohtang_pass_required || Boolean(permits.apply_online);
  const hasConnectivity = Boolean(connectivity.wifi || connectivity.mobile_networks);
  const hasPayment = Boolean(payment.upi || payment.cash);

  if (
    !footnotes.safety?.length &&
    !footnotes.cultural_etiquette?.length &&
    !hasPayment &&
    !hasPermitLines &&
    !hasConnectivity
  ) {
    return null;
  }

  return (
    <Section icon="shield-checkmark-outline" title="Safety & local know-how" divided>
      {footnotes.safety?.length ? (
        <View style={styles.subBlock}>
          <AppText variant="caption" style={styles.subLabel}>
            SAFETY
          </AppText>
          <Bullets items={footnotes.safety} />
        </View>
      ) : null}
      {footnotes.cultural_etiquette?.length ? (
        <View style={styles.subBlock}>
          <AppText variant="caption" style={styles.subLabel}>
            ETIQUETTE
          </AppText>
          <Bullets items={footnotes.cultural_etiquette} />
        </View>
      ) : null}
      {hasPermitLines ? (
        <View style={styles.subBlock}>
          <AppText variant="caption" style={styles.subLabel}>
            PERMITS
          </AppText>
          {permits.rohtang_pass_required ? (
            <InfoLine icon="ticket-outline" label="Pass" value="Required for this route" />
          ) : null}
          {permits.apply_online ? (
            <InfoLine icon="globe-outline" label="Apply" value={permits.apply_online} />
          ) : null}
        </View>
      ) : null}
      {hasPayment ? (
        <View style={styles.subBlock}>
          <AppText variant="caption" style={styles.subLabel}>
            MONEY
          </AppText>
          {payment.upi ? <InfoLine icon="phone-portrait-outline" label="UPI" value={payment.upi} /> : null}
          {payment.cash ? <InfoLine icon="cash-outline" label="Cash" value={payment.cash} /> : null}
        </View>
      ) : null}
      {hasConnectivity ? (
        <View style={styles.subBlock}>
          <AppText variant="caption" style={styles.subLabel}>
            CONNECTIVITY
          </AppText>
          {connectivity.wifi ? (
            <InfoLine icon="wifi-outline" label="Wi-Fi" value={connectivity.wifi} />
          ) : null}
          {connectivity.mobile_networks ? (
            <InfoLine
              icon="cellular-outline"
              label="Mobile network"
              value={connectivity.mobile_networks}
            />
          ) : null}
        </View>
      ) : null}
    </Section>
  );
}

/** Weather, local transport and safety notes, straight from the itinerary. */
export function PracticalitiesCard({
  weather,
  transport,
  footnotes,
  intro = 'What the host wrote down about weather, getting around and staying safe.',
}: {
  weather?: GalleryWeather;
  transport?: GalleryLocalTransport;
  footnotes?: GalleryFootnotes;
  intro?: string;
}) {
  if (!weather && !transport && !footnotes) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <AppText variant="title">Good to know</AppText>
        <AppText variant="caption" tone="muted">
          {intro}
        </AppText>
      </View>
      {weather ? <WeatherBlock weather={weather} /> : null}
      {transport ? <TransportBlock transport={transport} /> : null}
      {footnotes ? <SafetyBlock footnotes={footnotes} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  heading: { gap: 2 },
  section: { gap: space.sm, paddingTop: space.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paragraph: { lineHeight: 20 },
  subBlock: { gap: 5, marginTop: 2 },
  subLabel: { fontSize: 10, lineHeight: 14, letterSpacing: 1 },
  bullets: { gap: 4 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  bulletDot: { width: 4, height: 4, borderRadius: radius.pill, marginTop: 7 },
  bulletText: { flex: 1, lineHeight: 18 },
  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  infoText: { flex: 1, lineHeight: 18 },
  infoLabel: { fontFamily: fontFamily.semibold },
});
