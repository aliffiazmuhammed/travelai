import { useState } from 'react';

import type { GalleryFootnotes, GalleryLocalTransport, GalleryWeather } from '@/api/explore';
import { Card, ListRow, Sheet } from '@/ui';

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
  const [open, setOpen] = useState(false);

  if (!hasPracticalities({ weather, transport, footnotes })) return null;

  return (
    <>
      <Card padded={false}>
        <ListRow
          icon="compass-outline"
          title="Good to know"
          subtitle="Weather, getting around and staying safe"
          accessibilityLabel="Good to know: weather, getting around and staying safe"
          onPress={() => setOpen(true)}
        />
      </Card>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Good to know"
        subtitle="Weather, getting around and staying safe."
      >
        <PracticalitiesBody weather={weather} transport={transport} footnotes={footnotes} />
      </Sheet>
    </>
  );
}
