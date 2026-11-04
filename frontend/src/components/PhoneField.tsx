import React from 'react';
import { Input } from '@/components/ui/input';
import {
  getPhoneCountry,
  parsePhoneNumber,
  PHONE_COUNTRIES,
  phonePlaceholder,
} from '@/lib/phone';

type PhoneFieldProps = {
  id: string;
  value: string;
  countryIso: string;
  onValueChange: (value: string) => void;
  onCountryChange: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  autoComplete?: string;
  inputClassName?: string;
  selectClassName?: string;
};

/**
 * A country selector and national number in one control. The selected country
 * supplies the digit rule; pasting a full `+` number switches the country and
 * keeps only its national digits.
 */
const PhoneField: React.FC<PhoneFieldProps> = ({
  id,
  value,
  countryIso,
  onValueChange,
  onCountryChange,
  required = false,
  disabled = false,
  placeholder,
  maxLength = 20,
  autoComplete = 'tel',
  inputClassName,
  selectClassName,
}) => {
  const country = getPhoneCountry(countryIso);

  const handleInput = (raw: string) => {
    if (raw.trimStart().startsWith('+')) {
      const parsed = parsePhoneNumber(raw);
      if (parsed) {
        onCountryChange(parsed.country.iso);
        onValueChange(parsed.national);
        return;
      }
    }
    onValueChange(raw);
  };

  return (
    <div className="flex gap-2">
      <select
        aria-label="Country code"
        title={country.name}
        value={country.iso}
        onChange={(event) => onCountryChange(event.target.value)}
        disabled={disabled}
        className={
          selectClassName ??
          'h-10 w-[5.5rem] shrink-0 rounded-xl border border-input bg-background px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
        }
      >
        {PHONE_COUNTRIES.map((entry) => (
          <option key={entry.iso} value={entry.iso}>
            {entry.iso} +{entry.dial}
          </option>
        ))}
      </select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => handleInput(event.target.value)}
        placeholder={placeholder ?? phonePlaceholder(country.iso)}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        className={inputClassName}
      />
    </div>
  );
};

export default PhoneField;
