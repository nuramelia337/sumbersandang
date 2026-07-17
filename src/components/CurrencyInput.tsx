import { NumericFormat } from 'react-number-format';

interface CurrencyInputProps {
  value: number | string;
  onValueChange: (value: number) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function CurrencyInput({
  value,
  onValueChange,
  required,
  placeholder = 'Rp 0',
  disabled,
  className = '',
}: CurrencyInputProps) {
  return (
    <NumericFormat
      value={value}
      thousandSeparator="."
      decimalSeparator=","
      prefix="Rp "
      allowNegative={false}
      decimalScale={0}
      fixedDecimalScale={false}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      className={`input-field ${className}`}
      onValueChange={(values) => onValueChange(values.floatValue ?? 0)}
    />
  );
}
