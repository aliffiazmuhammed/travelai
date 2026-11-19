import React from 'react';
import {
  SegmentedControl,
  type SegmentedControlOption,
} from '@/components/ui/segmented-control';

export type AdminSegmentedOption<T extends string> = SegmentedControlOption<T>;

interface AdminSegmentedProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: Array<AdminSegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * The console's one filter gesture, backed by the shared `SegmentedControl`
 * with the console accent.
 */
export function AdminSegmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className,
}: AdminSegmentedProps<T>) {
  return (
    <SegmentedControl
      ariaLabel={ariaLabel}
      value={value}
      options={options}
      onChange={onChange}
      size="sm"
      realm="admin"
      className={className}
    />
  );
}
