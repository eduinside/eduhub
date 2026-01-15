import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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

/**
 * 파일을 Firebase Storage에 업로드합니다.
 * @param file 업로드할 파일 객체
 * @param folder 저장될 폴더 경로 (기본값: 'uploads')
 * @returns 업로드된 파일의 다운로드 URL
 */
export async function uploadFile(file: File, folder: string = 'uploads'): Promise<string> {
    try {
        let fileToUpload = file;

        // 이미지는 업로드 전 압축 시도
        if (file.type.startsWith('image/')) {
            fileToUpload = await compressImage(file, { maxWidth: 1200, quality: 0.8 });
        }

        // 유니크한 파일명 생성 (타임스탬프 + 원본파일명)
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const storageRef = ref(storage, `${folder}/${fileName}`);

        // 업로드
        const snapshot = await uploadBytes(storageRef, fileToUpload);

        // 다운로드 URL 반환
        return await getDownloadURL(snapshot.ref);
    } catch (error) {
        console.error("File upload error:", error);
        throw new Error("파일 업로드 중 오류가 발생했습니다.");
    }
}
