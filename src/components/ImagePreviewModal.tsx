"use client";

import { useState, useEffect } from "react";

interface ImagePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    fileName?: string;
}

export default function ImagePreviewModal({ isOpen, onClose, imageUrl, fileName }: ImagePreviewModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }
        return () => {
            document.body.style.overflow = "auto";
        };
    }, [isOpen]);

    if (!mounted || !isOpen) return null;

    return (
        <div
            className="modal-overlay"
            style={{
                zIndex: 9999,
                backgroundColor: "rgba(0, 0, 0, 0.85)",
                backdropFilter: "blur(10px)"
            }}
            onClick={onClose}
        >
            <div
                className="animate-fade"
                style={{
                    position: "relative",
                    maxWidth: "90vw",
                    maxHeight: "90vh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center"
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{
                    position: "absolute",
                    top: "-40px",
                    right: "0",
                    display: "flex",
                    gap: "1rem",
                    alignItems: "center"
                }}>
                    {fileName && <span style={{ color: "white", fontSize: "0.9rem" }}>{fileName}</span>}
                    <button
                        onClick={onClose}
                        style={{
                            background: "rgba(255, 255, 255, 0.1)",
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                            color: "white",
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            cursor: "pointer",
                            fontSize: "1.2rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                        }}
                    >
                        &times;
                    </button>
                </div>

                <img
                    src={imageUrl}
                    alt={fileName || "Image Preview"}
                    style={{
                        maxWidth: "100%",
                        maxHeight: "80vh",
                        objectFit: "contain",
                        borderRadius: "12px",
                        boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
                    }}
                />

                <div style={{ marginTop: "1.5rem" }}>
                    <a
                        href={imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary"
                        style={{ padding: "0.6rem 1.5rem", fontSize: "0.9rem" }}
                    >
                        원본 보기 / 다운로드
                    </a>
                </div>
            </div>
        </div>
    );
}
