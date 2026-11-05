function openFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("tessTMS-files-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onerror = () => reject(new Error("A helyi fájltár nem érhető el."));
    request.onsuccess = () => resolve(request.result);
  });
}
export async function saveFile(file: File, id: string) {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("A maximális fájlméret 20 MB.");
  if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name))
    throw new Error("PDF, PNG, JPG és WEBP tölthető fel.");
  const db = await openFiles();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(new Error("A fájlt nem sikerült helyben tárolni."));
  });
  db.close();
}
export async function downloadFile(id: string, name: string) {
  const db = await openFiles();
  const file = await new Promise<Blob | undefined>((resolve, reject) => {
    const r = db.transaction("files").objectStore("files").get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(new Error("Fájlolvasási hiba."));
  });
  db.close();
  if (!file)
    throw new Error("Ez a mintadokumentum nem tartalmaz letölthető fájlt.");
  downloadBlob(file, name);
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
