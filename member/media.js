export const IMAGE_ERROR_MESSAGE = 'Fotku se nepodařilo zpracovat. Zkus jinou fotku nebo ji nejdřív ulož jako JPG.';

export async function compressImageBlob(file, max = 1800, quality = .82, { timeoutMs = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    let image, reader, timer, settled = false;
    const finish = (error, blob) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (image) image.onload = image.onerror = null;
      if (reader) {
        reader.onload = reader.onerror = reader.onabort = null;
        if (reader.readyState === 1) { try { reader.abort(); } catch {} }
      }
      if (error) { const failure = new Error(IMAGE_ERROR_MESSAGE); failure.cause = error; reject(failure); }
      else resolve(blob);
    };
    try {
      if (!file?.size || file.size > 12 * 1024 * 1024) throw new Error('invalid_image_input');
      image = new Image(); reader = new FileReader();
      timer = setTimeout(() => finish(new Error('image_timeout')), timeoutMs);
      reader.onerror = reader.onabort = () => finish(new Error('image_read_failed'));
      reader.onload = () => { try { image.src = reader.result; } catch (error) { finish(error); } };
      image.onerror = () => finish(new Error('image_decode_failed'));
      image.onload = () => {
        try {
          if (!image.width || !image.height) throw new Error('invalid_image_dimensions');
          const scale = Math.min(1, max / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('canvas_unavailable');
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => finish(blob ? null : new Error('image_compression_failed'), blob), 'image/jpeg', quality);
        } catch (error) { finish(error); }
      };
      reader.readAsDataURL(file);
    } catch (error) { finish(error); }
  });
}
