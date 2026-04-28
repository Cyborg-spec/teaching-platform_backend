import { storage } from '../config/firebase';

export class UploadService {
  private bucket = storage.bucket();

  /**
   * Upload a file buffer to Firebase Storage and return the public download URL.
   */
  async uploadFile(buffer: Buffer, destinationPath: string, mimeType: string): Promise<string> {
    const file = this.bucket.file(destinationPath);

    await file.save(buffer, {
      contentType: mimeType,
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    // Make the file publicly accessible
    await file.makePublic();

    return `https://storage.googleapis.com/${this.bucket.name}/${destinationPath}?t=${Date.now()}`;
  }

  /**
   * Delete a file from Firebase Storage by its path.
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await this.bucket.file(filePath).delete();
    } catch (error) {
      // File may not exist, that's okay
      console.warn(`Failed to delete file: ${filePath}`, error);
    }
  }
}

export const uploadService = new UploadService();
