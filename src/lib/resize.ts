// Server actions refuse a single string argument over ~1,000,000 characters (React's
// "Maximum array nesting exceeded"), so the data URL must stay well under that. Detailed photos
// from newer phones can pass it at 1600 px / 0.85, so step quality and size down until it fits.
const MAX_CHARS = 900_000;
const STEPS: [number, number][] = [
  [1600, 0.85],
  [1600, 0.7],
  [1280, 0.7],
  [1080, 0.65],
  [800, 0.6],
];

/** Shrinks a photo to a small JPEG in the browser so uploads are quick on mobile data; the server makes the final small copy. */
export async function resizeImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  let data = "";
  for (const [max, quality] of STEPS) {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    data = canvas.toDataURL("image/jpeg", quality);
    if (data.length <= MAX_CHARS) break;
  }
  bitmap.close();
  return data;
}
