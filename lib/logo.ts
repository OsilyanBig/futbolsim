/** Logo görsellerini yükler. URL'ler CORS ile yüklenir; aksi hâlde canvas "kirlenir" ve video kaydı engellenir. */

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Lütfen bir görsel dosyası seçin (PNG, JPG, SVG, WEBP)."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Görsel okunamadı."));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}

export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const trimmed = url.trim();
    if (!/^(https?:|data:image\/)/i.test(trimmed)) {
      reject(new Error("Geçerli bir http(s) görsel adresi girin."));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error(
          "Logo yüklenemedi. Sunucu CORS izni vermiyor olabilir; görseli indirip dosya olarak yükleyin.",
        ),
      );
    img.src = trimmed;
  });
}
