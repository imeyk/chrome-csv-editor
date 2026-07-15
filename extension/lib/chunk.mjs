// Split a string into <=sliceSize chunks, mirroring the editor's csvUpdate protocol.
export function partitionString(text, sliceSize) {
  if (text.length === 0) return [{ text: '', sliceNr: 1, totalSlices: 1 }];
  const totalSlices = Math.ceil(text.length / sliceSize);
  const slices = [];
  for (let i = 0; i < totalSlices; i++) {
    slices.push({
      text: text.slice(i * sliceSize, (i + 1) * sliceSize),
      sliceNr: i + 1,
      totalSlices
    });
  }
  return slices;
}

export function buildCsvUpdateMessages(text, sliceSize) {
  return partitionString(text, sliceSize).map(csvContent => ({ command: 'csvUpdate', csvContent }));
}
