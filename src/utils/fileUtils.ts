export async function compressImage(file: File, options: { maxWidth?: number, maxHeight?: number, quality?: number } = {}): Promise<File> {
    if (!file.type.startsWith('image/')) {
        return file;
    }

    const { maxWidth = 1920, maxHeight = 1080, quality = 0.7 } = options;

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            let width = img.width;
            let height = img.height;

            if (width > maxWidth || height > maxHeight) {
                if (width / height > maxWidth / maxHeight) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                } else {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(file); // Fallback to original
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (!blob) {
                    resolve(file);
                    return;
                }
                // If compressed file is larger, return original
                if (blob.size > file.size) {
                    resolve(file);
                    return;
                }
                const newFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now(),
                });
                resolve(newFile);
            }, 'image/jpeg', quality);
        };

        img.onerror = (err) => {
            URL.revokeObjectURL(url);
            console.error("Image compression error:", err);
            resolve(file); // Fallback
        };

        img.src = url;
    });
}
