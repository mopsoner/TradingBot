export const fetchSymbols = async (): Promise<string[]> => {
  const response = await fetch('/api/symbols');
  return response.json();
};
