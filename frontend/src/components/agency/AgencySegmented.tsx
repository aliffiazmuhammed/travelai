import React from 'react';
import {
  SegmentedControl,
  type SegmentedControlOption,
} from '@/components/ui/segmented-control';

export type AgencySegmentedOption<T extends string> = SegmentedControlOption<T>;

interface AgencySegmentedProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: Array<AgencySegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * One filter control for the whole workspace, backed by the shared
 * `SegmentedControl` so a team learns the gesture once.
 */
export function AgencySegmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className,
}: AgencySegmentedProps<T>) {
  return (
    <SegmentedControl
      ariaLabel={ariaLabel}
      value={value}
      options={options}
      onChange={onChange}
      size="sm"
      realm="agency"
      className={className}
    />
  );
}
