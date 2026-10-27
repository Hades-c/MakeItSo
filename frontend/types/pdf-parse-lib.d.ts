// pdf-parse's package root (index.js) runs a debug self-test at import time when it thinks it is the entry
// module, which crashes outside its own package directory (server/syllabi/extract.ts imports the worker
// directly instead, from this subpath, to avoid it). @types/pdf-parse only declares the package root, so this
// gives the subpath the same shape.
declare module "pdf-parse/lib/pdf-parse.js" {
  function PdfParse(
    dataBuffer: Buffer,
    options?: { pagerender?: (pageData: unknown) => string | Promise<string>; max?: number },
  ): Promise<{
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    text: string;
  }>;
  export default PdfParse;
}
