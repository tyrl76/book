let readingSelectionSequence = 0;

export function nextReadingSelectionRequest() {
  readingSelectionSequence += 1;
  return String(readingSelectionSequence);
}
