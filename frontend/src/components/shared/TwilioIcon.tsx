type Props = {
  className?: string;
  size?: number;
  colored?: boolean;
};

// Official Twilio logo mark (simplified) — circle with 4 inner dots.
// Pass `colored` to render in Twilio red (#F22F46); otherwise inherits color.
export function TwilioIcon({ className = "", size = 20, colored = false }: Props) {
  const fill = colored ? "#F22F46" : "currentColor";
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      aria-hidden="true"
    >
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm0 21.6c-5.34 0-9.6-4.26-9.6-9.6S6.66 2.4 12 2.4s9.6 4.26 9.6 9.6-4.26 9.6-9.6 9.6zm5.34-11.76c0 1.38-1.14 2.52-2.52 2.52s-2.52-1.14-2.52-2.52 1.14-2.52 2.52-2.52 2.52 1.14 2.52 2.52zm0 4.26c0 1.38-1.14 2.52-2.52 2.52s-2.52-1.14-2.52-2.52 1.14-2.52 2.52-2.52 2.52 1.14 2.52 2.52zm-4.26 0c0 1.38-1.14 2.52-2.52 2.52s-2.52-1.14-2.52-2.52 1.14-2.52 2.52-2.52 2.52 1.14 2.52 2.52zm0-4.26c0 1.38-1.14 2.52-2.52 2.52S8.04 11.22 8.04 9.84s1.14-2.52 2.52-2.52 2.52 1.14 2.52 2.52z" />
    </svg>
  );
}
