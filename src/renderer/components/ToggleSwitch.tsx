interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleSwitch({ checked, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-violet-600' : 'bg-gray-600'
      }`}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '3px',
          left: checked ? '19px' : '3px',
          width: '14px',
          height: '14px',
          background: 'white',
          borderRadius: '50%',
          transition: 'left 0.2s ease-in-out',
          pointerEvents: 'none',
        }}
      />
    </button>
  );
}
