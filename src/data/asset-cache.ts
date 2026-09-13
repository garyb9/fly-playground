interface AssetManifest {
  version: string;
  files: Record<string, { sha256: string; bytes: number }>;
}
let database: Promise<IDBDatabase | null> | undefined;
function openCache() {
  database ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open("fly-playground-assets", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("assets");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return database;
}
async function cached(key: string): Promise<ArrayBuffer | undefined> {
  const db = await openCache();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const r = db.transaction("assets").objectStore("assets").get(key);
      r.onsuccess = () => resolve(r.result instanceof ArrayBuffer ? r.result : undefined);
      r.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}
async function save(key: string, value: ArrayBuffer) {
  const db = await openCache();
  if (!db) return;
  try {
    const tx = db.transaction("assets", "readwrite");
    tx.objectStore("assets").put(value, key);
    tx.onerror = () => {};
  } catch {
    /* Optional cache: quota/private mode must not prevent boot. */
  }
}
export async function assetLoader(base: string) {
  const r = await fetch(base + "asset-manifest.json");
  if (!r.ok) throw new Error("MaleCNS asset manifest missing; run the data pipeline");
  const manifest = (await r.json()) as AssetManifest;
  const loader = async (name: string): Promise<Response> => {
    const meta = manifest.files[name];
    if (!meta) throw new Error(`Missing asset identity: ${name}`);
    const key = `${manifest.version}/${name}`;
    const valid = async (b: ArrayBuffer) => {
      if (b.byteLength !== meta.bytes) return false;
      const hash = await crypto.subtle.digest("SHA-256", b);
      return (
        [...new Uint8Array(hash)].map((v) => v.toString(16).padStart(2, "0")).join("") ===
        meta.sha256
      );
    };
    const existing = await cached(key);
    if (existing && (await valid(existing))) return new Response(existing);
    const response = await fetch(base + name);
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (!(await valid(bytes))) throw new Error(`MaleCNS integrity mismatch: ${name}`);
    await save(key, bytes);
    return new Response(bytes);
  };
  return Object.assign(loader, { version: manifest.version });
}
