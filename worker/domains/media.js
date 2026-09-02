const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function validateImageFile(file) {
  if (!file || typeof file !== "object" || typeof file.size !== "number" || typeof file.type !== "string") return "Missing file";
  if (!IMAGE_TYPES.has(file.type)) return "Only JPG, PNG and WEBP are allowed";
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return "Image is too large";
  return "";
}

function extensionFor(type) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

export { extensionFor, validateImageFile };
