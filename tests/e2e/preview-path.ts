/**
 * Visual evidence belongs to the disposable Playwright artifact by default.
 * Updating the reviewed documentation gallery must be an explicit operation.
 */
export function previewPath(fileName:string):string {
  if(!/^[a-z0-9][a-z0-9.-]*\.png$/i.test(fileName))throw new Error(`Invalid preview filename: ${fileName}`);
  const directory=process.env.UPDATE_PREVIEWS==='1'?'docs/previews':'test-results/previews';
  return `${directory}/${fileName}`;
}
