export async function saveFile(file: File, id: string) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("A maximális fájlméret 20 MB.");
  if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name))
    throw new Error("PDF, PNG, JPG és WEBP tölthető fel.");
  const response = await fetch(`/api/files/${encodeURIComponent(id)}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
    },
    body: file,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "A feltöltés nem sikerült.");
  }
}
export async function downloadFile(id: string, name: string) {
  const response = await fetch(`/api/files/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "A fájl nem található.");
  }
  downloadBlob(await response.blob(), name);
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCsv(name: string, rows: (string | number)[][]) {
  const protect = (value: string | number) => {
    let s = String(value);
    if (/^[=+@\-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  downloadBlob(
    new Blob(
      ["\ufeff" + rows.map((r) => r.map(protect).join(";")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
    name,
  );
}
