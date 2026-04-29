declare module 'jscanify/client' {
  interface Corner {
    x: number
    y: number
  }
  interface Corners {
    topLeftCorner: Corner
    topRightCorner: Corner
    bottomLeftCorner: Corner
    bottomRightCorner: Corner
  }
  export default class Jscanify {
    constructor()
    findPaperContour(img: unknown): unknown
    getCornerPoints(contour: unknown, img?: unknown): Corners
    highlightPaper(
      image: HTMLImageElement | HTMLCanvasElement,
      options?: { color?: string; thickness?: number },
    ): HTMLCanvasElement
    extractPaper(
      image: HTMLImageElement | HTMLCanvasElement,
      width: number,
      height: number,
      cornerPoints?: Corners,
    ): HTMLCanvasElement | null
  }
}
