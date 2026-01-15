'use client';

import React, { useState, useRef } from 'react';
import { uploadFile } from '@/utils/fileUtils';
import { useToast } from '@/context/ToastContext';

interface FileUploadProps {
    onUploadSuccess?: (url: string, fileName: string) => void;
    folder?: string;
    label?: string;
    accept?: string;
}

export default function FileUpload({
    onUploadSuccess,
    folder = 'general',
    label = '파일 업로드',
    accept = "*/*"
}: FileUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useToast();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 10MB 용량 제한 예시
        if (file.size > 10 * 1024 * 1024) {
            showToast('파일 크기는 10MB를 초과할 수 없습니다.', 'error');
            return;
        }

        setIsUploading(true);
        setUploadProgress(20); // 시작 시 표시

        try {
            const url = await uploadFile(file, folder);
            setUploadedUrl(url);
            setUploadProgress(100);
            showToast('파일이 성공적으로 업로드되었습니다.', 'success');

            if (onUploadSuccess) {
                onUploadSuccess(url, file.name);
            }
        } catch (error) {
            console.error(error);
            showToast('업로드 중 오류가 발생했습니다.', 'error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">
                {label}
            </label>

            <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`
          relative border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer
          flex flex-col items-center justify-center gap-2
          ${isUploading ? 'bg-gray-50 border-gray-300' : 'hover:bg-blue-50 hover:border-blue-400 border-gray-300'}
        `}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept={accept}
                    className="hidden"
                    disabled={isUploading}
                />

                {isUploading ? (
                    <div className="flex flex-col items-center">
                        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-2"></div>
                        <p className="text-sm text-gray-500 font-medium">업로드 중...</p>
                    </div>
                ) : (
                    <>
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-1">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <p className="text-sm text-gray-600">
                            클릭하여 파일을 선택하세요
                        </p>
                        <p className="text-xs text-gray-400">
                            최대 10MB까지 가능합니다
                        </p>
                    </>
                )}
            </div>

            {uploadedUrl && !isUploading && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm text-green-700 truncate">업로드 완료!</span>
                    </div>
                    <a
                        href={uploadedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-green-800 hover:underline flex-shrink-0 ml-2"
                    >
                        파일 보기
                    </a>
                </div>
            )}
        </div>
    );
}
