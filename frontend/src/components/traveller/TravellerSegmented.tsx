import React from 'react';
import {
  SegmentedControl,
  type SegmentedControlOption,
} from '@/components/ui/segmented-control';

export type TravellerSegmentedOption<T extends string> = SegmentedControlOption<T>;

interface TravellerSegmentedProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: Array<TravellerSegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * The one filter control for traveller pages, backed by the shared
 * `SegmentedControl` so the height and selected treatment match every realm.
 */
export function TravellerSegmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className,
}: TravellerSegmentedProps<T>) {
  return (
    <SegmentedControl
      ariaLabel={ariaLabel}
      value={value}
      options={options}
      onChange={onChange}
      size="sm"
      realm="traveller"
      className={className}
    />
  );
}
