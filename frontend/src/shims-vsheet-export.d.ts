// Build-time shims so the project can compile even before installing export dependencies.
// When you implement export for real, install:
//   npm i exceljs file-saver
//   npm i -D @types/file-saver

declare module 'exceljs' {
  const ExcelJS: any;
  export = ExcelJS;
}

declare module 'file-saver' {
  export const saveAs: any;
}
