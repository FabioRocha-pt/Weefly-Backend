/**
 * TEN-05 · "Powered by WeeFly", discreto, no rodapé do back-office do parceiro,
 * do Admin e da aplicação do ministério. O interruptor é do parceiro
 * (`powered_by_weefly`, ligado por omissão): quem decide se aparece é quem
 * chama.
 */
export function PoweredByWeefly({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <p
      className={className}
      style={{ textAlign: "center", fontSize: 11, opacity: 0.55, padding: "18px 0 22px", letterSpacing: "0.02em", ...style }}
    >
      Powered by WeeFly
    </p>
  )
}
