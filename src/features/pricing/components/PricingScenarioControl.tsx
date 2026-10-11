import { Select } from "@mantine/core";

export function PricingScenarioControl<T extends string>({
  visible,
  value,
  onChange,
  options,
  label = "Escenario de revisión",
}: {
  visible: boolean;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label?: string;
}) {
  if (!visible) return null;
  return (
    <Select
      maw={400}
      label={label}
      description="Solo para pruebas con respuestas ficticias."
      value={value}
      data={options}
      onChange={(value) => {
        const option = options.find((row) => row.value === value);
        if (option) onChange(option.value);
      }}
    />
  );
}
