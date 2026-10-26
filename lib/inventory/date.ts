// Device calendar date; ISO/UTC slicing can be a different day in the user's zone.
export function localPurchaseDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
