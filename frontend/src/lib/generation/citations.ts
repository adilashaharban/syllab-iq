export function buildCitationsMetadata(topResults: any[]) {
  return topResults.map((t) => ({
    document: t.docTitle,
    documentId: t.docId,
    documentVersion: t.version,
    pageStart: t.page,
    pageEnd: t.page,
    chunkIndex: t.type === "CHUNK" ? t.id : undefined,
    figureId: t.type === "FIGURE" ? t.id : undefined,
    tableId: t.type === "TABLE" ? t.id : undefined,
    equationId: t.type === "EQUATION" ? t.id : undefined,
    snippet: t.text,
    boundingBoxes: t.boundingBoxes,
    // Visual provenance details
    documentTitle: t.docTitle,
    page: t.page,
  }));
}
