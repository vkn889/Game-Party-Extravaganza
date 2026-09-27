'use client';

import { createContext, useContext, type ReactNode } from 'react';

/** Uploads a drawing PNG and resolves with its public URL. */
export type UploadDrawing = (png: Blob) => Promise<string>;

const DrawingUploadContext = createContext<UploadDrawing | null>(null);

export function DrawingUploadProvider({ upload, children }: { upload: UploadDrawing; children: ReactNode }) {
  return <DrawingUploadContext.Provider value={upload}>{children}</DrawingUploadContext.Provider>;
}

export function useDrawingUpload(): UploadDrawing {
  const upload = useContext(DrawingUploadContext);
  if (!upload) throw new Error('useDrawingUpload must be used inside DrawingUploadProvider');
  return upload;
}
