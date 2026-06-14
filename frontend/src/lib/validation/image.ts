export function validateImage(uploadedImage: string) {
  // Enforce maximum file size (5MB)
  // base64 length in bytes is roughly (len * 3) / 4
  const approxSize = (uploadedImage.length * 3) / 4;
  if (approxSize > 5 * 1024 * 1024) {
    throw new Error("Image size exceeds maximum limit of 5MB.");
  }

  // Validate MIME type
  const match = uploadedImage.match(/^data:([^;]+);base64,/);
  if (!match) {
    throw new Error("Invalid image upload format.");
  }
  const mimeType = match[1];
  const allowedMimeTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new Error("Unsupported image format. Please upload PNG, JPEG or WEBP.");
  }

  // Scan for corrupt uploads
  const base64Data = uploadedImage.split(",")[1];
  if (!base64Data || base64Data.trim() === "") {
    throw new Error("Uploaded image is corrupt or empty.");
  }
  
  return { mimeType, base64Data };
}
