export function FormField({ label, error, ...inputProps }) {
  return (
    <label className="block text-sm font-medium text-stone-800">
      {label}
      <input
        {...inputProps}
        aria-invalid={Boolean(error)}
        className="mt-2 w-full border border-stone-300 bg-white px-3 py-2.5 text-stone-950 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20 disabled:bg-stone-100"
      />
      {error ? (
        <span className="mt-1.5 block text-sm text-red-700">{error}</span>
      ) : null}
    </label>
  )
}
