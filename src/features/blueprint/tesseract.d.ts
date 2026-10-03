/* Tesseract.js, as much of it as ocr.js uses. It is not a dependency: ocr.js
   loads it from a CDN on demand (never over file://), and it defines
   window.Tesseract when it arrives. Declarations only. */

export interface TessWorker {
  setParameters(p: Record<string, string>): Promise<unknown>;
  /** `data` is Tesseract's page result: text, lines, words with boxes and confidences */
  recognize(image: HTMLCanvasElement): Promise<{data: any}>;
  terminate(): Promise<unknown>;
}

declare global {
  interface Window {
    Tesseract?: {createWorker(lang: string, oem: number, opts: Record<string, string>): Promise<TessWorker>};
  }
}
