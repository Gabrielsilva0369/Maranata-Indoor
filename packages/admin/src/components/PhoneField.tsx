import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'

// Campo de telefone com seletor de país (bandeira) e formatação internacional.
// Guarda o valor em E.164 (ex.: +5511999999999). Padrão Brasil.
export default function PhoneField({ value, onChange, placeholder }: {
  value: string | null | undefined
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center w-full border rounded-lg px-3 py-2 text-sm bg-white focus-within:ring-2 focus-within:ring-brand-500 min-h-[40px]">
      <PhoneInput
        international
        defaultCountry="BR"
        value={value || undefined}
        onChange={v => onChange(v ?? '')}
        placeholder={placeholder}
        className="w-full"
      />
    </div>
  )
}
