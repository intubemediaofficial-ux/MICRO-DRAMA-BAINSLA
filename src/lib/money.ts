/** Admin forms take prices in full currency units (999 = ₹999); the DB stores minor units. */
export function toMinor(value: FormDataEntryValue | null) {
  return Math.round(Number(value ?? 0) * 100);
}
